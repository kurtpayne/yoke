import { fetchWithTimeout, getFromCache, setCache } from "../helpers";

export async function getReverseIP(kv: KVNamespace, rawIp: string) {
  const ip = rawIp.trim();
  const cached = await getFromCache(kv, ip, "reverse_ip", 24 * 60 * 60 * 1000);
  if (cached) return { ...(cached as { domains: string[] }), cached: true };

  try {
    const res = await fetchWithTimeout(`https://api.hackertarget.com/reverseiplookup/?q=${encodeURIComponent(ip)}`, { timeout: 10000 });
    if (!res.ok) { return { domains: [], cached: false }; }
    const text = await res.text();
    if (text.includes("error") || text.includes("API count exceeded")) { return { domains: [], cached: false }; }
    const domains = text.split("\n").map(d => d.trim()).filter(d => d && d.includes(".") && !d.startsWith("error"));
    const result = { domains: domains.slice(0, 100) };
    await setCache(kv, ip, "reverse_ip", result, 24 * 60 * 60 * 1000);
    return { ...result, cached: false };
  } catch { return { domains: [], cached: false }; }
}
