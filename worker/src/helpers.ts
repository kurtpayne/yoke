// Cloudflare Worker environment bindings
export interface Env {
  DB: D1Database;
  STATS_DB: D1Database;
  OPENROUTER_API_KEY?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  GOOGLE_PAGESPEED_API_KEY?: string;
  WHOISFREAKS_API_KEY?: string;
}

// ─── Shared Helpers ──────────────────────────────────────────────────

// Re-export from centralized config for backward compatibility
import { ANALYSIS_CACHE_TTL_MS } from "./config/cache";
export const CACHE_TTL_MS = ANALYSIS_CACHE_TTL_MS;

export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.replace(/\/.*$/, "");
  d = d.replace(/^www\./, "");
  // Convert IDN (Unicode) domains to punycode via the URL API
  try {
    const url = new URL(`http://${d}`);
    d = url.hostname;
  } catch { /* not a valid URL, keep as-is for downstream validation */ }
  return d;
}

export async function fetchWithTimeout(
  url: string,
  opts: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = 8000, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Shared Constants ────────────────────────────────────────────────

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-OpenRouter-Key",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "frame-ancestors 'self' https://*.chromiumapp.org chrome-extension://*",
};

export const MULTI_PART_TLDS = ["co.uk", "com.au", "co.nz", "co.jp", "com.br", "co.in", "org.uk", "net.au", "ac.uk"];

// ─── External Service URLs ───────────────────────────────────────────

export const FLY_PROBE_URL = "https://yoke-probe.fly.dev";

// ─── SSRF Protection ─────────────────────────────────────────────────
// Block fetches to private/reserved IP ranges from the Worker.
// The Fly probe has its own Go-level IP check; this protects Worker-side fetches.

const PRIVATE_IP_PATTERNS = [
  /^127\./,                     // loopback
  /^10\./,                      // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./,// RFC1918
  /^192\.168\./,                // RFC1918
  /^169\.254\./,                // link-local
  /^0\./,                       // unspecified
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // carrier-grade NAT
  /^192\.0\.0\./,               // IETF protocol
  /^192\.0\.2\./,               // documentation (TEST-NET-1)
  /^198\.51\.100\./,            // documentation (TEST-NET-2)
  /^203\.0\.113\./,             // documentation (TEST-NET-3)
  /^198\.1[89]\./,              // benchmarking
  /^2[45]\d\./,                 // multicast + reserved (240-255)
];

/** Check if a URL points to a private/reserved IP or localhost. */
export function isBlockedUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
    // Block localhost variants
    if (host === "localhost" || host === "::1" || host === "0.0.0.0") return true;
    // Block IPv6 private
    if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host.startsWith("ff")) return true;
    // Block IPv4 private
    for (const pat of PRIVATE_IP_PATTERNS) {
      if (pat.test(host)) return true;
    }
    return false;
  } catch {
    return true; // malformed URL = block
  }
}

/**
 * Follow redirects manually with SSRF protection.
 * Checks each redirect Location against private IP ranges before following.
 * Returns the final response. Max 5 hops.
 */
export async function safeFetchWithRedirects(
  url: string,
  opts: RequestInit & { timeout?: number; maxRedirects?: number } = {},
): Promise<Response> {
  const { maxRedirects = 5, ...fetchOpts } = opts;
  let currentUrl = url;

  for (let i = 0; i <= maxRedirects; i++) {
    if (isBlockedUrl(currentUrl)) {
      throw new Error(`Blocked: private/reserved IP in URL ${currentUrl}`);
    }
    const res = await fetchWithTimeout(currentUrl, { ...fetchOpts, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && i < maxRedirects) {
      const location = res.headers.get("location");
      if (location) {
        currentUrl = location.startsWith("http") ? location : new URL(location, currentUrl).href;
        continue;
      }
    }
    return res;
  }
  throw new Error("Too many redirects");
}

// ─── Bounded Text Reader ─────────────────────────────────────────────
// Reads response body up to maxBytes to prevent unbounded memory usage
// from malicious or oversized target-controlled responses.

export async function boundedText(response: Response, maxBytes: number = 2 * 1024 * 1024): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        reader.cancel();
        break;
      }
      chunks.push(value);
    }
  } catch {
    // Read error — return what we have
  }
  const decoder = new TextDecoder();
  return chunks.map(c => decoder.decode(c, { stream: true })).join("") + decoder.decode();
}

// ─── D1 Cache Helpers ────────────────────────────────────────────────

export async function getFromCache(db: D1Database, domain: string, cacheType: string, ttlMs: number): Promise<unknown | null> {
  const row = await db.prepare(
    "SELECT data_json, cached_at FROM domain_cache WHERE domain = ? AND cache_type = ? ORDER BY cached_at DESC LIMIT 1"
  ).bind(domain, cacheType).first<{ data_json: string; cached_at: number }>();
  if (row && Date.now() - row.cached_at < ttlMs) return JSON.parse(row.data_json);
  return null;
}

export async function setCache(db: D1Database, domain: string, cacheType: string, data: unknown): Promise<void> {
  await db.prepare(
    "INSERT INTO domain_cache (domain, cache_type, data_json, cached_at) VALUES (?, ?, ?, ?)"
  ).bind(domain, cacheType, JSON.stringify(data), Date.now()).run();
}

// ─── D1 Cache Cleanup ────────────────────────────────────────────────
// Probabilistic cleanup: ~5% of requests trigger a cleanup pass to prevent
// unbounded table growth. Deletes expired cache rows and old lookup rows.

export async function maybePruneCache(db: D1Database): Promise<void> {
  if (Math.random() > 0.05) return; // 5% chance
  try {
    // Delete cache rows older than 48 hours (all TTLs are ≤24h, so 48h gives margin)
    const cutoff48h = Date.now() - (48 * 60 * 60 * 1000);
    await db.prepare("DELETE FROM domain_cache WHERE cached_at < ?").bind(cutoff48h).run();
    // Keep only the most recent 500 lookup rows
    await db.prepare(
      "DELETE FROM domain_lookups WHERE id NOT IN (SELECT id FROM domain_lookups ORDER BY analyzed_at DESC LIMIT 500)"
    ).run();
  } catch { /* cleanup failure is non-critical */ }
}
