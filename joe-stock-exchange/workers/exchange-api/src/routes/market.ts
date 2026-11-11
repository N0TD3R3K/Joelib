import type { Asset, MarketComment, NewsEvent, PricePoint } from "@joese/contracts";
import { marketTradingStatus, nextScheduledMarketTick } from "@joese/market-rules";
import type { Env } from "../env";
import { json } from "../lib/http";

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function mapAsset(row: Record<string, unknown>): Asset {
  const current = Number(row.current_price_cents);
  const previous = Number(row.previous_close_cents);
  return {
    id: String(row.id),
    ticker: String(row.ticker),
    name: String(row.name),
    type: row.asset_type as Asset["type"],
    description: String(row.description),
    companyDetails: parseJson(row.company_details_json, { overview: String(row.description) }),
    currentPriceCents: current,
    openPriceCents: Number(row.open_price_cents),
    highPriceCents: Number(row.high_price_cents),
    lowPriceCents: Number(row.low_price_cents),
    closePriceCents: Number(row.close_price_cents),
    previousCloseCents: previous,
    percentChange: previous > 0 ? ((current - previous) / previous) * 100 : 0,
    active: Boolean(row.active),
    updatedAt: String(row.updated_at),
  };
}

function mapNews(row: Record<string, unknown>): NewsEvent {
  return {
    id: String(row.id),
    headline: String(row.headline),
    article: String(row.article),
    category: String(row.category),
    direction: row.direction as NewsEvent["direction"],
    severity: row.severity as NewsEvent["severity"],
    affectedTickers: parseJson<string[]>(row.affected_tickers_json, []),
    publishedAt: String(row.published_at ?? row.publish_at ?? row.created_at),
    authorName: String(row.author_name ?? "The Joe Wire"),
    status: row.status as NewsEvent["status"],
  };
}

function mapComment(row: Record<string, unknown>): MarketComment {
  return {
    id: String(row.id),
    assetTicker: String(row.asset_ticker),
    authorName: String(row.author_name),
    body: String(row.body),
    createdAt: String(row.created_at),
    status: row.status as MarketComment["status"],
  };
}

async function listAssets(env: Env): Promise<Asset[]> {
  const result = await env.DB.prepare("SELECT * FROM assets WHERE active = 1 ORDER BY asset_type DESC, ticker ASC").all<Record<string, unknown>>();
  return result.results.map(mapAsset);
}

async function listNews(env: Env, ticker?: string): Promise<NewsEvent[]> {
  const result = await env.DB.prepare(
    `SELECT n.*, COALESCE(u.username, 'The Joe Wire') AS author_name
       FROM news_events n LEFT JOIN users u ON u.id = n.author_id
      WHERE n.status = 'published'
      ORDER BY n.published_at DESC LIMIT 50`,
  ).all<Record<string, unknown>>();
  const events = result.results.map(mapNews);
  return ticker ? events.filter((event) => event.affectedTickers.includes(ticker)) : events;
}

async function listComments(env: Env, ticker?: string): Promise<MarketComment[]> {
  const statement = ticker
    ? env.DB.prepare(
        `SELECT c.*, a.ticker AS asset_ticker, u.username AS author_name
           FROM comments c JOIN users u ON u.id = c.user_id JOIN assets a ON a.id = c.asset_id
          WHERE c.status = 'visible' AND a.ticker = ? ORDER BY c.created_at DESC LIMIT 100`,
      ).bind(ticker)
    : env.DB.prepare(
        `SELECT c.*, a.ticker AS asset_ticker, u.username AS author_name
           FROM comments c JOIN users u ON u.id = c.user_id JOIN assets a ON a.id = c.asset_id
          WHERE c.status = 'visible' ORDER BY c.created_at DESC LIMIT 100`,
      );
  const result = await statement.all<Record<string, unknown>>();
  return result.results.map(mapComment);
}

export async function handleMarket(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (request.method !== "GET") return null;

  if (url.pathname === "/v1/market/assets") {
    return json(await listAssets(env));
  }

  const tickerMatch = url.pathname.match(/^\/v1\/market\/assets\/([A-Z0-9]+)$/i);
  if (tickerMatch) {
    const row = await env.DB.prepare("SELECT * FROM assets WHERE ticker = ? LIMIT 1")
      .bind(tickerMatch[1].toUpperCase())
      .first<Record<string, unknown>>();
    if (!row) return null;
    const history = await env.DB.prepare(
      `SELECT asset_id, price_cents, recorded_at FROM (
         SELECT asset_id, price_cents, recorded_at
           FROM price_points WHERE asset_id = ? ORDER BY recorded_at DESC LIMIT 240
       ) ORDER BY recorded_at ASC`,
    ).bind(row.id).all<Record<string, unknown>>();
    return json({
      asset: mapAsset(row),
      priceHistory: history.results.map((point): PricePoint => ({
        assetId: String(point.asset_id),
        priceCents: Number(point.price_cents),
        recordedAt: String(point.recorded_at),
      })),
      news: await listNews(env, tickerMatch[1].toUpperCase()),
      comments: await listComments(env, tickerMatch[1].toUpperCase()),
    });
  }

  if (url.pathname === "/v1/market/snapshot") {
    const assets = await listAssets(env);
    const prices = await env.DB.prepare(
      `SELECT asset_id, price_cents, recorded_at FROM (
         SELECT asset_id, price_cents, recorded_at,
                ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY recorded_at DESC) AS row_number
           FROM price_points
          WHERE recorded_at >= datetime('now', '-30 days')
       ) WHERE row_number <= 240 ORDER BY recorded_at ASC`,
    ).all<Record<string, unknown>>();
    const historyByAsset = new Map<string, PricePoint[]>();
    for (const row of prices.results) {
      const point: PricePoint = {
        assetId: String(row.asset_id),
        priceCents: Number(row.price_cents),
        recordedAt: String(row.recorded_at),
      };
      historyByAsset.set(point.assetId, [...(historyByAsset.get(point.assetId) ?? []), point]);
    }
    const priceHistory = Object.fromEntries(
      assets.map((asset) => [
        asset.ticker,
        historyByAsset.get(asset.id) ?? [{ assetId: asset.id, priceCents: asset.currentPriceCents, recordedAt: asset.updatedAt }],
      ]),
    );
    const activeTick = await env.DB.prepare(
      `SELECT status FROM market_ticks
        WHERE status = 'running' AND started_at >= datetime('now', '-10 minutes')
        ORDER BY started_at DESC LIMIT 1`,
    ).first<{ status: string }>();
    const now = new Date();
    const scheduledStatus = marketTradingStatus(now);
    const nextTick = nextScheduledMarketTick(now).toISOString();
    return json({
      assets,
      priceHistory,
      news: await listNews(env),
      comments: await listComments(env),
      marketStatus: activeTick?.status === "running" ? "locked" : scheduledStatus,
      nextTickAt: nextTick,
    });
  }

  if (url.pathname === "/v1/news") {
    const ticker = url.searchParams.get("asset")?.toUpperCase();
    return json(await listNews(env, ticker));
  }

  if (url.pathname === "/v1/comments") {
    const ticker = url.searchParams.get("asset")?.toUpperCase();
    return json(await listComments(env, ticker));
  }

  return null;
}

export { mapAsset, mapComment, mapNews };

