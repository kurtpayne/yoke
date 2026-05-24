export async function getRecentLookups(db: D1Database, limit: number = 10) {
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const rows = await db.prepare(
    "SELECT id, domain, results_json, analyzed_at FROM domain_lookups ORDER BY analyzed_at DESC LIMIT ?"
  ).bind(safeLimit * 3).all<{ id: number; domain: string; results_json: string; analyzed_at: number }>();

  const seen = new Set<string>();
  const lookups: Array<{ id: number; domain: string; analyzed_at: string; is_up: boolean | null; ssl_grade: string | null }> = [];

  for (const row of rows.results ?? []) {
    if (seen.has(row.domain)) continue;
    seen.add(row.domain);
    let isUp: boolean | null = null;
    let sslGrade: string | null = null;
    try {
      const parsed = JSON.parse(row.results_json);
      isUp = parsed.status?.is_up ?? null;
      sslGrade = parsed.ssl?.grade ?? null;
    } catch { /* ignore */ }
    lookups.push({
      id: row.id,
      domain: row.domain,
      analyzed_at: new Date(row.analyzed_at).toISOString(),
      is_up: isUp,
      ssl_grade: sslGrade,
    });
    if (lookups.length >= safeLimit) break;
  }

  return { lookups };
}
