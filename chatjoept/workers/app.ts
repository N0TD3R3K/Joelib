import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env) {
    // Permanent 301 redirect from legacy workers.dev URL to canonical custom domain when configured
    const canonicalOrigin = ((env as any).CANONICAL_ORIGIN || "").trim().replace(/\/+$/, "");
    if (canonicalOrigin) {
      try {
        const reqUrl = new URL(request.url);
        const canonicalUrl = new URL(canonicalOrigin);
        if (
          reqUrl.hostname === "chatjoept.waynexu2020.workers.dev" &&
          reqUrl.hostname !== canonicalUrl.hostname
        ) {
          const target = `${canonicalOrigin}${reqUrl.pathname}${reqUrl.search}`;
          return Response.redirect(target, 301);
        }
      } catch {
        // Ignore malformed CANONICAL_ORIGIN
      }
    }

    (globalThis as any).__CF_ENV__ = env;
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;
