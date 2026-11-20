const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...(init.headers || {}) }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Cloudflare Access protects this entire hostname before a request reaches
    // the Worker. Authentication policy is intentionally managed in Zero Trust,
    // not in browser JavaScript where it could be bypassed.
    if (url.pathname === "/api/release-status") {
      return json({
        name: "JoeLang Studio",
        version: "1.0",
        access: "Cloudflare Access",
        workspaceStorage: "browser-local",
        cloudSync: false
      });
    }

    if (url.pathname === "/api/session") {
      // Access attaches the verified email header before this Worker is run.
      // ctx.access is also supported for direct Access-to-Worker invocations.
      const identity = await ctx?.access?.getIdentity?.();
      const email = request.headers.get("cf-access-authenticated-user-email") || identity?.email || null;
      return json({ email }, { headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found" }, { status: 404 });
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  }
};
