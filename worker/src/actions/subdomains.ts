import { normalizeDomain, fetchWithTimeout, getFromCache, setCache } from "../helpers";

export async function getSubdomains(db: D1Database, rawDomain: string) {
  const domain = normalizeDomain(rawDomain);
  const cached = await getFromCache(db, domain, "subdomains", 60 * 60 * 1000);
  if (cached) return { ...(cached as { subdomains: string[] }), cached: true };

  try {
    const res = await fetchWithTimeout(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, { timeout: 15000 });
    if (!res.ok) return { subdomains: [], cached: false };
    const data = await res.json() as Array<{ common_name: string; name_value: string }>;
    const subs = new Set<string>();
    for (const entry of data) {
      const names = entry.name_value ? entry.name_value.split("\n") : [];
      if (entry.common_name) names.push(entry.common_name);
      for (const name of names) {
        const clean = name.trim().toLowerCase().replace(/^\*\./, "");
        if (clean && clean.endsWith(domain) && clean !== domain) subs.add(clean);
      }
    }
    const sorted = [...subs].sort();
    const result = { subdomains: sorted.slice(0, 200) };
    await setCache(db, domain, "subdomains", result);
    return { ...result, cached: false };
  } catch { return { subdomains: [], cached: false }; }
}
