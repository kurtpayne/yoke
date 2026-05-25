import { fetchWithTimeout, getFromCache, setCache } from "../helpers";
import { logApiError } from "../api-errors";

export async function getReverseIP(db: D1Database, rawIp: string) {
  const ip = rawIp.trim();
  const cached = await getFromCache(db, ip, "reverse_ip", 24 * 60 * 60 * 1000);
  if (cached) return { ...(cached as { domains: string[] }), cached: true };

  try {
    const res = await fetchWithTimeout(`https://api.hackertarget.com/reverseiplookup/?q=${encodeURIComponent(ip)}`, { timeout: 10000 });
    if (!res.ok) { logApiError(db, { api: "hackertarget", status: res.status, message: `Reverse IP lookup failed`, domain: ip }); return { domains: [], cached: false }; }
    const text = await res.text();
    if (text.includes("error") || text.includes("API count exceeded")) { logApiError(db, { api: "hackertarget", status: 429, message: text.slice(0, 100), domain: ip }); return { domains: [], cached: false }; }
    const domains = text.split("\n").map(d => d.trim()).filter(d => d && d.includes(".") && !d.startsWith("error"));
    const result = { domains: domains.slice(0, 100) };
    await setCache(db, ip, "reverse_ip", result);
    return { ...result, cached: false };
  } catch (e) { logApiError(db, { api: "hackertarget", status: 0, message: String(e).slice(0, 100), domain: ip }); return { domains: [], cached: false }; }
}
