function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function releaseDelistedOrders(
  db: D1Database,
  asset: { id: string; type: "stock" | "crypto" },
): Promise<void> {
  const orders = await db.prepare(
    `SELECT id, user_id, side, remaining_quantity, reserved_cash_cents
       FROM orders
      WHERE asset_id = ? AND status IN ('open', 'partially_filled')
      ORDER BY created_at`,
  ).bind(asset.id).all<Record<string, unknown>>();
  const holdingKind = asset.type === "stock" ? "stock" : "crypto";

  for (const order of orders.results) {
    const orderId = String(order.id);
    const userId = String(order.user_id);
    const remaining = Number(order.remaining_quantity);
    const statements: D1PreparedStatement[] = [
      db.prepare(
        `UPDATE orders SET status = 'cancelled', remaining_quantity = 0, reserved_cash_cents = 0,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status IN ('open', 'partially_filled')`,
      ).bind(orderId),
    ];
    if (order.side === "buy") {
      const refund = Number(order.reserved_cash_cents);
      statements.unshift(db.prepare(
        "UPDATE users SET disposable_balance_cents = disposable_balance_cents + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(refund, userId));
      statements.push(db.prepare(
        `INSERT INTO ledger_entries
          (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, reference_type, reference_id)
         VALUES (?, ?, 'delisting_order_refund', ?,
           (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, 'order', ?)`,
      ).bind(id("led"), userId, refund, userId, asset.id, orderId));
    } else {
      statements.unshift(db.prepare(
        `UPDATE holdings SET reserved_quantity = reserved_quantity - ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND asset_id = ? AND holding_kind = ? AND reserved_quantity >= ?`,
      ).bind(remaining, userId, asset.id, holdingKind, remaining));
      statements.push(db.prepare(
        `INSERT INTO ledger_entries
          (id, user_id, entry_type, amount_cents, balance_after_cents, asset_id, quantity, reference_type, reference_id)
         VALUES (?, ?, 'delisting_order_release', 0,
           (SELECT disposable_balance_cents FROM users WHERE id = ?), ?, ?, 'order', ?)`,
      ).bind(id("led"), userId, userId, asset.id, remaining, orderId));
    }
    await db.batch(statements);
  }
}
