import type { Env } from "../env";
import { randomToken, sha256 } from "./crypto";
import { sendTransactionalEmail } from "./email";
import { createId } from "./ids";

export interface VerificationAccount {
  id: string;
  email: string;
  username: string;
}

function verificationTtlMinutes(env: Env): number {
  const configured = Number(env.EMAIL_VERIFICATION_TTL_MINUTES ?? 1440);
  if (!Number.isSafeInteger(configured)) return 1440;
  return Math.min(10_080, Math.max(30, configured));
}

function verificationWindowLabel(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minutes`;
}

export async function verificationRecentlyIssued(env: Env, userId: string, cooldownSeconds = 60): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM email_verification_tokens
      WHERE user_id = ?
        AND unixepoch(created_at) > unixepoch('now', ?)
      ORDER BY created_at DESC LIMIT 1`,
  ).bind(userId, `-${cooldownSeconds} seconds`).first<{ id: string }>();
  return Boolean(row);
}

export async function issueVerificationEmail(
  env: Env,
  account: VerificationAccount,
): Promise<{ token: string; tokenId: string; expiresAt: string }> {
  const token = randomToken();
  const tokenId = createId("verify");
  const ttlMinutes = verificationTtlMinutes(env);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const verificationUrl = `https://joese.derekli.dev/verify?token=${encodeURIComponent(token)}`;
  const windowLabel = verificationWindowLabel(ttlMinutes);

  await env.DB.prepare(
    `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(tokenId, account.id, await sha256(token), expiresAt).run();

  try {
    await sendTransactionalEmail(env, {
      userId: account.id,
      purpose: "verification",
      to: account.email,
      subject: "Verify your JOESE school email",
      html: `<div style="font-family:system-ui;background:#0f1217;color:#f4f6f8;padding:32px;border-radius:16px"><h1 style="color:#f2bf56">JOESE</h1><p>Joello ${account.username},</p><p>Verify your school email to activate one fictional JOESE account and receive your J$10,000 starting balance.</p><p><a href="${verificationUrl}" style="background:#f2bf56;color:#111;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Verify account</a></p><p style="color:#8f99a8">This single-use link expires in ${windowLabel}. JOESE is a closed simulation; J$ has no real-world value.</p></div>`,
      text: `Joello ${account.username},\n\nVerify your JOESE school email and activate your fictional account:\n${verificationUrl}\n\nThis single-use link expires in ${windowLabel}. J$ has no real-world value.`,
    });
  } catch (error) {
    await env.DB.prepare("DELETE FROM email_verification_tokens WHERE id = ?").bind(tokenId).run();
    throw error;
  }

  try {
    await env.DB.prepare(
      `UPDATE email_verification_tokens
          SET consumed_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND id <> ? AND consumed_at IS NULL`,
    ).bind(account.id, tokenId).run();
  } catch (error) {
    // The accepted new link must remain usable even if cleanup of an older link needs a retry.
    console.error("Older verification tokens could not be invalidated", { userId: account.id, tokenId, error });
  }

  return { token, tokenId, expiresAt };
}
