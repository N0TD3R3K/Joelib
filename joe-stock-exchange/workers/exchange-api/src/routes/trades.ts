import {
  feeForGross,
  isCryptoQuantityValid,
  isStockQuantityValid,
  marketTradingStatus,
  quoteForPrice,
  reserveForBuy,
} from "@joese/market-rules";
import type { Env } from "../env";
import { requireUser } from "../lib/auth";
import { HttpError, json, readJson } from "../lib/http";
import { createId } from "../lib/ids";
import { matchOpenOrders } from "../lib/order-book";

function memberOnly(role: string): void {
  if (role !== "member") {
    throw new HttpError(403, "TRADING_ROLE_REQUIRED", "Operator and administrator accounts cannot transfer or trade.");
  }
}

function positiveInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new HttpError(400, "INVALID_AMOUNT", `${field} must be a positive whole number of cents.`);
  }
  return number;
}

async function requireTradingWindow(env: Env): Promise<void> {
  if (env.ENFORCE_TRADING_SCHEDULE === "false") return;
  const status = marketTradingStatus(new Date());
  if (status !== "open") {
    throw new HttpError(
      423,
      status === "locked" ? "MARKET_LOCKED" : "MARKET_CLOSED",
      status === "locked"
        ? "Trading is briefly locked around the hourly price update."
        : "Trading is closed. The JOESE session runs from 2:00 PM through the 10:00 PM close in New York.",
    );
  }
  const runningTick = await env.DB.prepare(
    "SELECT id FROM market_ticks WHERE status = 'running' ORDER BY started_at DESC LIMIT 1",
  ).first();
  if (runningTick) {
    throw new HttpError(423, "MARKET_LOCKED", "Trading is briefly locked while the official price update completes.");
  }
}

export async function handleTrades(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (url.pathname === "/v1/comments" && request.method === "POST") {
    const user = await requireUser(request, env);
    const body = await readJson<{ ticker?: string; body?: string }>(request);
    const ticker = (body.ticker ?? "").trim().toUpperCase();
    const comment = (body.body ?? "").trim();
    if (comment.length < 1 || comment.length > 1000) {
      throw new HttpError(400, "INVALID_COMMENT", "A comment must contain 1–1,000 characters.");
    }
    const asset = await env.DB.prepare("SELECT id FROM assets WHERE ticker = ? AND active = 1")
      .bind(ticker).first<{ id: string }>();
    if (!asset) throw new HttpError(404, "ASSET_NOT_FOUND", "That active listing was not found.");
    const id = createId("comment");
    await env.DB.prepare(
      "INSERT INTO comments (id, user_id, asset_id, body) VALUES (?, ?, ?, ?)",
    ).bind(id, user.id, asset.id, comment).run();
    return json({ id, ticker, body: comment, status: "visible" }, 201);
  }

  if (url.pathname === "/v1/transfers" && request.method === "POST") {
    const user = await requireUser(request, env);
    memberOnly(user.role);
    const body = await readJson<{ receiver?: string; amountCents?: number; message?: string }>(request);
    const amountCents = positiveInteger(body.amountCents, "amountCents");
    const receiverKey = (body.receiver ?? "").trim().toLowerCase();
    if (amountCents > user.disposableBalanceCents) {
      throw new HttpError(409, "INSUFFICIENT_BALANCE", "Disposable balance is too low for this pending transfer.");
    }
    const receiver = await env.DB.prepare(
      "SELECT id, username FROM users WHERE (email = ? OR lower(username) = ?) AND status = 'active' LIMIT 1",
    ).bind(receiverKey, receiverKey).first<{ id: string; username: string }>();
    if (!receiver) throw new HttpError(404, "RECEIVER_NOT_FOUND", "The receiver account was not found.");
    if (receiver.id === user.id) throw new HttpError(400, "SELF_TRANSFER", "Choose a different receiver.");
    const id = createId("transfer");
    const message = (body.message ?? "").trim().slice(0, 280);
    try {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE users SET disposable_balance_cents = disposable_balance_cents - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(amountCents, user.id),
        env.DB.prepare(
          `INSERT INTO cash_transfers (id, sender_id, receiver_id, amount_cents, message)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(id, user.id, receiver.id, amountCents, message),
        env.DB.prepare(
          `INSERT INTO ledger_entries
            (id, user_id, entry_type, amount_cents, balance_after_cents, reference_type, reference_id)
           VALUES (?, ?, 'transfer_reserved', ?, (SELECT disposable_balance_cents FROM users WHERE id = ?), 'cash_transfer', ?)`,
        ).bind(createId("led"), user.id, -amountCents, user.id, id),
      ]);
    } catch {
      throw new HttpError(409, "INSUFFICIENT_BALANCE", "Disposable balance changed before the transfer could be reserved.");
    }
    return json({ id, receiverName: receiver.username, amountCents, message, status: "pending" }, 201);
  }

  const transferAction = url.pathname.match(/^\/v1\/transfers\/([^/]+)\/(accept|decline)$/);
  if (transferAction && request.method === "POST") {
    const user = await requireUser(request, env);
    memberOnly(user.role);
    const [id, action] = [transferAction[1], transferAction[2]];
    const transfer = await env.DB.prepare(
      "SELECT * FROM cash_transfers WHERE id = ? AND receiver_id = ? AND status = 'pending' LIMIT 1",
    ).bind(id, user.id).first<Record<string, unknown>>();
    if (!transfer) throw new HttpError(404, "TRANSFER_NOT_FOUND", "That pending transfer is unavailable.");
    const amount = Number(transfer.amount_cents);
    if (action === "accept") {
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE users SET disposable_balance_cents = disposable_balance_cents + ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND EXISTS (SELECT 1 FROM cash_transfers WHERE id = ? AND status = 'pending')`,
        ).bind(amount, user.id, id),
        env.DB.prepare(
          "UPDATE cash_transfers SET status = 'accepted', resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
        ).bind(id),
        env.DB.prepare(
          `INSERT INTO ledger_entries
            (id, user_id, entry_type, amount_cents, balance_after_cents, reference_type, reference_id)
           VALUES (?, ?, 'transfer_received', ?, (SELECT disposable_balance_cents FROM users WHERE id = ?), 'cash_transfer', ?)`,
        ).bind(createId("led"), user.id, amount, user.id, id),
      ]);
    } else {
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE users SET disposable_balance_cents = disposable_balance_cents + ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND EXISTS (SELECT 1 FROM cash_transfers WHERE id = ? AND status = 'pending')`,
        ).bind(amount, String(transfer.sender_id), id),
        env.DB.prepare(
          "UPDATE cash_transfers SET status = 'declined', resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
        ).bind(id),
        env.DB.prepare(
          `INSERT INTO ledger_entries
            (id, user_id, entry_type, amount_cents, balance_after_cents, reference_type, reference_id)
           VALUES (?, ?, 'transfer_returned', ?, (SELECT disposable_balance_cents FROM users WHERE id = ?), 'cash_transfer', ?)`,
        ).bind(createId("led"), String(transfer.sender_id), amount, String(transfer.sender_id), id),
      ]);
    }
    return json({ id, status: action === "accept" ? "accepted" : "declined" });
  }

  if (url.pathname === "/v1/share-offers" && request.method === "POST") {
    const user = await requireUser(request, env);
    memberOnly(user.role);
    const body = await readJson<{ buyer?: string; ticker?: string; quantity?: number; askingPriceCents?: number }>(request);
    const buyerKey = (body.buyer ?? "").trim().toLowerCase();
    const ticker = (body.ticker ?? "").trim().toUpperCase();
    const quantity = Number(body.quantity);
    const askingPriceCents = positiveInteger(body.askingPriceCents, "askingPriceCents");
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new HttpError(400, "INVALID_QUANTITY", "Quantity must be positive.");
    }
    const buyer = await env.DB.prepare(
      "SELECT id, username FROM users WHERE (email = ? OR lower(username) = ?) AND status = 'active' LIMIT 1",
    ).bind(buyerKey, buyerKey).first<{ id: string; username: string }>();
    if (!buyer) throw new HttpError(404, "BUYER_NOT_FOUND", "The selected buyer account was not found.");
    if (buyer.id === user.id) throw new HttpError(400, "SELF_OFFER", "Choose a different buyer.");
    const holding = await env.DB.prepare(
      `SELECT h.id, h.frozen_quantity, h.reserved_quantity, a.id AS asset_id, a.ticker
         FROM holdings h JOIN assets a ON a.id = h.asset_id
        WHERE h.user_id = ? AND a.ticker = ? AND h.holding_kind = 'shareholding' LIMIT 1`,
    ).bind(user.id, ticker).first<Record<string, unknown>>();
    if (!holding || Number(holding.frozen_quantity) < quantity) {
      throw new HttpError(409, "INSUFFICIENT_FROZEN_ASSETS", "You do not have enough available frozen shares for this offer.");
    }
    const id = createId("offer");
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE holdings
            SET frozen_quantity = frozen_quantity - ?, reserved_quantity = reserved_quantity + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).bind(quantity, quantity, String(holding.id)),
      env.DB.prepare(
        `INSERT INTO share_offers (id, seller_id, buyer_id, asset_id, quantity, asking_price_cents)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(id, user.id, buyer.id, String(holding.asset_id), quantity, askingPriceCents),
      env.DB.prepare(
        `INSERT INTO ledger_entries
          (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, quantity, reference_type, reference_id)
         VALUES (?, ?, 'share_offer_reserved', 0,
           (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, ?, 'share_offer', ?)`,
      ).bind(createId("led"), user.id, user.id, String(holding.asset_id), -quantity, id),
    ]);
    return json({ id, buyerName: buyer.username, ticker, quantity, askingPriceCents, status: "pending" }, 201);
  }

  const offerAction = url.pathname.match(/^\/v1\/share-offers\/([^/]+)\/(accept|decline)$/);
  if (offerAction && request.method === "POST") {
    const user = await requireUser(request, env);
    memberOnly(user.role);
    const [id, action] = [offerAction[1], offerAction[2]];
    const offer = await env.DB.prepare(
      `SELECT o.*, a.ticker
         FROM share_offers o JOIN assets a ON a.id = o.asset_id
        WHERE o.id = ? AND o.buyer_id = ? AND o.status = 'pending' LIMIT 1`,
    ).bind(id, user.id).first<Record<string, unknown>>();
    if (!offer) throw new HttpError(404, "OFFER_NOT_FOUND", "That pending share offer is unavailable.");
    const quantity = Number(offer.quantity);
    const gross = Number(offer.asking_price_cents);
    const fee = feeForGross(gross);
    if (action === "accept") {
      if (user.disposableBalanceCents < gross + fee) {
        throw new HttpError(409, "INSUFFICIENT_BALANCE", "Disposable balance is too low to receive this shareholding.");
      }
      const existing = await env.DB.prepare(
        "SELECT id, quantity, average_cost_cents FROM holdings WHERE user_id = ? AND asset_id = ? AND holding_kind = 'shareholding'",
      ).bind(user.id, String(offer.asset_id)).first<Record<string, unknown>>();
      const holdingId = existing ? String(existing.id) : createId("holding");
      const previousQuantity = existing ? Number(existing.quantity) : 0;
      const averageCost = Math.round(((previousQuantity * Number(existing?.average_cost_cents ?? 0)) + gross) / (previousQuantity + quantity));
      const statements: D1PreparedStatement[] = [
        env.DB.prepare(
          "UPDATE users SET disposable_balance_cents = disposable_balance_cents - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(gross + fee, user.id),
        env.DB.prepare(
          "UPDATE users SET disposable_balance_cents = disposable_balance_cents + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(gross - fee, String(offer.seller_id)),
        env.DB.prepare(
          `UPDATE holdings SET quantity = quantity - ?, reserved_quantity = reserved_quantity - ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND asset_id = ? AND holding_kind = 'shareholding'`,
        ).bind(quantity, quantity, String(offer.seller_id), String(offer.asset_id)),
      ];
      if (existing) {
        statements.push(env.DB.prepare(
          `UPDATE holdings SET quantity = quantity + ?, frozen_quantity = frozen_quantity + ?, average_cost_cents = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        ).bind(quantity, quantity, averageCost, holdingId));
      } else {
        statements.push(env.DB.prepare(
          `INSERT INTO holdings (id, user_id, asset_id, holding_kind, quantity, frozen_quantity, average_cost_cents)
           VALUES (?, ?, ?, 'shareholding', ?, ?, ?)`,
        ).bind(holdingId, user.id, String(offer.asset_id), quantity, quantity, averageCost));
      }
      statements.push(
        env.DB.prepare("UPDATE share_offers SET status = 'accepted', resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").bind(id),
        env.DB.prepare(
          `INSERT INTO ledger_entries
            (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, quantity, reference_type, reference_id)
           VALUES (?, ?, 'share_offer_purchase', ?, (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, ?, 'share_offer', ?)`,
        ).bind(createId("led"), user.id, -(gross + fee), user.id, String(offer.asset_id), quantity, id),
        env.DB.prepare(
          `INSERT INTO ledger_entries
            (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, quantity, reference_type, reference_id)
           VALUES (?, ?, 'share_offer_sale', ?, (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, ?, 'share_offer', ?)`,
        ).bind(createId("led"), String(offer.seller_id), gross - fee, String(offer.seller_id), String(offer.asset_id), -quantity, id),
      );
      await env.DB.batch(statements);
    } else {
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE holdings SET frozen_quantity = frozen_quantity + ?, reserved_quantity = reserved_quantity - ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND asset_id = ? AND holding_kind = 'shareholding'`,
        ).bind(quantity, quantity, String(offer.seller_id), String(offer.asset_id)),
        env.DB.prepare("UPDATE share_offers SET status = 'declined', resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").bind(id),
        env.DB.prepare(
          `INSERT INTO ledger_entries
            (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, quantity, reference_type, reference_id)
           VALUES (?, ?, 'share_offer_declined_release', 0,
             (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, ?, 'share_offer', ?)`,
        ).bind(createId("led"), String(offer.seller_id), String(offer.seller_id), String(offer.asset_id), quantity, id),
      ]);
    }
    return json({ id, status: action === "accept" ? "accepted" : "declined" });
  }

  if (url.pathname === "/v1/orders" && request.method === "GET") {
    const user = await requireUser(request, env);
    memberOnly(user.role);
    const rows = await env.DB.prepare(
      `SELECT o.id, a.ticker, o.side, o.quantity, o.remaining_quantity, o.limit_price_cents,
              o.reserved_cash_cents, o.status, o.created_at, o.updated_at
         FROM orders o JOIN assets a ON a.id = o.asset_id
        WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 200`,
    ).bind(user.id).all<Record<string, unknown>>();
    return json(rows.results);
  }

  const cancelOrderMatch = url.pathname.match(/^\/v1\/orders\/([^/]+)\/cancel$/);
  if (cancelOrderMatch && request.method === "POST") {
    const user = await requireUser(request, env);
    memberOnly(user.role);
    const order = await env.DB.prepare(
      `SELECT o.*, a.asset_type
         FROM orders o JOIN assets a ON a.id = o.asset_id
        WHERE o.id = ? AND o.user_id = ? AND o.status IN ('open', 'partially_filled') LIMIT 1`,
    ).bind(cancelOrderMatch[1], user.id).first<Record<string, unknown>>();
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "That open order was not found.");
    const remaining = Number(order.remaining_quantity);
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        `UPDATE orders SET status = 'cancelled', remaining_quantity = 0, reserved_cash_cents = 0,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status IN ('open', 'partially_filled')`,
      ).bind(String(order.id)),
    ];
    if (order.side === "buy") {
      const refund = Number(order.reserved_cash_cents);
      statements.push(
        env.DB.prepare(
          "UPDATE users SET disposable_balance_cents = disposable_balance_cents + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).bind(refund, user.id),
        env.DB.prepare(
          `INSERT INTO ledger_entries
            (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, reference_type, reference_id)
           VALUES (?, ?, 'order_cancelled_refund', ?,
             (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, 'order', ?)`,
        ).bind(createId("led"), user.id, refund, user.id, String(order.asset_id), String(order.id)),
      );
    } else {
      const holdingKind = order.asset_type === "stock" ? "stock" : "crypto";
      statements.push(
        env.DB.prepare(
          `UPDATE holdings SET reserved_quantity = reserved_quantity - ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND asset_id = ? AND holding_kind = ? AND reserved_quantity >= ?`,
        ).bind(remaining, user.id, String(order.asset_id), holdingKind, remaining),
        env.DB.prepare(
          `INSERT INTO ledger_entries
            (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, quantity, reference_type, reference_id)
           VALUES (?, ?, 'order_cancelled_release', 0,
             (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, ?, 'order', ?)`,
        ).bind(createId("led"), user.id, user.id, String(order.asset_id), remaining, String(order.id)),
      );
    }
    await env.DB.batch(statements);
    return json({ id: String(order.id), status: "cancelled" });
  }

  if (url.pathname === "/v1/orders" && request.method === "POST") {
    const user = await requireUser(request, env);
    memberOnly(user.role);
    await requireTradingWindow(env);
    const body = await readJson<{ ticker?: string; side?: "buy" | "sell"; quantity?: number; limitPriceCents?: number }>(request);
    const ticker = (body.ticker ?? "").trim().toUpperCase();
    const asset = await env.DB.prepare(
      "SELECT id, asset_type, current_price_cents FROM assets WHERE ticker = ? AND active = 1",
    ).bind(ticker).first<Record<string, unknown>>();
    if (!asset) throw new HttpError(404, "ASSET_NOT_FOUND", "That active listing was not found.");
    const quantity = Number(body.quantity);
    const validQuantity = asset.asset_type === "stock" ? isStockQuantityValid(quantity) : isCryptoQuantityValid(quantity);
    if (!validQuantity) throw new HttpError(400, "INVALID_QUANTITY", "Quantity does not match this asset's trading precision.");
    if (body.side !== "buy" && body.side !== "sell") throw new HttpError(400, "INVALID_SIDE", "Choose buy or sell.");
    const quote = quoteForPrice(Number(asset.current_price_cents));
    const limitPriceCents = body.limitPriceCents != null
      ? positiveInteger(body.limitPriceCents, "limitPriceCents")
      : body.side === "buy" ? quote.askCents : quote.bidCents;
    const id = createId("order");
    try {
      if (body.side === "buy") {
        const reserveCents = reserveForBuy(limitPriceCents, quantity);
        if (user.disposableBalanceCents < reserveCents) {
          throw new HttpError(409, "INSUFFICIENT_BALANCE", "Disposable balance is too low for this buy order and fee.");
        }
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE users SET disposable_balance_cents = disposable_balance_cents - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).bind(reserveCents, user.id),
          env.DB.prepare(
            `INSERT INTO orders
              (id, user_id, asset_id, side, quantity, remaining_quantity, limit_price_cents, reserved_cash_cents)
             VALUES (?, ?, ?, 'buy', ?, ?, ?, ?)`,
          ).bind(id, user.id, String(asset.id), quantity, quantity, limitPriceCents, reserveCents),
          env.DB.prepare(
            `INSERT INTO ledger_entries
              (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, quantity, reference_type, reference_id)
             VALUES (?, ?, 'order_cash_reserved', ?,
               (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, ?, 'order', ?)`,
          ).bind(createId("led"), user.id, -reserveCents, user.id, String(asset.id), quantity, id),
        ]);
      } else {
        const holdingKind = asset.asset_type === "stock" ? "stock" : "crypto";
        const holding = await env.DB.prepare(
          `SELECT id, quantity, frozen_quantity, reserved_quantity FROM holdings
            WHERE user_id = ? AND asset_id = ? AND holding_kind = ? LIMIT 1`,
        ).bind(user.id, String(asset.id), holdingKind).first<Record<string, unknown>>();
        const available = holding
          ? Number(holding.quantity) - Number(holding.frozen_quantity) - Number(holding.reserved_quantity)
          : 0;
        if (!holding || available < quantity) {
          throw new HttpError(409, "INSUFFICIENT_HOLDING", "You do not have enough available units for this sell order.");
        }
        await env.DB.batch([
          env.DB.prepare(
            `UPDATE holdings SET reserved_quantity = reserved_quantity + ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
          ).bind(quantity, String(holding.id)),
          env.DB.prepare(
            `INSERT INTO orders
              (id, user_id, asset_id, side, quantity, remaining_quantity, limit_price_cents)
             VALUES (?, ?, ?, 'sell', ?, ?, ?)`,
          ).bind(id, user.id, String(asset.id), quantity, quantity, limitPriceCents),
          env.DB.prepare(
            `INSERT INTO ledger_entries
              (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, quantity, reference_type, reference_id)
             VALUES (?, ?, 'order_asset_reserved', 0,
               (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, ?, 'order', ?)`,
          ).bind(createId("led"), user.id, user.id, String(asset.id), -quantity, id),
        ]);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(409, "ORDER_RESERVATION_FAILED", "The order could not reserve the required balance or holding.");
    }
    let matchedTrades = 0;
    try {
      matchedTrades = await matchOpenOrders(env.DB, {
        id: String(asset.id),
        type: asset.asset_type as "stock" | "crypto",
      });
    } catch (error) {
      console.error("Order matching deferred", { orderId: id, assetId: asset.id, error });
    }
    const order = await env.DB.prepare(
      "SELECT id, side, quantity, remaining_quantity, limit_price_cents, status FROM orders WHERE id = ?",
    ).bind(id).first<Record<string, unknown>>();
    return json({ ...order, ticker, matchedTrades }, 201);
  }

  return null;
}

