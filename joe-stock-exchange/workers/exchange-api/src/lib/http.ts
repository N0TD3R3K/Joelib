import type { Env } from "../env";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify({ data }), { status, headers: responseHeaders });
}

export function problem(status: number, code: string, message: string, requestId?: string): Response {
  return new Response(JSON.stringify({ error: { code, message, requestId } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new HttpError(415, "CONTENT_TYPE_REQUIRED", "Use application/json for this request.");
  }
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "The request body is not valid JSON.");
  }
}

export function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-credentials", "true");
    headers.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
    headers.set("access-control-allow-headers", "content-type,x-request-id,x-internal-api-key");
    headers.set("access-control-max-age", "86400");
  }
  return headers;
}

export function applyCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(request, env)) headers.set(key, value);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "same-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function exactPath(url: URL, prefix: string): string | null {
  if (!url.pathname.startsWith(prefix)) return null;
  return url.pathname.slice(prefix.length).replace(/^\//, "");
}

