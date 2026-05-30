import { logApiError } from "../api-errors";
import { fetchWithTimeout, getFromCache, normalizeDomain, setCache } from "../helpers";

export async function getSubdomains(kv: KVNamespace, rawDomain: string, statsDb?: D1Database) {
  const domain = normalizeDomain(rawDomain);
  const cached = await getFromCache(kv, domain, "subdomains", 60 * 60 * 1000);
  if (cached) return { ...(cached as { subdomains: string[] }), cached: true };

  try {
    const res = await fetchWithTimeout(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, {
      timeout: 15000,
    });
    if (!res.ok) {
      if (statsDb)
        logApiError(statsDb, {
          api: "crt.sh",
          status: res.status,
          message: "Certificate transparency lookup failed",
          domain,
        });
      return { subdomains: [], cached: false };
    }
    const data = (await res.json()) as Array<{ common_name: string; name_value: string }>;
    const subs = new Set<string>();
    for (const entry of data) {
      const names = entry.name_value ? entry.name_value.split("\n") : [];
      if (entry.common_name) names.push(entry.common_name);
      for (const name of names) {
        const clean = name.trim().toLowerCase().replace(/^\*\./, "");
        if (clean?.endsWith(domain) && clean !== domain) subs.add(clean);
      }
    }
    const sorted = [...subs].sort();
    const result = { subdomains: sorted.slice(0, 200) };
    await setCache(kv, domain, "subdomains", result, 60 * 60 * 1000);
    return { ...result, cached: false };
  } catch (e) {
    if (statsDb) logApiError(statsDb, { api: "crt.sh", status: 0, message: String(e).slice(0, 200), domain });
    return { subdomains: [], cached: false };
  }
}
