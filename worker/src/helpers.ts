// Cloudflare Worker environment bindings
export interface Env {
  DB: D1Database;
  OPENROUTER_API_KEY?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  GOOGLE_PAGESPEED_API_KEY?: string;
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
  "Access-Control-Allow-Headers": "Content-Type",
};

export const MULTI_PART_TLDS = ["co.uk", "com.au", "co.nz", "co.jp", "com.br", "co.in", "org.uk", "net.au", "ac.uk"];

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
