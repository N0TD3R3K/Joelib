import type { Env } from "./env";
import { runScheduledTick } from "./scheduled-tick";

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const outcome = await runScheduledTick(env, new Date(controller.scheduledTime));
    console.log("JOESE market tick", outcome);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return response({ service: "joese-market-engine", status: "ok", time: new Date().toISOString() });
    }
    if (request.method === "POST" && url.pathname === "/run") {
      if (request.headers.get("x-internal-api-key") !== env.INTERNAL_API_KEY) {
        return response({ error: "Unauthorized" }, 401);
      }
      const body = await request.json<{ scheduledAt?: string; force?: boolean }>()
        .catch((): { scheduledAt?: string; force?: boolean } => ({}));
      const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
      if (Number.isNaN(scheduledAt.getTime())) return response({ error: "Invalid scheduledAt" }, 400);
      return response(await runScheduledTick(env, scheduledAt, body.force === true));
    }
    return response({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

