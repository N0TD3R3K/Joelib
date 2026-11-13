import type { Asset, ConsoleLoan, FinancialStatus, MarketComment, NewsEvent } from "@joese/contracts";
import { demoAssets, demoComments, demoNews } from "@joese/contracts/demo";

const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "")) || "/v1";
export const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
export const apiReferenceUrl = `${API_BASE}/openapi.json`;

export interface CreatedInvitation {
  id: string;
  code: string;
  maxUses: number;
  expiresAt: string | null;
  warning: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  const payload = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `Console request failed (${response.status})`);
  return payload.data as T;
}

export async function consoleLogin(email: string, password: string, turnstileToken: string): Promise<void> {
  await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password, turnstileToken }) });
}

export async function loadConsoleData(): Promise<{ assets: Asset[]; news: NewsEvent[]; comments: MarketComment[]; members: Record<string, unknown>[]; loans: ConsoleLoan[]; market: { ticks: Record<string, unknown>[]; orders: Record<string, unknown>[] }; audit: Record<string, unknown>[] }> {
  if (demoMode) {
    return {
      assets: structuredClone(demoAssets), news: structuredClone(demoNews), comments: structuredClone(demoComments),
      members: [
        { id: "u1", username: "joe.investor", email: "investor@school.example", role: "member", status: "active", financial_status: "bankrupt", disposable_balance_cents: 623447, borrowed_principal_cents: 75000 },
        { id: "u2", username: "notderek", email: "developer@school.example", role: "member", status: "active", financial_status: "normal", disposable_balance_cents: 287000, borrowed_principal_cents: 0 },
      ],
      loans: [{ id: "loan-demo", userId: "u1", username: "joe.investor", email: "investor@school.example", financialStatus: "bankrupt", approvedByName: "market.ops", principalCents: 75000, outstandingCents: 75000, annualRateBps: 850, rateKind: "variable", status: "active", stage: "active", requestNote: "Temporary support while reorganizing my simulated portfolio.", decisionNote: "Approved for the standard recovery window.", requestedAt: new Date(Date.now() - 172800000).toISOString(), decidedAt: new Date(Date.now() - 158400000).toISOString(), openedAt: new Date(Date.now() - 154800000).toISOString(), updatedAt: new Date().toISOString(), closedAt: null }],
      market: { ticks: [{ id: "tick1", tick_key: "2026-11-11T18:00:00[America/New_York]", status: "complete", market_hour: 18 }], orders: [{ status: "open", count: 14 }] },
      audit: [{ id: "a1", actor_name: "market.ops", action: "news.create", target_type: "news_event", created_at: new Date().toISOString() }],
    };
  }
  const [assets, news, comments, members, loans, market, audit] = await Promise.all([
    request<Asset[]>("/console/assets"), request<NewsEvent[]>("/console/news"), request<MarketComment[]>("/console/comments"),
    request<Record<string, unknown>[]>("/console/members"), request<ConsoleLoan[]>("/console/loans"), request<{ ticks: Record<string, unknown>[]; orders: Record<string, unknown>[] }>("/console/market"), request<Record<string, unknown>[]>("/console/audit"),
  ]);
  return { assets, news, comments, members, loans, market, audit };
}

export async function saveAsset(asset: Asset): Promise<Asset> {
  if (demoMode) return asset;
  return request(`/console/assets/${asset.ticker}`, { method: "PATCH", body: JSON.stringify({ name: asset.name, description: asset.description, companyDetails: asset.companyDetails, active: asset.active }) });
}

export async function createNews(input: Omit<NewsEvent, "id" | "publishedAt" | "authorName"> & { durationTicks: number; publishAt?: string }): Promise<void> {
  if (demoMode) return;
  await request("/console/news", { method: "POST", body: JSON.stringify(input) });
}

export async function moderateComment(id: string, status: MarketComment["status"]): Promise<void> {
  if (demoMode) return;
  await request(`/console/comments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function updateMemberFinancialStatus(id: string, financialStatus: FinancialStatus, reason: string): Promise<void> {
  if (demoMode) return;
  await request(`/console/members/${id}/financial-status`, { method: "PATCH", body: JSON.stringify({ financialStatus, reason }) });
}

export async function resendMemberVerification(id: string): Promise<{ sent: boolean; cooldown?: boolean }> {
  if (demoMode) return { sent: true };
  return request(`/console/members/${id}/resend-verification`, { method: "POST", body: "{}" });
}

export async function cancelPendingRegistration(id: string): Promise<{ cancelled: boolean; invitationUseRestored: boolean }> {
  if (demoMode) return { cancelled: true, invitationUseRestored: false };
  return request(`/console/members/${id}/pending-registration`, { method: "DELETE" });
}

export async function updateConsoleLoan(id: string, input: { action: "offer" | "decline" | "set_rate"; annualRateBps?: number; note: string }): Promise<void> {
  if (demoMode) return;
  await request(`/console/loans/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function createInvitation(input: { maxUses: number; expiresAt?: string }): Promise<CreatedInvitation> {
  if (demoMode) {
    return {
      id: crypto.randomUUID(),
      code: `JOESE-BETA-${crypto.randomUUID().replaceAll("-", "")}`,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt ?? null,
      warning: "This plaintext code is shown once.",
    };
  }
  return request<CreatedInvitation>("/console/invitations", { method: "POST", body: JSON.stringify(input) });
}

