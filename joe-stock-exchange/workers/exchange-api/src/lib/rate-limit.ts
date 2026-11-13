import type { Env } from "../env";
import { sha256 } from "./crypto";

export async function consumeNetworkRateLimit(
  request: Request,
  env: Env,
  action: string,
  maximum: number,
  windowSeconds = 3600,
): Promise<boolean> {
  const networkIdentity = request.headers.get("cf-connecting-ip") ?? "unknown";
  const subjectHash = await sha256(`${env.SESSION_SECRET}:${action}:${networkIdentity}`);
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO auth_rate_limits (action, subject_hash, window_start, request_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(action, subject_hash, window_start) DO UPDATE SET
         request_count = auth_rate_limits.request_count + 1,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(action, subjectHash, windowStart),
    env.DB.prepare("DELETE FROM auth_rate_limits WHERE window_start < ?").bind(windowStart - windowSeconds * 48),
  ]);
  const row = await env.DB.prepare(
    "SELECT request_count FROM auth_rate_limits WHERE action = ? AND subject_hash = ? AND window_start = ?",
  ).bind(action, subjectHash, windowStart).first<{ request_count: number }>();
  return Number(row?.request_count ?? maximum + 1) <= maximum;
}
