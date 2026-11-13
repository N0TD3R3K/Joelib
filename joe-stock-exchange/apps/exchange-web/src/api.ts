import type {
  InboxPayload,
  JoeBankLoan,
  JoeBankSnapshot,
  MarketSnapshot,
  PortfolioSnapshot,
  UserPreferences,
} from "@joese/contracts";
import { createDemoJoeBankSnapshot, createDemoMarketSnapshot, createDemoPortfolioSnapshot } from "@joese/contracts/demo";

const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");
const API_BASE = configuredBase || "/v1";
export const demoMode = import.meta.env.VITE_DEMO_MODE === "true";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `JOESE request failed (${response.status})`);
  return payload.data as T;
}

export async function loadMarket(): Promise<MarketSnapshot> {
  if (demoMode) return createDemoMarketSnapshot();
  return request<MarketSnapshot>("/market/snapshot");
}

export async function loadPortfolio(): Promise<PortfolioSnapshot> {
  if (demoMode) return createDemoPortfolioSnapshot();
  const [portfolio, inbox] = await Promise.all([
    request<Omit<PortfolioSnapshot, "inbox">>("/me/portfolio"),
    request<InboxPayload>("/me/inbox"),
  ]);
  return { ...portfolio, inbox };
}

export async function login(email: string, password: string, turnstileToken: string): Promise<void> {
  await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password, turnstileToken }) });
}

export async function register(input: { email: string; username: string; password: string; inviteCode: string; turnstileToken: string }): Promise<{ developmentVerificationToken?: string }> {
  return request("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export async function resendVerification(email: string, turnstileToken: string): Promise<{ message: string; developmentVerificationToken?: string }> {
  return request("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email, turnstileToken }) });
}

export async function verifyEmail(token: string): Promise<void> {
  await request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
}

export async function requestPasswordReset(email: string, turnstileToken: string): Promise<{ message: string; developmentResetToken?: string }> {
  return request("/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email, turnstileToken }) });
}

export async function resetPassword(token: string, password: string, turnstileToken: string): Promise<void> {
  await request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password, turnstileToken }) });
}

export async function postComment(ticker: string, body: string): Promise<void> {
  if (demoMode) return;
  await request("/comments", { method: "POST", body: JSON.stringify({ ticker, body }) });
}

export async function updateSettings(username: string, preferences: UserPreferences): Promise<void> {
  if (demoMode) return;
  await request("/me/settings", { method: "PATCH", body: JSON.stringify({ username, preferences }) });
}

export async function createTransfer(receiver: string, amountCents: number, message: string): Promise<void> {
  if (demoMode) return;
  await request("/transfers", { method: "POST", body: JSON.stringify({ receiver, amountCents, message }) });
}

export async function resolveTransfer(id: string, action: "accept" | "decline"): Promise<void> {
  if (demoMode) return;
  await request(`/transfers/${id}/${action}`, { method: "POST", body: "{}" });
}

export async function createShareOffer(input: { buyer: string; ticker: string; quantity: number; askingPriceCents: number }): Promise<void> {
  if (demoMode) return;
  await request("/share-offers", { method: "POST", body: JSON.stringify(input) });
}

export async function resolveShareOffer(id: string, action: "accept" | "decline"): Promise<void> {
  if (demoMode) return;
  await request(`/share-offers/${id}/${action}`, { method: "POST", body: "{}" });
}

export async function createOrder(input: { ticker: string; side: "buy" | "sell"; quantity: number }): Promise<{ status: string; matchedTrades: number }> {
  if (demoMode) return { status: "open", matchedTrades: 0 };
  return request("/orders", { method: "POST", body: JSON.stringify(input) });
}

export async function loadJoeBank(): Promise<JoeBankSnapshot> {
  if (demoMode) return createDemoJoeBankSnapshot();
  return request<JoeBankSnapshot>("/joe-bank");
}

export async function applyForJoeBankLoan(amountCents: number, note: string): Promise<JoeBankLoan> {
  if (demoMode) return createDemoJoeBankSnapshot().loans[0];
  return request<JoeBankLoan>("/joe-bank/applications", { method: "POST", body: JSON.stringify({ amountCents, note }) });
}

export async function decideJoeBankOffer(id: string, action: "accept" | "decline"): Promise<void> {
  if (demoMode) return;
  await request(`/joe-bank/loans/${id}/${action}`, { method: "POST", body: "{}" });
}

export async function repayJoeBankLoan(id: string, amountCents: number): Promise<void> {
  if (demoMode) return;
  await request(`/joe-bank/loans/${id}/repay`, { method: "POST", body: JSON.stringify({ amountCents }) });
}

