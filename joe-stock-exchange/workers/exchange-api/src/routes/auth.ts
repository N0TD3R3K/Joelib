import type { Env } from "../env";
import { clearSessionCookie, getSessionUser, sessionCookie } from "../lib/auth";
import { hashPassword, hashSessionToken, randomToken, sha256, verifyPassword } from "../lib/crypto";
import { sendTransactionalEmail } from "../lib/email";
import { HttpError, json, readJson } from "../lib/http";
import { createId } from "../lib/ids";
import { consumeNetworkRateLimit } from "../lib/rate-limit";
import { verifyTurnstile } from "../lib/turnstile";
import { issueVerificationEmail, verificationRecentlyIssued } from "../lib/verification";

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

async function sendPasswordResetEmail(env: Env, userId: string, email: string, username: string, token: string): Promise<void> {
  const resetUrl = `https://joese.derekli.dev/reset-password?token=${encodeURIComponent(token)}`;
  await sendTransactionalEmail(env, {
    userId,
    purpose: "password_reset",
    to: email,
    subject: "Reset your JOESE password",
    html: `<div style="font-family:system-ui;background:#0f1217;color:#f4f6f8;padding:32px;border-radius:16px"><h1 style="color:#f2bf56">JOESE</h1><p>Joello ${username},</p><p>A password reset was requested for your fictional JOESE account. This link expires in 15 minutes and works once.</p><p><a href="${resetUrl}" style="background:#f2bf56;color:#111;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Reset password</a></p><p style="color:#8f99a8">If you did not request this, you can ignore this message.</p></div>`,
    text: `Joello ${username},\n\nReset your JOESE password using this single-use link:\n${resetUrl}\n\nThe link expires in 15 minutes. If you did not request this, ignore this message.`,
  });
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
            AND (expires_at IS NULL OR unixepoch(expires_at) > unixepoch())
            AND used_count < max_uses LIMIT 1`,
      ).bind(inviteHash).first<{ id: string }>();
      if (!invite) throw new HttpError(400, "INVALID_INVITE", "The invitation is invalid or unavailable.");
      inviteId = invite.id;
    }

    const userId = createId("usr");
    const passwordResult = await hashPassword(password);
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        `INSERT INTO users
          (id, email, username, password_hash, password_salt, registration_invitation_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(userId, email, username, passwordResult.hash, passwordResult.salt, inviteId),
    ];
    if (inviteId) {
      statements.push(env.DB.prepare("UPDATE invitation_codes SET used_count = used_count + 1 WHERE id = ?").bind(inviteId));
    }
    try {
      await env.DB.batch(statements);
    } catch {
      throw new HttpError(409, "REGISTRATION_CONFLICT", "That account or invitation became unavailable. Try again with a different username or invitation.");
    }

    let verificationToken: string;
    try {
      const issued = await issueVerificationEmail(env, { id: userId, email, username });
      verificationToken = issued.token;
    } catch (error) {
      await env.DB.batch([
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

  if (request.method === "POST" && path === "resend-verification") {
    const body = await readJson<{ email?: string; turnstileToken?: string }>(request);
    await verifyTurnstile(request, env, body.turnstileToken, "recovery");
    const email = normalizeEmail(body.email ?? "");
    const response: { message: string; developmentVerificationToken?: string } = {
      message: "If a pending account uses that email, a fresh verification link will be sent.",
    };
    if (!await consumeNetworkRateLimit(request, env, "verification_resend", 10)) return json(response);
    if (!isAllowedEmail(email, env)) return json(response);

    const user = await env.DB.prepare(
      `SELECT id, email, username FROM users
        WHERE email = ? AND status = 'pending_verification' LIMIT 1`,
    ).bind(email).first<{ id: string; email: string; username: string }>();
    if (!user || await verificationRecentlyIssued(env, user.id)) return json(response);

    try {
      const issued = await issueVerificationEmail(env, user);
      if (env.ENVIRONMENT !== "production") response.developmentVerificationToken = issued.token;
    } catch (error) {
      console.error("Verification resend failed", { userId: user.id, error });
    }
    return json(response);
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
          AND unixepoch(evt.expires_at) > unixepoch()
          AND u.status = 'pending_verification' LIMIT 1`,
    ).bind(tokenHash).first<{ token_id: string; user_id: string; status: string }>();
    if (!tokenRow) throw new HttpError(400, "INVALID_TOKEN", "The verification link is invalid or expired.");

    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO state_transition_locks
            (entity_type, entity_id, version_key, action, actor_id)
           VALUES ('email_verification', ?, 'initial_activation', 'consume', ?)`,
        ).bind(tokenRow.user_id, tokenRow.user_id),
        env.DB.prepare(
          `UPDATE users
              SET status = 'active', verified_at = CURRENT_TIMESTAMP,
                  disposable_balance_cents = CASE WHEN verified_at IS NULL THEN 1000000 ELSE disposable_balance_cents END,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'pending_verification'`,
        ).bind(tokenRow.user_id),
        env.DB.prepare(
          "UPDATE email_verification_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND consumed_at IS NULL",
        ).bind(tokenRow.token_id),
        env.DB.prepare(
          `INSERT INTO ledger_entries
            (id, user_id, entry_type, amount_cents, balance_after_cents, reference_type, reference_id)
           VALUES (?, ?, 'opening_balance', 1000000, 1000000, 'email_verification', ?)`,
        ).bind(createId("led"), tokenRow.user_id, tokenRow.token_id),
      ]);
    } catch {
      throw new HttpError(400, "INVALID_TOKEN", "The verification link is invalid or has already been used.");
    }
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

  if (request.method === "POST" && path === "request-password-reset") {
    const body = await readJson<{ email?: string; turnstileToken?: string }>(request);
    await verifyTurnstile(request, env, body.turnstileToken, "recovery");
    const email = normalizeEmail(body.email ?? "");
    const user = await env.DB.prepare(
      "SELECT id, username FROM users WHERE email = ? AND status = 'active' LIMIT 1",
    ).bind(email).first<{ id: string; username: string }>();
    let developmentResetToken: string | undefined;
    if (user) {
      const token = randomToken();
      const tokenHash = await sha256(token);
      const tokenId = createId("reset");
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND consumed_at IS NULL",
        ).bind(user.id),
        env.DB.prepare(
          "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
        ).bind(tokenId, user.id, tokenHash, expiresAt),
      ]);
      try {
        await sendPasswordResetEmail(env, user.id, email, user.username, token);
        if (env.ENVIRONMENT !== "production") developmentResetToken = token;
      } catch (error) {
        await env.DB.prepare("DELETE FROM password_reset_tokens WHERE id = ?").bind(tokenId).run();
        console.error("Password-reset delivery failed", { userId: user.id, error });
      }
    }
    return json({
      message: "If an active account uses that email, a short-lived reset link will be sent.",
      ...(developmentResetToken ? { developmentResetToken } : {}),
    });
  }

  if (request.method === "POST" && path === "reset-password") {
    const body = await readJson<{ token?: string; password?: string; turnstileToken?: string }>(request);
    await verifyTurnstile(request, env, body.turnstileToken, "recovery");
    const password = body.password ?? "";
    if (!body.token || password.length < 10 || password.length > 128) {
      throw new HttpError(400, "INVALID_RESET", "Use a valid reset link and a password of 10–128 characters.");
    }
    const tokenHash = await sha256(body.token);
    const token = await env.DB.prepare(
      `SELECT prt.id, prt.user_id
         FROM password_reset_tokens prt JOIN users u ON u.id = prt.user_id
        WHERE prt.token_hash = ? AND prt.consumed_at IS NULL
          AND unixepoch(prt.expires_at) > unixepoch() AND u.status = 'active' LIMIT 1`,
    ).bind(tokenHash).first<{ id: string; user_id: string }>();
    if (!token) throw new HttpError(400, "INVALID_RESET", "The reset link is invalid or expired.");
    const passwordResult = await hashPassword(password);
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO state_transition_locks (entity_type, entity_id, version_key, action, actor_id)
           VALUES ('password_reset', ?, 'pending', 'consume', ?)`,
        ).bind(token.id, token.user_id),
        env.DB.prepare(
          "UPDATE users SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(passwordResult.hash, passwordResult.salt, token.user_id),
        env.DB.prepare(
          "UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND consumed_at IS NULL",
        ).bind(token.id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(token.user_id),
        env.DB.prepare(
          `INSERT INTO audit_log
            (id, actor_user_id, action, target_type, target_id, after_json, request_id)
           VALUES (?, ?, 'auth.password_reset', 'user', ?, '{"sessionsRevoked":true}', ?)`,
        ).bind(createId("audit"), token.user_id, token.user_id, request.headers.get("x-request-id")),
      ]);
    } catch {
      throw new HttpError(400, "INVALID_RESET", "The reset link has already been used.");
    }
    return json({ reset: true, sessionsRevoked: true });
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

