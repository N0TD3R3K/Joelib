import type { Env } from "../env";
import { clearSessionCookie, getSessionUser, sessionCookie } from "../lib/auth";
import { hashPassword, hashSessionToken, randomToken, sha256, verifyPassword } from "../lib/crypto";
import { HttpError, json, readJson } from "../lib/http";
import { createId } from "../lib/ids";
import { verifyTurnstile } from "../lib/turnstile";

interface RegistrationBody {
  email?: string;
  username?: string;
  password?: string;
  inviteCode?: string;
  turnstileToken?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
  turnstileToken?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAllowedEmail(email: string, env: Env): boolean {
  const domain = email.split("@").at(-1) ?? "";
  return env.ALLOWED_EMAIL_DOMAINS.split(",")
    .map((value) => value.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean)
    .includes(domain);
}

async function sendVerificationEmail(env: Env, email: string, username: string, token: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (env.ENVIRONMENT === "production") {
      throw new HttpError(503, "EMAIL_NOT_CONFIGURED", "Verification email delivery is not configured.");
    }
    return;
  }
  const verificationUrl = `https://joese.derekli.dev/verify?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [email],
      subject: "Verify your JOESE school email",
      html: `<div style="font-family:system-ui;background:#0f1217;color:#f4f6f8;padding:32px;border-radius:16px"><h1 style="color:#f2bf56">JOESE</h1><p>Joello ${username},</p><p>Verify your school email to activate one fictional JOESE account and receive your J$10,000 starting balance.</p><p><a href="${verificationUrl}" style="background:#f2bf56;color:#111;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Verify account</a></p><p style="color:#8f99a8">JOESE is a closed simulation. J$ has no real-world value.</p></div>`,
    }),
  });
  if (!response.ok) {
    throw new HttpError(502, "EMAIL_DELIVERY_FAILED", "The verification email could not be delivered.");
  }
}

export async function handleAuth(request: Request, url: URL, env: Env): Promise<Response | null> {
  const path = url.pathname.replace(/^\/v1\/auth\/?/, "");

  if (request.method === "POST" && path === "register") {
    const body = await readJson<RegistrationBody>(request);
    const email = normalizeEmail(body.email ?? "");
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    if (!isAllowedEmail(email, env)) {
      throw new HttpError(400, "SCHOOL_EMAIL_REQUIRED", "Use an email address from an approved school domain.");
    }
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
      throw new HttpError(400, "INVALID_USERNAME", "Username must be 3–32 letters, numbers, periods, dashes, or underscores.");
    }
    if (password.length < 10 || password.length > 128) {
      throw new HttpError(400, "INVALID_PASSWORD", "Password must contain between 10 and 128 characters.");
    }
    await verifyTurnstile(request, env, body.turnstileToken, "register");

    const duplicate = await env.DB.prepare("SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1")
      .bind(email, username)
      .first();
    if (duplicate) {
      throw new HttpError(409, "ACCOUNT_EXISTS", "That school email or username already has an account.");
    }

    let inviteId: string | null = null;
    if (env.REQUIRE_INVITE === "true") {
      if (!body.inviteCode) throw new HttpError(400, "INVITE_REQUIRED", "A valid invitation is required.");
      const inviteHash = await sha256(body.inviteCode.trim());
      const invite = await env.DB.prepare(
        `SELECT id FROM invitation_codes
          WHERE code_hash = ? AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            AND used_count < max_uses LIMIT 1`,
      ).bind(inviteHash).first<{ id: string }>();
      if (!invite) throw new HttpError(400, "INVALID_INVITE", "The invitation is invalid or unavailable.");
      inviteId = invite.id;
    }

    const userId = createId("usr");
    const verificationId = createId("verify");
    const verificationToken = randomToken();
    const verificationHash = await sha256(verificationToken);
    const passwordResult = await hashPassword(password);
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        `INSERT INTO users (id, email, username, password_hash, password_salt)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(userId, email, username, passwordResult.hash, passwordResult.salt),
      env.DB.prepare(
        `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
         VALUES (?, ?, ?, ?)`,
      ).bind(verificationId, userId, verificationHash, expiresAt),
    ];
    if (inviteId) {
      statements.push(env.DB.prepare("UPDATE invitation_codes SET used_count = used_count + 1 WHERE id = ?").bind(inviteId));
    }
    try {
      await env.DB.batch(statements);
    } catch {
      throw new HttpError(409, "REGISTRATION_CONFLICT", "That account or invitation became unavailable. Try again with a different username or invitation.");
    }

    try {
      await sendVerificationEmail(env, email, username, verificationToken);
    } catch (error) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM email_verification_tokens WHERE user_id = ?").bind(userId),
        env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId),
        ...(inviteId ? [env.DB.prepare("UPDATE invitation_codes SET used_count = MAX(0, used_count - 1) WHERE id = ?").bind(inviteId)] : []),
      ]);
      throw error;
    }

    return json(
      {
        verificationRequired: true,
        email,
        ...(env.ENVIRONMENT !== "production" ? { developmentVerificationToken: verificationToken } : {}),
      },
      201,
    );
  }

  if (request.method === "POST" && path === "verify-email") {
    const body = await readJson<{ token?: string }>(request);
    if (!body.token) throw new HttpError(400, "TOKEN_REQUIRED", "Verification token is required.");
    const tokenHash = await sha256(body.token);
    const tokenRow = await env.DB.prepare(
      `SELECT evt.id AS token_id, evt.user_id, u.status
         FROM email_verification_tokens evt
         JOIN users u ON u.id = evt.user_id
        WHERE evt.token_hash = ? AND evt.consumed_at IS NULL
          AND evt.expires_at > CURRENT_TIMESTAMP LIMIT 1`,
    ).bind(tokenHash).first<{ token_id: string; user_id: string; status: string }>();
    if (!tokenRow) throw new HttpError(400, "INVALID_TOKEN", "The verification link is invalid or expired.");

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE users
            SET status = 'active', verified_at = CURRENT_TIMESTAMP,
                disposable_balance_cents = CASE WHEN verified_at IS NULL THEN 1000000 ELSE disposable_balance_cents END,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).bind(tokenRow.user_id),
      env.DB.prepare("UPDATE email_verification_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(tokenRow.token_id),
      env.DB.prepare(
        `INSERT INTO ledger_entries
          (id, user_id, entry_type, amount_cents, balance_after_cents, reference_type, reference_id)
         VALUES (?, ?, 'opening_balance', 1000000, 1000000, 'email_verification', ?)`,
      ).bind(createId("led"), tokenRow.user_id, tokenRow.token_id),
    ]);
    return json({ verified: true });
  }

  if (request.method === "POST" && path === "login") {
    const body = await readJson<LoginBody>(request);
    await verifyTurnstile(request, env, body.turnstileToken, "login");
    const email = normalizeEmail(body.email ?? "");
    const row = await env.DB.prepare(
      `SELECT id, email, username, role, status, password_hash, password_salt
         FROM users WHERE email = ? LIMIT 1`,
    ).bind(email).first<Record<string, unknown>>();
    const passwordValid = row
      ? await verifyPassword(body.password ?? "", String(row.password_salt), String(row.password_hash))
      : false;
    if (!row || !passwordValid || row.status !== "active") {
      throw new HttpError(401, "LOGIN_FAILED", "Email or password is incorrect, or the account is not active.");
    }
    const token = randomToken();
    const tokenHash = await hashSessionToken(token, env.SESSION_SECRET);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(createId("ses"), String(row.id), tokenHash, expiresAt).run();
    return json(
      { id: row.id, email: row.email, username: row.username, role: row.role },
      200,
      { "set-cookie": sessionCookie(token, env.ENVIRONMENT) },
    );
  }

  if (request.method === "POST" && path === "logout") {
    const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)joese_session=([^;]+)/)?.[1];
    if (cookie) {
      const tokenHash = await hashSessionToken(decodeURIComponent(cookie), env.SESSION_SECRET);
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    }
    return json({ signedOut: true }, 200, { "set-cookie": clearSessionCookie(env.ENVIRONMENT) });
  }

  if (request.method === "GET" && path === "me") {
    const user = await getSessionUser(request, env);
    return json({ user });
  }

  return null;
}

