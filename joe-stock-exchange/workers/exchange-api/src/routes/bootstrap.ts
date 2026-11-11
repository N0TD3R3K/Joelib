import type { Env } from "../env";
import { hashPassword } from "../lib/crypto";
import { HttpError, json, readJson } from "../lib/http";
import { createId } from "../lib/ids";

export async function handleBootstrap(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (url.pathname !== "/v1/internal/bootstrap-admin" || request.method !== "POST") return null;
  if (!env.INTERNAL_API_KEY || request.headers.get("x-internal-api-key") !== env.INTERNAL_API_KEY) {
    throw new HttpError(401, "INTERNAL_AUTH_REQUIRED", "A valid internal bootstrap key is required.");
  }
  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE role = 'administrator' LIMIT 1",
  ).first();
  if (existing) {
    throw new HttpError(409, "BOOTSTRAP_COMPLETE", "An administrator already exists; bootstrap is permanently closed.");
  }
  const body = await readJson<{ email?: string; username?: string; password?: string }>(request);
  const email = (body.email ?? "").trim().toLowerCase();
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const domain = email.split("@").at(-1) ?? "";
  const allowedDomains = env.ALLOWED_EMAIL_DOMAINS.split(",").map((value) => value.trim().toLowerCase().replace(/^@/, ""));
  if (!allowedDomains.includes(domain)) {
    throw new HttpError(400, "SCHOOL_EMAIL_REQUIRED", "The bootstrap administrator must use an approved school email.");
  }
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username) || password.length < 14 || password.length > 128) {
    throw new HttpError(400, "INVALID_BOOTSTRAP_ACCOUNT", "Use a valid username and a password of at least 14 characters.");
  }
  const passwordResult = await hashPassword(password);
  const userId = createId("usr");
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO system_locks (lock_key) VALUES ('administrator_bootstrap')"),
      env.DB.prepare(
        `INSERT INTO users
          (id, email, username, password_hash, password_salt, role, status, verified_at)
         VALUES (?, ?, ?, ?, ?, 'administrator', 'active', CURRENT_TIMESTAMP)`,
      ).bind(userId, email, username, passwordResult.hash, passwordResult.salt),
      env.DB.prepare(
        `INSERT INTO audit_log
          (id, actor_user_id, action, target_type, target_id, after_json, request_id)
         VALUES (?, NULL, 'system.bootstrap_administrator', 'user', ?, ?, ?)`,
      ).bind(
        createId("audit"), userId, JSON.stringify({ email, username, role: "administrator" }),
        request.headers.get("x-request-id"),
      ),
    ]);
  } catch {
    throw new HttpError(409, "BOOTSTRAP_CONFLICT", "The bootstrap account could not be created or another bootstrap completed first.");
  }
  return json({ id: userId, email, username, role: "administrator" }, 201);
}
