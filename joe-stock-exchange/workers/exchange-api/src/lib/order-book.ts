import {
  feeForGross,
  grossForTrade,
  reserveForBuy,
} from "@joese/market-rules";
import { createId } from "./ids";

interface MatchRow extends Record<string, unknown> {
  buy_id: string;
  buy_user_id: string;
  buy_remaining: number;
  buy_limit: number;
  buy_reserved: number;
  buy_created_at: string;
  sell_id: string;
  sell_user_id: string;
  sell_remaining: number;
  sell_limit: number;
  sell_created_at: string;
}

function normalizedQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

function tradeIdFor(match: MatchRow): string {
  const snapshot = `${match.buy_id}_${match.sell_id}_${match.buy_remaining}_${match.sell_remaining}`;
  return `trade_${snapshot.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export async function matchOpenOrders(
  db: D1Database,
  asset: { id: string; type: "stock" | "crypto" },
): Promise<number> {
  const holdingKind = asset.type === "stock" ? "stock" : "crypto";
  let completedTrades = 0;

  for (let pass = 0; pass < 200; pass += 1) {
    const match = await db.prepare(
      `SELECT
         b.id AS buy_id, b.user_id AS buy_user_id,
         b.remaining_quantity AS buy_remaining, b.limit_price_cents AS buy_limit,
         b.reserved_cash_cents AS buy_reserved, b.created_at AS buy_created_at,
         s.id AS sell_id, s.user_id AS sell_user_id,
         s.remaining_quantity AS sell_remaining, s.limit_price_cents AS sell_limit,
         s.created_at AS sell_created_at
       FROM orders b
       JOIN orders s ON s.asset_id = b.asset_id
       WHERE b.asset_id = ?
         AND b.side = 'buy' AND s.side = 'sell'
         AND b.status IN ('open', 'partially_filled')
         AND s.status IN ('open', 'partially_filled')
         AND b.remaining_quantity > 0 AND s.remaining_quantity > 0
         AND b.limit_price_cents >= s.limit_price_cents
         AND b.user_id <> s.user_id
       ORDER BY b.limit_price_cents DESC, b.created_at ASC,
                s.limit_price_cents ASC, s.created_at ASC
       LIMIT 1`,
    ).bind(asset.id).first<MatchRow>();
    if (!match) break;

    const quantity = normalizedQuantity(Math.min(Number(match.buy_remaining), Number(match.sell_remaining)));
    if (quantity <= 0) break;
    const buyerPriceCents = Number(match.buy_limit);
    const sellerPriceCents = Number(match.sell_limit);
    const reportedPriceCents = Math.round((buyerPriceCents + sellerPriceCents) / 2);
    const buyerGrossCents = grossForTrade(buyerPriceCents, quantity);
    const sellerGrossCents = grossForTrade(sellerPriceCents, quantity);
    const sellerFeeCents = feeForGross(sellerGrossCents);
    const sellerProceedsCents = sellerGrossCents - sellerFeeCents;
    const spreadCents = Math.max(0, buyerGrossCents - sellerGrossCents);
    const buyRemaining = normalizedQuantity(Number(match.buy_remaining) - quantity);
    const sellRemaining = normalizedQuantity(Number(match.sell_remaining) - quantity);
    const desiredNextReserve = buyRemaining > 0
      ? reserveForBuy(Number(match.buy_limit), buyRemaining)
      : 0;
    const availableForFill = Math.max(0, Number(match.buy_reserved) - desiredNextReserve);
    const buyerFeeCents = Math.min(feeForGross(buyerGrossCents), Math.max(0, availableForFill - buyerGrossCents));
    const buyerCostCents = buyerGrossCents + buyerFeeCents;
    const remainingAfterFill = Math.max(0, Number(match.buy_reserved) - buyerCostCents);
    const nextReservedCashCents = Math.min(desiredNextReserve, remainingAfterFill);
    const buyerRefundCents = remainingAfterFill - nextReservedCashCents;
    const buyStatus = buyRemaining === 0 ? "filled" : "partially_filled";
    const sellStatus = sellRemaining === 0 ? "filled" : "partially_filled";
    const tradeId = tradeIdFor(match);
    const buyerHolding = await db.prepare(
      `SELECT id, quantity, average_cost_cents FROM holdings
        WHERE user_id = ? AND asset_id = ? AND holding_kind = ? LIMIT 1`,
    ).bind(match.buy_user_id, asset.id, holdingKind).first<Record<string, unknown>>();
    const buyerHoldingId = buyerHolding ? String(buyerHolding.id) : createId("holding");
    const priorBuyerQuantity = Number(buyerHolding?.quantity ?? 0);
    const priorBuyerCost = priorBuyerQuantity * Number(buyerHolding?.average_cost_cents ?? 0);
    const buyerAverageCostCents = Math.round((priorBuyerCost + buyerGrossCents) / (priorBuyerQuantity + quantity));

    const statements: D1PreparedStatement[] = [
      db.prepare(
        `UPDATE orders
            SET remaining_quantity = ?, reserved_cash_cents = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND remaining_quantity = ? AND status IN ('open', 'partially_filled')`,
      ).bind(buyRemaining, nextReservedCashCents, buyStatus, match.buy_id, match.buy_remaining),
      db.prepare(
        `UPDATE orders
            SET remaining_quantity = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND remaining_quantity = ? AND status IN ('open', 'partially_filled')`,
      ).bind(sellRemaining, sellStatus, match.sell_id, match.sell_remaining),
      db.prepare(
        `UPDATE holdings
            SET quantity = quantity - ?, reserved_quantity = reserved_quantity - ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND asset_id = ? AND holding_kind = ? AND reserved_quantity >= ?`,
      ).bind(quantity, quantity, match.sell_user_id, asset.id, holdingKind, quantity),
      db.prepare(
        "UPDATE users SET disposable_balance_cents = disposable_balance_cents + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(sellerProceedsCents, match.sell_user_id),
      db.prepare(
        `INSERT INTO trades
          (id, asset_id, buyer_id, seller_id, buy_order_id, sell_order_id, quantity,
           price_cents, buyer_fee_cents, seller_fee_cents, buyer_price_cents,
           seller_price_cents, spread_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        tradeId, asset.id, match.buy_user_id, match.sell_user_id, match.buy_id, match.sell_id,
        quantity, reportedPriceCents, buyerFeeCents, sellerFeeCents,
        buyerPriceCents, sellerPriceCents, spreadCents,
      ),
      db.prepare(
        `INSERT INTO ledger_entries
          (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, quantity,
           reference_type, reference_id, metadata_json)
         VALUES (?, ?, 'trade_purchase_settlement', ?,
           (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, ?, 'trade', ?, ?)`,
      ).bind(
        createId("led"), match.buy_user_id, buyerRefundCents, match.buy_user_id,
        asset.id, quantity, tradeId,
        JSON.stringify({ grossCents: buyerGrossCents, feeCents: buyerFeeCents, reservedUsedCents: buyerCostCents, spreadCents }),
      ),
      db.prepare(
        `INSERT INTO ledger_entries
          (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, quantity,
           reference_type, reference_id, metadata_json)
         VALUES (?, ?, 'trade_sale', ?,
           (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, ?, 'trade', ?, ?)`,
      ).bind(
        createId("led"), match.sell_user_id, sellerProceedsCents, match.sell_user_id,
        asset.id, -quantity, tradeId, JSON.stringify({ grossCents: sellerGrossCents, feeCents: sellerFeeCents, spreadCents }),
      ),
    ];
    if (buyerRefundCents > 0) {
      statements.splice(4, 0, db.prepare(
        "UPDATE users SET disposable_balance_cents = disposable_balance_cents + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(buyerRefundCents, match.buy_user_id));
    }
    if (buyerHolding) {
      statements.splice(3, 0, db.prepare(
        `UPDATE holdings
            SET quantity = quantity + ?, average_cost_cents = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).bind(quantity, buyerAverageCostCents, buyerHoldingId));
    } else {
      statements.splice(3, 0, db.prepare(
        `INSERT INTO holdings (id, user_id, asset_id, holding_kind, quantity, average_cost_cents)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(buyerHoldingId, match.buy_user_id, asset.id, holdingKind, quantity, buyerAverageCostCents));
    }

    try {
      await db.batch(statements);
      completedTrades += 1;
    } catch (error) {
      const duplicate = await db.prepare("SELECT id FROM trades WHERE id = ?").bind(tradeId).first();
      if (!duplicate) throw error;
    }
  }
  return completedTrades;
}
