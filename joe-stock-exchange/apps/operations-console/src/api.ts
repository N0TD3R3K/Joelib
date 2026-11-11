import type { Asset, MarketComment, NewsEvent } from "@joese/contracts";
import { demoAssets, demoComments, demoNews } from "@joese/contracts/demo";

const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "")) || "/v1";
export const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
export const apiReferenceUrl = `${API_BASE}/openapi.json`;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  const payload = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `Console request failed (${response.status})`);
  return payload.data as T;
}

export async function consoleLogin(email: string, password: string, turnstileToken: string): Promise<void> {
  await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password, turnstileToken }) });
}

export async function loadConsoleData(): Promise<{ assets: Asset[]; news: NewsEvent[]; comments: MarketComment[]; members: Record<string, unknown>[]; market: { ticks: Record<string, unknown>[]; orders: Record<string, unknown>[] }; audit: Record<string, unknown>[] }> {
  if (demoMode) {
    return {
      assets: structuredClone(demoAssets), news: structuredClone(demoNews), comments: structuredClone(demoComments),
      members: [
        { id: "u1", username: "joe.investor", email: "investor@school.example", role: "member", status: "active", disposable_balance_cents: 623447 },
        { id: "u2", username: "notderek", email: "developer@school.example", role: "member", status: "active", disposable_balance_cents: 287000 },
      ],
      market: { ticks: [{ id: "tick1", tick_key: "2026-11-11T18:00:00[America/New_York]", status: "complete", market_hour: 18 }], orders: [{ status: "open", count: 14 }] },
      audit: [{ id: "a1", actor_name: "market.ops", action: "news.create", target_type: "news_event", created_at: new Date().toISOString() }],
    };
  }
  const [assets, news, comments, members, market, audit] = await Promise.all([
    request<Asset[]>("/console/assets"), request<NewsEvent[]>("/console/news"), request<MarketComment[]>("/console/comments"),
    request<Record<string, unknown>[]>("/console/members"), request<{ ticks: Record<string, unknown>[]; orders: Record<string, unknown>[] }>("/console/market"), request<Record<string, unknown>[]>("/console/audit"),
  ]);
  return { assets, news, comments, members, market, audit };
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

