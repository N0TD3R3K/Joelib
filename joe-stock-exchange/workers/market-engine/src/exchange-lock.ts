export async function beginTick(
  db: D1Database,
  tickId: string,
  tickKey: string,
  marketDate: string,
  marketHour: number,
  marketMood: number,
): Promise<string | null> {
  const existing = await db.prepare(
    "SELECT id, status FROM market_ticks WHERE tick_key = ? LIMIT 1",
  ).bind(tickKey).first<{ id: string; status: string }>();
  if (existing) {
    const recovered = await db.prepare(
      `UPDATE market_ticks
          SET status = 'running', market_mood = ?, explanation_json = '{}',
              started_at = CURRENT_TIMESTAMP, completed_at = NULL
        WHERE id = ? AND (
          status = 'failed' OR
          (status = 'running' AND started_at < datetime('now', '-10 minutes'))
        )`,
    ).bind(marketMood, existing.id).run();
    return Number(recovered.meta.changes ?? 0) > 0 ? existing.id : null;
  }
  try {
    await db.prepare(
      `INSERT INTO market_ticks (id, tick_key, market_date, market_hour, market_mood, status)
       VALUES (?, ?, ?, ?, ?, 'running')`,
    ).bind(tickId, tickKey, marketDate, marketHour, marketMood).run();
    return tickId;
  } catch (error) {
    const winner = await db.prepare("SELECT id FROM market_ticks WHERE tick_key = ? LIMIT 1").bind(tickKey).first();
    if (winner) return null;
    throw error;
  }
}

export async function failTick(db: D1Database, tickId: string, error: unknown): Promise<void> {
  await db.prepare(
    "UPDATE market_ticks SET status = 'failed', explanation_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown market-engine error" }), tickId).run();
}

