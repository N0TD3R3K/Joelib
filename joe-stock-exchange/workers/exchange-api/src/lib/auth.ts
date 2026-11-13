import type { UserPreferences } from "@joese/contracts";
import type { Env } from "../env";
import { hashSessionToken } from "./crypto";
import { HttpError } from "./http";

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  role: "member" | "operator" | "administrator";
  status: string;
  disposableBalanceCents: number;
  borrowedPrincipalCents: number;
  financialStatus: "normal" | "bankrupt";
  financialStatusVersion: number;
  preferences: UserPreferences;
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const entry of cookie.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function sessionCookie(token: string, environment: string, maxAge = 60 * 60 * 24 * 30): string {
  const secure = environment === "production" ? "; Secure" : "";
  return `joese_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(environment: string): string {
  return sessionCookie("", environment, 0);
}

export async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = cookieValue(request, "joese_session");
  if (!token) return null;
  const tokenHash = await hashSessionToken(token, env.SESSION_SECRET);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.username, u.role, u.status,
            u.disposable_balance_cents, u.borrowed_principal_cents, u.financial_status,
            u.financial_status_version, u.preferences_json
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND unixepoch(s.expires_at) > unixepoch()
      LIMIT 1`,
  ).bind(tokenHash).first<Record<string, unknown>>();
  if (!row) return null;
  let preferences: UserPreferences = { growthColor: "#38d39f", fallColor: "#ff6577", compactNumbers: false };
  try {
    preferences = JSON.parse(String(row.preferences_json)) as UserPreferences;
  } catch {
    // Keep safe defaults if a legacy preference row is malformed.
  }
  return {
    id: String(row.id),
    email: String(row.email),
    username: String(row.username),
    role: row.role as SessionUser["role"],
    status: String(row.status),
    disposableBalanceCents: Number(row.disposable_balance_cents),
    borrowedPrincipalCents: Number(row.borrowed_principal_cents),
    financialStatus: row.financial_status as SessionUser["financialStatus"],
    financialStatusVersion: Number(row.financial_status_version),
    preferences,
  };
}

export async function requireUser(request: Request, env: Env): Promise<SessionUser> {
  const user = await getSessionUser(request, env);
  if (!user || user.status !== "active") {
    throw new HttpError(401, "AUTH_REQUIRED", "Sign in with an active verified account.");
  }
  return user;
}

export async function requireOperator(request: Request, env: Env): Promise<SessionUser> {
  const user = await requireUser(request, env);
  if (user.role !== "operator" && user.role !== "administrator") {
    throw new HttpError(403, "OPERATOR_REQUIRED", "This action requires a market operator account.");
  }
  return user;
}

export async function requireAdministrator(request: Request, env: Env): Promise<SessionUser> {
  const user = await requireUser(request, env);
  if (user.role !== "administrator") {
    throw new HttpError(403, "ADMIN_REQUIRED", "This action requires an administrator account.");
  }
  return user;
}

