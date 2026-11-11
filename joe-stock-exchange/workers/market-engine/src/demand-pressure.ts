import { clamp } from "@joese/market-rules";

export async function demandPressureForAsset(
  db: D1Database,
  assetId: string,
  assetType: "stock" | "crypto",
  scheduledAt: Date,
): Promise<{ pressure: number; buyQuantity: number; sellQuantity: number }> {
  const row = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN side = 'buy' THEN quantity ELSE 0 END), 0) AS buy_quantity,
       COALESCE(SUM(CASE WHEN side = 'sell' THEN quantity ELSE 0 END), 0) AS sell_quantity
     FROM orders
     WHERE asset_id = ?
       AND created_at >= datetime(?, '-62 minutes')
       AND created_at < datetime(?, '-2 minutes')`,
  ).bind(assetId, scheduledAt.toISOString(), scheduledAt.toISOString()).first<Record<string, unknown>>();
  const buyQuantity = Number(row?.buy_quantity ?? 0);
  const sellQuantity = Number(row?.sell_quantity ?? 0);
  const total = buyQuantity + sellQuantity;
  const normalized = total > 0 ? (buyQuantity - sellQuantity) / total : 0;
  const cap = assetType === "crypto" ? 0.08 : 0.03;
  return { pressure: clamp(normalized * cap, -cap, cap), buyQuantity, sellQuantity };
}

