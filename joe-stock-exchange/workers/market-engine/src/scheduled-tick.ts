import { newYorkMarketParts, nextBelowOneCloseCount, quoteForPrice, shouldDelistStock } from "@joese/market-rules";
import type { Env } from "./env";
import { demandPressureForAsset } from "./demand-pressure";
import { delistingReleaseStatements } from "./delisting";
import { beginTick, failTick } from "./exchange-lock";
import { loanInterestStatements } from "./loan-interest";
import { newsImpactForAsset } from "./news-impact";
import { calculateNextPrice, deterministicMarketMood, ordinaryReturn } from "./price-engine";

interface AssetRow extends Record<string, unknown> {
  id: string;
  ticker: string;
  asset_type: "stock" | "crypto";
  current_price_cents: number;
  open_price_cents: number;
  high_price_cents: number;
  low_price_cents: number;
  ordinary_drift: number;
  volatility: number;
  hourly_cap: number;
  daily_cap: number;
  below_one_close_count: number;
}

export interface TickOutcome {
  status: "complete" | "ignored" | "duplicate";
  tickKey: string;
  assetCount: number;
}

export async function runScheduledTick(env: Env, scheduledAt: Date, force = false): Promise<TickOutcome> {
  const parts = newYorkMarketParts(scheduledAt);
  const tickKey = `${parts.dateKey}T${String(parts.hour).padStart(2, "0")}:00:00[America/New_York]`;
  if (!force && (parts.minute !== 0 || parts.hour < 14 || parts.hour > 22)) {
    return { status: "ignored", tickKey, assetCount: 0 };
  }
  const marketHour = force && (parts.hour < 14 || parts.hour > 22) ? 14 : parts.hour;
  const mood = deterministicMarketMood(tickKey);
  const proposedTickId = `tick_${crypto.randomUUID().replaceAll("-", "")}`;
  const tickId = await beginTick(env.DB, proposedTickId, tickKey, parts.dateKey, marketHour, mood);
  if (!tickId) {
    return { status: "duplicate", tickKey, assetCount: 0 };
  }

  try {
    await env.DB.prepare(
      `UPDATE news_events
          SET status = 'published', published_at = COALESCE(published_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE status = 'scheduled' AND publish_at <= ?`,
    ).bind(scheduledAt.toISOString()).run();

    const assets = await env.DB.prepare("SELECT * FROM assets WHERE active = 1 ORDER BY ticker")
      .all<AssetRow>();
    const explanations: Record<string, unknown> = {};
    const tickStatements: D1PreparedStatement[] = [];

    for (const asset of assets.results) {
      const currentPrice = Number(asset.current_price_cents);
      const openingPrice = marketHour === 14 ? currentPrice : Number(asset.open_price_cents);
      const news = await newsImpactForAsset(env.DB, asset.ticker, scheduledAt);
      const demand = await demandPressureForAsset(env.DB, asset.id, asset.asset_type, scheduledAt);
      const base = ordinaryReturn(tickKey, asset.ticker, Number(asset.ordinary_drift), Number(asset.volatility));
      const result = calculateNextPrice({
        currentPriceCents: currentPrice,
        openingPriceCents: openingPrice,
        ordinaryReturn: base,
        marketMood: mood,
        newsImpact: news.total,
        demandPressure: demand.pressure,
        hourlyCap: Number(asset.hourly_cap),
        dailyCap: Number(asset.daily_cap),
      });
      let belowCount = Number(asset.below_one_close_count);
      let delisted = false;
      let finalPrice = result.nextPriceCents;
      if (marketHour === 22 && asset.asset_type === "stock") {
        belowCount = nextBelowOneCloseCount(belowCount, result.nextPriceCents);
        delisted = shouldDelistStock(belowCount);
        if (delisted) finalPrice = 0;
      }
      if (delisted) {
        tickStatements.push(...await delistingReleaseStatements(env.DB, { id: asset.id, type: asset.asset_type }));
      }
      const high = Math.max(Number(asset.high_price_cents), finalPrice);
      const low = marketHour === 14
        ? finalPrice
        : Math.min(Number(asset.low_price_cents), finalPrice);
      tickStatements.push(
        env.DB.prepare(
          `UPDATE assets SET
             current_price_cents = ?,
             open_price_cents = CASE WHEN ? = 14 THEN ? ELSE open_price_cents END,
             high_price_cents = CASE WHEN ? = 14 THEN ? ELSE ? END,
             low_price_cents = CASE WHEN ? = 14 THEN ? ELSE ? END,
             close_price_cents = CASE WHEN ? = 22 THEN ? ELSE close_price_cents END,
             previous_close_cents = CASE WHEN ? = 14 THEN close_price_cents ELSE previous_close_cents END,
             below_one_close_count = ?, active = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).bind(
          finalPrice, marketHour, currentPrice, marketHour, finalPrice, high,
          marketHour, finalPrice, low, marketHour, finalPrice,
          marketHour, belowCount, delisted ? 0 : 1, asset.id,
        ),
        env.DB.prepare(
          "INSERT INTO price_points (id, asset_id, price_cents, recorded_at, tick_id) VALUES (?, ?, ?, ?, ?)",
        ).bind(`price_${crypto.randomUUID().replaceAll("-", "")}`, asset.id, finalPrice, scheduledAt.toISOString(), tickId),
        env.DB.prepare(
          `UPDATE orders SET limit_price_cents = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = 'usr-joese-issuer' AND asset_id = ? AND side = 'sell'
              AND status IN ('open', 'partially_filled')`,
        ).bind(quoteForPrice(Math.max(1, finalPrice)).askCents, asset.id),
      );
      explanations[asset.ticker] = {
        priorPriceCents: currentPrice,
        nextPriceCents: finalPrice,
        ordinaryReturn: base,
        marketMood: mood,
        newsImpact: news,
        demand,
        hourlyClamped: result.hourlyClamped,
        dailyClamped: result.dailyClamped,
        delisted,
      };
    }
    if (marketHour === 22) {
      const loanInterest = await loanInterestStatements(env.DB, parts.dateKey);
      tickStatements.push(...loanInterest.statements);
      explanations.joeBank = {
        interestAccruals: loanInterest.loanCount,
        totalInterestCents: loanInterest.totalInterestCents,
      };
    }
    tickStatements.push(env.DB.prepare(
      "UPDATE market_ticks SET status = 'complete', explanation_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running'",
    ).bind(JSON.stringify({ tickKey, marketHour, assets: explanations }), tickId));
    await env.DB.batch(tickStatements);
    return { status: "complete", tickKey, assetCount: assets.results.length };
  } catch (error) {
    await failTick(env.DB, tickId, error);
    throw error;
  }
}

