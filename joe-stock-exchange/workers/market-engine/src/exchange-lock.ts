export async function beginTick(
  db: D1Database,
  tickId: string,
  tickKey: string,
  marketDate: string,
  marketHour: number,
  marketMood: number,
): Promise<boolean> {
  const existing = await db.prepare("SELECT id FROM market_ticks WHERE tick_key = ? LIMIT 1").bind(tickKey).first();
  if (existing) return false;
  await db.prepare(
    `INSERT INTO market_ticks (id, tick_key, market_date, market_hour, market_mood, status)
     VALUES (?, ?, ?, ?, ?, 'running')`,
  ).bind(tickId, tickKey, marketDate, marketHour, marketMood).run();
  return true;
}

export async function completeTick(db: D1Database, tickId: string, explanation: unknown): Promise<void> {
  await db.prepare(
    "UPDATE market_ticks SET status = 'complete', explanation_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(JSON.stringify(explanation), tickId).run();
}

export async function failTick(db: D1Database, tickId: string, error: unknown): Promise<void> {
  await db.prepare(
    "UPDATE market_ticks SET status = 'failed', explanation_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown market-engine error" }), tickId).run();
}

