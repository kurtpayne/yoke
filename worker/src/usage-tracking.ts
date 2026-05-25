// Lightweight endpoint usage tracking — daily counters per endpoint in D1
// One row per endpoint per day, incremented on each call via UPSERT

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS endpoint_usage (
  endpoint TEXT NOT NULL,
  day TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (endpoint, day)
)`;

const INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_endpoint_usage_day ON endpoint_usage(day)`;

let tableReady = false;

async function ensureTable(db: D1Database): Promise<void> {
  if (tableReady) return;
  await db.batch([
    db.prepare(TABLE_SQL),
    db.prepare(INDEX_SQL),
  ]);
  tableReady = true;
}

/** Track endpoint usage. Returns a promise — caller should pass to ctx.waitUntil() or await it. */
export function trackUsage(db: D1Database, endpoint: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return ensureTable(db).then(() =>
    db.prepare(
      `INSERT INTO endpoint_usage (endpoint, day, hits) VALUES (?, ?, 1)
       ON CONFLICT(endpoint, day) DO UPDATE SET hits = hits + 1`
    ).bind(endpoint, day).run()
  ).then(() => {}).catch(() => {}); // silently ignore tracking failures
}

/** Get usage stats for the last N days */
export async function getUsageStats(db: D1Database, days = 30): Promise<{
  by_endpoint: Record<string, number>;
  by_day: { day: string; endpoint: string; hits: number }[];
  total: number;
}> {
  await ensureTable(db);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const [summaryResult, dailyResult] = await db.batch([
    db.prepare(
      `SELECT endpoint, SUM(hits) as total FROM endpoint_usage WHERE day >= ? GROUP BY endpoint ORDER BY total DESC`
    ).bind(cutoff),
    db.prepare(
      `SELECT day, endpoint, hits FROM endpoint_usage WHERE day >= ? ORDER BY day DESC, hits DESC`
    ).bind(cutoff),
  ]);

  const by_endpoint: Record<string, number> = {};
  let total = 0;
  for (const row of (summaryResult.results || []) as { endpoint: string; total: number }[]) {
    by_endpoint[row.endpoint] = row.total;
    total += row.total;
  }

  const by_day = ((dailyResult.results || []) as { day: string; endpoint: string; hits: number }[]).map(r => ({
    day: r.day,
    endpoint: r.endpoint,
    hits: r.hits,
  }));

  return { by_endpoint, by_day, total };
}
