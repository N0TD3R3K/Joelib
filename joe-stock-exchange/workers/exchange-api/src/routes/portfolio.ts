import type { Holding, InboxPayload, UserPreferences, UserSummary } from "@joese/contracts";
import type { Env } from "../env";
import { requireUser } from "../lib/auth";
import { HttpError, json, readJson } from "../lib/http";

function mapHolding(row: Record<string, unknown>): Holding {
  const quantity = Number(row.quantity);
  const currentPriceCents = Number(row.current_price_cents);
  const averageCostCents = Number(row.average_cost_cents);
  return {
    id: String(row.id),
    assetId: String(row.asset_id),
    ticker: String(row.ticker),
    name: String(row.name),
    kind: row.holding_kind as Holding["kind"],
    quantity,
    frozenQuantity: Number(row.frozen_quantity),
    averageCostCents,
    currentPriceCents,
    marketValueCents: Math.round(quantity * currentPriceCents),
    percentChange: averageCostCents > 0 ? ((currentPriceCents - averageCostCents) / averageCostCents) * 100 : 0,
  };
}

async function portfolioForUser(userId: string, env: Env): Promise<Holding[]> {
  const rows = await env.DB.prepare(
    `SELECT h.*, a.ticker, a.name, a.current_price_cents
       FROM holdings h JOIN assets a ON a.id = h.asset_id
      WHERE h.user_id = ? AND h.quantity > 0
      ORDER BY CASE h.holding_kind WHEN 'shareholding' THEN 1 WHEN 'stock' THEN 2 ELSE 3 END, a.ticker`,
  ).bind(userId).all<Record<string, unknown>>();
  return rows.results.map(mapHolding);
}

export async function handlePortfolio(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (url.pathname === "/v1/me/portfolio" && request.method === "GET") {
    const user = await requireUser(request, env);
    const holdings = await portfolioForUser(user.id, env);
    const frozenAssetValueCents = holdings
      .filter((holding) => holding.kind === "shareholding")
      .reduce((total, holding) => total + holding.marketValueCents, 0);
    const assetValueCents = holdings
      .filter((holding) => holding.kind !== "shareholding")
      .reduce((total, holding) => total + holding.marketValueCents, 0);
    const summary: UserSummary = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      disposableBalanceCents: user.disposableBalanceCents,
      frozenAssetValueCents,
      assetValueCents,
      borrowedCents: user.borrowedPrincipalCents,
      preferences: user.preferences,
    };
    return json({ summary, holdings });
  }

  if (url.pathname === "/v1/me/inbox" && request.method === "GET") {
    const user = await requireUser(request, env);
    const [transfers, offers] = await Promise.all([
      env.DB.prepare(
        `SELECT t.*, sender.username AS sender_name, receiver.username AS receiver_name
           FROM cash_transfers t
           JOIN users sender ON sender.id = t.sender_id
           JOIN users receiver ON receiver.id = t.receiver_id
          WHERE t.receiver_id = ? AND t.status = 'pending'
          ORDER BY t.created_at DESC`,
      ).bind(user.id).all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT o.*, seller.username AS seller_name, buyer.username AS buyer_name, a.ticker
           FROM share_offers o
           JOIN users seller ON seller.id = o.seller_id
           JOIN users buyer ON buyer.id = o.buyer_id
           JOIN assets a ON a.id = o.asset_id
          WHERE o.buyer_id = ? AND o.status = 'pending'
          ORDER BY o.created_at DESC`,
      ).bind(user.id).all<Record<string, unknown>>(),
    ]);
    const inbox: InboxPayload = {
      transfers: transfers.results.map((row) => ({
        id: String(row.id),
        senderName: String(row.sender_name),
        receiverName: String(row.receiver_name),
        amountCents: Number(row.amount_cents),
        message: String(row.message),
        status: row.status as "pending",
        createdAt: String(row.created_at),
      })),
      shareOffers: offers.results.map((row) => ({
        id: String(row.id),
        sellerName: String(row.seller_name),
        buyerName: String(row.buyer_name),
        ticker: String(row.ticker),
        quantity: Number(row.quantity),
        askingPriceCents: Number(row.asking_price_cents),
        status: row.status as "pending",
        createdAt: String(row.created_at),
      })),
    };
    return json(inbox);
  }

  if (url.pathname === "/v1/me/settings" && request.method === "PATCH") {
    const user = await requireUser(request, env);
    const body = await readJson<{ username?: string; preferences?: Partial<UserPreferences> }>(request);
    const username = body.username?.trim() ?? user.username;
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
      throw new HttpError(400, "INVALID_USERNAME", "Username must be 3–32 letters, numbers, periods, dashes, or underscores.");
    }
    const growthColor = body.preferences?.growthColor ?? user.preferences.growthColor;
    const fallColor = body.preferences?.fallColor ?? user.preferences.fallColor;
    if (!/^#[0-9a-f]{6}$/i.test(growthColor) || !/^#[0-9a-f]{6}$/i.test(fallColor)) {
      throw new HttpError(400, "INVALID_COLOR", "Growth and fall colors must be six-digit hex colors.");
    }
    const preferences: UserPreferences = {
      growthColor,
      fallColor,
      compactNumbers: body.preferences?.compactNumbers ?? user.preferences.compactNumbers,
    };
    try {
      await env.DB.prepare(
        "UPDATE users SET username = ?, preferences_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(username, JSON.stringify(preferences), user.id).run();
    } catch {
      throw new HttpError(409, "USERNAME_TAKEN", "That username is already in use.");
    }
    return json({ username, preferences });
  }

  return null;
}

export { portfolioForUser };

