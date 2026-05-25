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
  "X-Frame-Options": "DENY",
};

export const MULTI_PART_TLDS = ["co.uk", "com.au", "co.nz", "co.jp", "com.br", "co.in", "org.uk", "net.au", "ac.uk"];

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
