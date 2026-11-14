import type { ActionFunctionArgs } from "react-router";
import { JOEGLISH_SYSTEM_PROMPT, generateJoeglishFallback } from "~/utils/joeglish";
import { getAuthenticatedUser, getEnv } from "~/utils/auth.server";
import {
  ensureUserExists,
  checkUser24hAllowed,
  calculateCostCny,
  recordUserUsage,
  getRemainingDialogBytesBudget,
  utf8ByteLength,
} from "~/utils/db.server";
import { getChatToolDefinitions, executeChatTool } from "~/utils/tools.server";

function sseNoticeResponse(message: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content: message } }] })}\n\n`
        )
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

function sanitizeUpstreamError(status: number, errText: string): string {
  let parsedError = errText;
  try {
    const parsed = JSON.parse(errText);
    parsedError = parsed.error?.message || errText;
  } catch {
    // Keep raw text
  }
  const cleanError = String(parsedError)
    .replace(/https?:\/\/[^\s]+/g, "")
    .replace(/openai/gi, "ChatJoePT")
    .replace(/deepseek/gi, "ChatJoePT")
    .trim();
  return `[ChatJoePT Error ${status}]: ${cleanError}`;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const env = getEnv();
  const session = await getAuthenticatedUser(request, env);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserExists(session, env);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    dialogId,
    existingDialogBytes = 0,
    messages = [],
    webSearch = false,
    model: clientModel,
  } = body;

  // 1. Enforce 24-hour usage limit per account (2.00 CNY cap)
  const { allowed } = await checkUser24hAllowed(session.sub, env);
  if (!allowed) {
    return sseNoticeResponse(
      `[ChatJoePT Notice]: 24-hour usage capacity has been reached for this account. Please wait for your daily quota to refresh.`
    );
  }

  // 2. Enforce Storage Soft Limit (16,000) & Hard Limit (16,384)
  const budget = await getRemainingDialogBytesBudget(session.sub, dialogId, env);
  if (budget.isSoftLimited) {
    return sseNoticeResponse(
      `[ChatJoePT Notice]: Storage soft limit reached. Please delete older chats or shared links in Settings before sending new prompts.`
    );
  }

  // Max generated output bytes allowed before hitting the 16,384 hard ceiling
  const maxOutputBytesBudget = Math.max(
    0,
    budget.remainingBytesForDialog - Number(existingDialogBytes || 0) - 128
  );

  // Server-only provider credentials & endpoint
  const apiKey = (env.LLM_API_KEY || "").trim();
  const rawBaseUrl = (env.LLM_API_URL || "https://api.deepseek.com").trim();
  const baseUrl = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

  const requestedModel = (clientModel || "jpt-6.1-sol").toLowerCase();
  const targetModel = (env.LLM_BASE_MODEL || "deepseek-chat").trim();

  let systemPrompt = JOEGLISH_SYSTEM_PROMPT;
  if (requestedModel === "jpt-6.1-sol") {
    systemPrompt += `\n\n[Mode: JPT-6.1 Sol]: Apply thorough, step-by-step analysis and clear mathematical rigor when appropriate.`;
  } else if (requestedModel === "jpt-6.1-terra") {
    systemPrompt += `\n\n[Mode: JPT-6.1 Terra]: Deliver concise, direct, grounded responses.`;
  }

  if (webSearch) {
    systemPrompt += `\n\n[Web Search Enabled]: Live web search (\`deepseek_search\`) and URL reading (\`deepseek_fetch\`) tools are enabled. Use them whenever up-to-date facts, external webpages, or verification are helpful, and include cited URLs.`;
  }

  const lastUserQuestion =
    [...messages].reverse().find((m: any) => m.role === "user")?.content || "";

  // Case 1: No API key configured -> Demo fallback
  if (!apiKey) {
    const fullResponse = generateJoeglishFallback(lastUserQuestion || "Joello!");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const tokens = fullResponse.split(/(?<=\s|[\n.,!?:;])/);
        let bytesSoFar = 0;
        for (const token of tokens) {
          const tokenBytes = utf8ByteLength(token);
          if (bytesSoFar + tokenBytes > maxOutputBytesBudget) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [{ delta: { content: "\n\n*[Truncated: storage hard limit reached]*" } }],
                })}\n\n`
              )
            );
            break;
          }
          bytesSoFar += tokenBytes;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`
            )
          );
          await new Promise((r) => setTimeout(r, 15));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Case 2: Live DeepSeek streaming + agentic tool loop (Search, Fetch, Joelib)
  const tools = getChatToolDefinitions(Boolean(webSearch));
  const conversationMessages: any[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m: any) => ({ role: m.role, content: m.content })),
  ];

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let emittedContentBytes = 0;
      let totalCostCny = 0;
      let totalTokensUsed = 0;
      let usageRecorded = false;
      let hardLimitStopped = false;

      try {
        const maxToolRounds = 4;

        for (let round = 0; round < maxToolRounds; round++) {
          const upstreamAbort = new AbortController();
          const payload: Record<string, any> = {
            model: targetModel,
            messages: conversationMessages,
            stream: true,
            stream_options: { include_usage: true },
            tools,
            tool_choice: "auto",
          };

          const upstreamRes = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: upstreamAbort.signal,
          });

          if (!upstreamRes.ok || !upstreamRes.body) {
            const errText = await upstreamRes.text().catch(() => "Upstream failure");
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [{ delta: { content: sanitizeUpstreamError(upstreamRes.status, errText) } }],
                })}\n\n`
              )
            );
            break;
          }

          const reader = upstreamRes.body.getReader();
          let lineBuffer = "";
          let assistantRoundText = "";
          const toolCallMap = new Map<
            number,
            { id: string; type: "function"; function: { name: string; arguments: string } }
          >();

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            lineBuffer += decoder.decode(value, { stream: true });
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const dataStr = trimmed.slice(5).trim();
              if (dataStr === "[DONE]") continue;

              let parsed: any;
              try {
                parsed = JSON.parse(dataStr);
              } catch {
                continue;
              }

              if (parsed.usage) {
                usageRecorded = true;
                totalCostCny += calculateCostCny({
                  promptTokens: parsed.usage.prompt_tokens,
                  completionTokens: parsed.usage.completion_tokens,
                  promptCacheHitTokens: parsed.usage.prompt_cache_hit_tokens,
                  promptCacheMissTokens: parsed.usage.prompt_cache_miss_tokens,
                });
                totalTokensUsed += parsed.usage.total_tokens || 0;
              }

              const delta = parsed.choices?.[0]?.delta;
              if (!delta) continue;

              // Accumulate any tool call deltas
              if (Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const idx = typeof tc.index === "number" ? tc.index : 0;
                  const existing = toolCallMap.get(idx) || {
                    id: tc.id || `call_${idx}_${Date.now()}`,
                    type: "function" as const,
                    function: { name: "", arguments: "" },
                  };
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.function.name += tc.function.name;
                  if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                  toolCallMap.set(idx, existing);
                }
              }

              // Forward reasoning / text chunks while enforcing hard storage byte budget
              const contentChunk = delta.content || "";
              const reasoningChunk = delta.reasoning_content || "";
              if (contentChunk || reasoningChunk) {
                const chunkBytes =
                  utf8ByteLength(contentChunk) + utf8ByteLength(reasoningChunk);

                if (emittedContentBytes + chunkBytes > maxOutputBytesBudget) {
                  hardLimitStopped = true;
                  upstreamAbort.abort();
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        choices: [
                          {
                            delta: {
                              content:
                                "\n\n*[ChatJoePT Notice: Storage hard limit reached. Generation stopped and truncated.]*",
                            },
                          },
                        ],
                        chatjoept_truncated: true,
                      })}\n\n`
                    )
                  );
                  break;
                }

                emittedContentBytes += chunkBytes;
                assistantRoundText += contentChunk;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      choices: [
                        {
                          delta: {
                            ...(contentChunk ? { content: contentChunk } : {}),
                            ...(reasoningChunk ? { reasoning_content: reasoningChunk } : {}),
                          },
                        },
                      ],
                    })}\n\n`
                  )
                );
              }
            }

            if (hardLimitStopped) break;
          }

          if (hardLimitStopped) break;

          const pendingCalls = Array.from(toolCallMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, call]) => call)
            .filter((call) => call.function.name);

          if (pendingCalls.length === 0) {
            break; // Normal completion, no more tools requested
          }

          // Emit tool status event so UI can render search/reference pills cleanly
          const toolNames = pendingCalls.map((c) => c.function.name);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ chatjoept_tools: toolNames })}\n\n`
            )
          );

          // Append assistant tool_calls turn and execute all requested tools
          conversationMessages.push({
            role: "assistant",
            content: assistantRoundText || null,
            tool_calls: pendingCalls,
          });

          const toolResults = await Promise.all(
            pendingCalls.map(async (call) => {
              const output = await executeChatTool(
                call.function.name,
                call.function.arguments,
                {
                  apiKey,
                  baseUrl,
                  userQuestion: lastUserQuestion,
                }
              );
              return {
                role: "tool",
                tool_call_id: call.id,
                content: output,
              };
            })
          );

          conversationMessages.push(...toolResults);
        }

        if (!usageRecorded) {
          totalCostCny = calculateCostCny({
            promptTokens: 800,
            completionTokens: 400,
          });
          totalTokensUsed = 1200;
        }

        if (totalCostCny > 0) {
          await recordUserUsage(session.sub, totalCostCny, totalTokensUsed, env).catch(
            console.error
          );
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                choices: [{ delta: { content: `[Connection Exception]: ${err?.message || "stream error"}` } }],
              })}\n\n`
            )
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
