export async function getRecentLookups(kv: KVNamespace, limit: number = 8) {
  const safeLimit = Math.min(Math.max(1, limit), 8);

  try {
    const raw = await kv.get("recent:index", "text");
    if (!raw) return { lookups: [] };
    const entries = JSON.parse(raw) as Array<{
      domain: string;
      analyzed_at: string;
      is_up: boolean | null;
      ssl_grade: string | null;
      score: number | null;
      grade: string | null;
      archetype: string | null;
    }>;

    // Deduplicate by domain, keep most recent
    const seen = new Set<string>();
    const lookups: typeof entries = [];
    for (const entry of entries) {
      if (seen.has(entry.domain)) continue;
      seen.add(entry.domain);
      lookups.push(entry);
      if (lookups.length >= safeLimit) break;
    }

    return { lookups };
  } catch {
    return { lookups: [] };
  }
}
