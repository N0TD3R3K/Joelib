import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../workers/exchange-api/src/env";
import { getSessionUser } from "../../workers/exchange-api/src/lib/auth";
import { hashSessionToken, sha256 } from "../../workers/exchange-api/src/lib/crypto";
import { HttpError } from "../../workers/exchange-api/src/lib/http";
import { handleAuth } from "../../workers/exchange-api/src/routes/auth";
import { handleWebhooks, verifyResendWebhookSignature } from "../../workers/exchange-api/src/routes/webhooks";

type SqlValue = string | number | bigint | Uint8Array | null;

class TestStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: SqlValue[] = [],
  ) {}

  bind(...values: SqlValue[]): TestStatement {
    return new TestStatement(this.database, this.sql, values);
  }

  async first<T>(): Promise<T | null> {
    return (this.database.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[]; success: true }> {
    return { results: this.database.prepare(this.sql).all(...this.values) as T[], success: true };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    return this.runSync();
  }

  runSync(): { success: true; meta: { changes: number } } {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class TestD1 {
  readonly database = new DatabaseSync(":memory:");

  prepare(sql: string): TestStatement {
    return new TestStatement(this.database, sql);
  }

  async batch(statements: TestStatement[]): Promise<Array<{ success: true; meta: { changes: number } }>> {
    this.database.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.runSync());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

const schema = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE invitation_codes (
    id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0, expires_at TEXT, revoked_at TEXT, created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'pending_verification',
    disposable_balance_cents INTEGER NOT NULL DEFAULT 0, borrowed_principal_cents INTEGER NOT NULL DEFAULT 0,
    financial_status TEXT NOT NULL DEFAULT 'normal', financial_status_version INTEGER NOT NULL DEFAULT 0,
    preferences_json TEXT NOT NULL DEFAULT '{"growthColor":"#38d39f","fallColor":"#ff6577","compactNumbers":false}',
    registration_invitation_id TEXT REFERENCES invitation_codes(id), verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX idx_users_username_lower ON users(lower(username));
  CREATE TABLE email_verification_tokens (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, consumed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE ledger_entries (
    id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), entry_type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0, balance_after_cents INTEGER,
    reference_type TEXT NOT NULL, reference_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX idx_ledger_reference_once ON ledger_entries(user_id, entry_type, reference_type, reference_id);
  CREATE TABLE password_reset_tokens (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, consumed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE state_transition_locks (
    entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, version_key TEXT NOT NULL,
    action TEXT NOT NULL, actor_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entity_type, entity_id, version_key)
  );
  CREATE TABLE audit_log (
    id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id), action TEXT NOT NULL,
    target_type TEXT NOT NULL, target_id TEXT NOT NULL, before_json TEXT, after_json TEXT,
    request_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE transactional_emails (
    id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'resend', provider_message_id TEXT UNIQUE,
    internet_message_id TEXT, purpose TEXT NOT NULL, recipient_email TEXT NOT NULL,
    status TEXT NOT NULL, status_detail TEXT, last_event_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE auth_rate_limits (
    action TEXT NOT NULL, subject_hash TEXT NOT NULL, window_start INTEGER NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (action, subject_hash, window_start)
  );
`;

function request(path: string, body: unknown): Request {
  return new Request(`https://api.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function auth(env: Env, path: string, body: unknown): Promise<Response> {
  const incoming = request(path, body);
  const response = await handleAuth(incoming, new URL(incoming.url), env);
  if (!response) throw new Error(`No auth response for ${path}`);
  return response;
}

async function register(env: Env, suffix = "one"): Promise<string> {
  const response = await auth(env, "/v1/auth/register", {
    email: `${suffix}@hamdenhall.org`,
    username: `member-${suffix}`,
    password: "correct horse battery staple",
    inviteCode: "",
  });
  expect(response.status).toBe(201);
  const payload = await response.json() as { data: { developmentVerificationToken: string } };
  return payload.data.developmentVerificationToken;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe("registration and verification", () => {
  let d1: TestD1;
  let env: Env;

  beforeEach(() => {
    d1 = new TestD1();
    d1.database.exec(schema);
    env = {
      DB: d1 as unknown as D1Database,
      ENVIRONMENT: "test",
      ALLOWED_EMAIL_DOMAINS: "sstx.org,hamdenhall.org",
      ALLOWED_ORIGINS: "https://joese.test",
      REQUIRE_INVITE: "false",
      ENFORCE_TRADING_SCHEDULE: "false",
      RESEND_FROM_EMAIL: "JOESE <noreply@joese.test>",
      EMAIL_VERIFICATION_TTL_MINUTES: "1440",
      SESSION_SECRET: "test-session-secret",
      INTERNAL_API_KEY: "test-internal-key",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("activates a verified account and grants the opening balance exactly once", async () => {
    const token = await register(env);
    const response = await auth(env, "/v1/auth/verify-email", { token });
    expect(response.status).toBe(200);

    const user = d1.database.prepare("SELECT id, status, disposable_balance_cents, verified_at FROM users WHERE email = ?")
      .get("one@hamdenhall.org") as Record<string, unknown>;
    expect(user.status).toBe("active");
    expect(user.disposable_balance_cents).toBe(1_000_000);
    expect(user.verified_at).toBeTruthy();
    const ledger = d1.database.prepare("SELECT COUNT(*) AS count FROM ledger_entries WHERE entry_type = 'opening_balance'").get() as { count: number };
    expect(ledger.count).toBe(1);
    const activationLocks = d1.database.prepare(
      "SELECT COUNT(*) AS count FROM state_transition_locks WHERE entity_type = 'email_verification' AND entity_id = ?",
    ).get(String(user.id)) as { count: number };
    expect(activationLocks.count).toBe(1);

    await expect(auth(env, "/v1/auth/verify-email", { token }))
      .rejects.toMatchObject<Partial<HttpError>>({ code: "INVALID_TOKEN" });
  });

  it("rejects an ISO-formatted verification token after its real expiration", async () => {
    const token = await register(env, "expired");
    d1.database.prepare("UPDATE email_verification_tokens SET expires_at = ?").run(new Date(Date.now() - 60_000).toISOString());
    await expect(auth(env, "/v1/auth/verify-email", { token }))
      .rejects.toMatchObject<Partial<HttpError>>({ code: "INVALID_TOKEN" });
  });

  it("rolls back the account and invitation use when Resend rejects the verification email", async () => {
    env.REQUIRE_INVITE = "true";
    env.RESEND_API_KEY = "test-resend-key";
    const code = "rollback-invitation";
    d1.database.prepare("INSERT INTO invitation_codes (id, code_hash) VALUES (?, ?)")
      .run("invite-rollback", await sha256(code));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ message: "provider unavailable" }),
      { status: 503, headers: { "content-type": "application/json" } },
    )));

    await expect(auth(env, "/v1/auth/register", {
      email: "rollback@hamdenhall.org",
      username: "rollback-member",
      password: "correct horse battery staple",
      inviteCode: code,
    })).rejects.toMatchObject<Partial<HttpError>>({ code: "EMAIL_DELIVERY_FAILED" });

    const accountCount = d1.database.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    const invitation = d1.database.prepare("SELECT used_count FROM invitation_codes WHERE id = 'invite-rollback'").get() as { used_count: number };
    const tokenCount = d1.database.prepare("SELECT COUNT(*) AS count FROM email_verification_tokens").get() as { count: number };
    expect(accountCount.count).toBe(0);
    expect(invitation.used_count).toBe(0);
    expect(tokenCount.count).toBe(0);
  });

  it("issues a replacement link and invalidates the prior verification token", async () => {
    const oldToken = await register(env, "resend");
    d1.database.prepare("UPDATE email_verification_tokens SET created_at = datetime('now', '-2 minutes')").run();
    const response = await auth(env, "/v1/auth/resend-verification", { email: "resend@hamdenhall.org" });
    const payload = await response.json() as { data: { developmentVerificationToken: string } };
    expect(payload.data.developmentVerificationToken).toBeTruthy();
    expect(payload.data.developmentVerificationToken).not.toBe(oldToken);
    const oldRow = d1.database.prepare("SELECT consumed_at FROM email_verification_tokens ORDER BY created_at LIMIT 1").get() as { consumed_at: string | null };
    expect(oldRow.consumed_at).toBeTruthy();
    await expect(auth(env, "/v1/auth/verify-email", { token: oldToken }))
      .rejects.toMatchObject<Partial<HttpError>>({ code: "INVALID_TOKEN" });
    expect((await auth(env, "/v1/auth/verify-email", { token: payload.data.developmentVerificationToken })).status).toBe(200);
  });

  it("rejects an expired ISO invitation and accepts a future one", async () => {
    env.REQUIRE_INVITE = "true";
    const code = "test-invitation";
    d1.database.prepare("INSERT INTO invitation_codes (id, code_hash, expires_at) VALUES (?, ?, ?)")
      .run("invite-expired", await sha256(code), new Date(Date.now() - 60_000).toISOString());
    await expect(auth(env, "/v1/auth/register", {
      email: "invite@hamdenhall.org", username: "invite-member", password: "correct horse battery staple", inviteCode: code,
    })).rejects.toMatchObject<Partial<HttpError>>({ code: "INVALID_INVITE" });
    d1.database.prepare("UPDATE invitation_codes SET expires_at = ? WHERE id = ?")
      .run(new Date(Date.now() + 60_000).toISOString(), "invite-expired");
    expect((await auth(env, "/v1/auth/register", {
      email: "invite@hamdenhall.org", username: "invite-member", password: "correct horse battery staple", inviteCode: code,
    })).status).toBe(201);
  });

  it("rejects expired ISO password-reset tokens", async () => {
    await register(env, "reset");
    const user = d1.database.prepare("SELECT id FROM users WHERE email = ?").get("reset@hamdenhall.org") as { id: string };
    d1.database.prepare("UPDATE users SET status = 'active', verified_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
    const response = await auth(env, "/v1/auth/request-password-reset", { email: "reset@hamdenhall.org" });
    const payload = await response.json() as { data: { developmentResetToken: string } };
    d1.database.prepare("UPDATE password_reset_tokens SET expires_at = ?").run(new Date(Date.now() - 60_000).toISOString());
    await expect(auth(env, "/v1/auth/reset-password", {
      token: payload.data.developmentResetToken, password: "a new correct horse battery staple",
    })).rejects.toMatchObject<Partial<HttpError>>({ code: "INVALID_RESET" });
  });

  it("rejects an expired ISO session", async () => {
    const userId = "usr-session";
    d1.database.prepare(
      "INSERT INTO users (id, email, username, password_hash, password_salt, status, verified_at) VALUES (?, ?, ?, 'hash', 'salt', 'active', CURRENT_TIMESTAMP)",
    ).run(userId, "session@hamdenhall.org", "session-member");
    const token = "session-token";
    const tokenHash = await hashSessionToken(token, env.SESSION_SECRET);
    d1.database.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ('ses-one', ?, ?, ?)")
      .run(userId, tokenHash, new Date(Date.now() - 60_000).toISOString());
    expect(await getSessionUser(new Request("https://api.test/v1/auth/me", { headers: { cookie: `joese_session=${token}` } }), env)).toBeNull();
    d1.database.prepare("UPDATE sessions SET expires_at = ?").run(new Date(Date.now() + 60_000).toISOString());
    expect((await getSessionUser(new Request("https://api.test/v1/auth/me", { headers: { cookie: `joese_session=${token}` } }), env))?.id).toBe(userId);
  });

  it("verifies and applies signed Resend delivery webhooks", async () => {
    const secretBytes = crypto.getRandomValues(new Uint8Array(32));
    const webhookSecret = `whsec_${bytesToBase64(secretBytes)}`;
    env.RESEND_WEBHOOK_SECRET = webhookSecret;
    d1.database.prepare(
      "INSERT INTO transactional_emails (id, provider_message_id, purpose, recipient_email, status) VALUES ('mail-one', 'resend-one', 'unknown', 'one@hamdenhall.org', 'accepted')",
    ).run();
    const timestamp = Math.floor(Date.now() / 1000);
    const webhookId = "msg_test_webhook";
    const body = JSON.stringify({
      type: "email.delivered",
      created_at: new Date().toISOString(),
      data: { email_id: "resend-one", message_id: "<message@joese.test>", to: ["one@hamdenhall.org"] },
    });
    const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = bytesToBase64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${webhookId}.${timestamp}.${body}`))));
    const headers = { id: webhookId, timestamp: String(timestamp), signature: `v1,${signature}` };
    expect(await verifyResendWebhookSignature(body, headers, webhookSecret, timestamp)).toBe(true);
    expect(await verifyResendWebhookSignature(`${body} `, headers, webhookSecret, timestamp)).toBe(false);

    const incoming = new Request("https://api.test/v1/webhooks/resend", {
      method: "POST",
      headers: { "svix-id": webhookId, "svix-timestamp": String(timestamp), "svix-signature": `v1,${signature}` },
      body,
    });
    const response = await handleWebhooks(incoming, new URL(incoming.url), env);
    expect(response?.status).toBe(200);
    const delivery = d1.database.prepare("SELECT status, internet_message_id FROM transactional_emails WHERE provider_message_id = 'resend-one'").get() as Record<string, unknown>;
    expect(delivery.status).toBe("delivered");
    expect(delivery.internet_message_id).toBe("<message@joese.test>");
  });
});
