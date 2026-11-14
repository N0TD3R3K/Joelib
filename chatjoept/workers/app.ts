import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env) {
    (globalThis as any).__CF_ENV__ = env;
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;
