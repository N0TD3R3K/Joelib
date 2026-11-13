import type { Env } from "./env";
import { applyCors, corsHeaders, HttpError, json, problem } from "./lib/http";
import { openApiDocument } from "./openapi";
import { handleAuth } from "./routes/auth";
import { handleBootstrap } from "./routes/bootstrap";
import { handleMarket } from "./routes/market";
import { handleJoeBank } from "./routes/joe-bank";
import { handleOperations } from "./routes/operations";
import { handlePortfolio } from "./routes/portfolio";
import { handleTrades } from "./routes/trades";
import { handleWebhooks } from "./routes/webhooks";

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
    if (origin && !allowedOrigins.includes(origin)) {
      throw new HttpError(403, "ORIGIN_NOT_ALLOWED", "This write request did not come from an approved JOESE application.");
    }
  }
  if (request.method === "GET" && url.pathname === "/v1/health") {
    const database = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return json({ service: "joese-exchange-api", status: database?.ok === 1 ? "ok" : "degraded", time: new Date().toISOString() });
  }
  if (request.method === "GET" && url.pathname === "/v1/openapi.json") {
    return json(openApiDocument);
  }

  const handlers = [handleWebhooks, handleBootstrap, handleAuth, handleMarket, handlePortfolio, handleJoeBank, handleTrades, handleOperations];
  for (const handler of handlers) {
    const response = await handler(request, url, env);
    if (response) return response;
  }
  return problem(404, "NOT_FOUND", "The requested JOESE API route does not exist.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      const response = await route(request, env);
      const headers = new Headers(response.headers);
      headers.set("x-request-id", requestId);
      return applyCors(new Response(response.body, { status: response.status, headers }), request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return applyCors(problem(error.status, error.code, error.message, requestId), request, env);
      }
      console.error("JOESE API request failed", { requestId, error });
      return applyCors(problem(500, "INTERNAL_ERROR", "The JOESE API could not complete the request.", requestId), request, env);
    }
  },
} satisfies ExportedHandler<Env>;

