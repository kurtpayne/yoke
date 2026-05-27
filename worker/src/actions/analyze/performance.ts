import { fetchWithTimeout } from "../../helpers";
import { PERF_CACHE_TTL_MS } from "../../config/cache";
import { logApiError } from "../../api-errors";
import type { PerformanceResult, CompressionResult } from "./types";

// ─── PageSpeed ───────────────────────────────────────────────────────


export async function checkPageSpeed(domain: string, ttfbFallback: number | null, db?: D1Database, apiKey?: string, flyAuthSecret?: string): Promise<PerformanceResult> {
  // Check separate performance cache (24h TTL)
  if (db) {
    try {
      const cached = await db.prepare("SELECT data_json, cached_at FROM domain_cache WHERE domain = ? AND cache_type = 'performance' ORDER BY cached_at DESC LIMIT 1")
        .bind(domain).first<{ data_json: string; cached_at: number }>();
      if (cached && Date.now() - cached.cached_at < PERF_CACHE_TTL_MS) {
        return JSON.parse(cached.data_json) as PerformanceResult;
      }
    } catch { /* cache miss */ }
  }

  // Try Fly proxy first (more reliable, avoids CF egress issues)
  try {
    const flyUrl = `https://yoke-probe.fly.dev/pagespeed?domain=${encodeURIComponent(domain)}`;
    const headers: Record<string, string> = {};
    if (flyAuthSecret) {
      headers["Authorization"] = `Bearer ${flyAuthSecret}`;
    }
    const res = await fetchWithTimeout(flyUrl, { timeout: 30000, headers });
    if (res.ok) {
      const result = await res.json() as PerformanceResult;
      if (result.score != null) {
        // Cache successful results for 24h
        if (db) {
          try {
            await db.prepare("INSERT OR REPLACE INTO domain_cache (domain, cache_type, data_json, cached_at) VALUES (?, 'performance', ?, ?)")
              .bind(domain, JSON.stringify(result), Date.now()).run();
          } catch { /* ignore */ }
        }
        return result;
      }
      // Fly proxy returned error (e.g., rate limited), fall through
    }
  } catch (e) { console.error("[PageSpeed] Fly proxy error:", e instanceof Error ? e.message : String(e)); }

  // Fallback to direct API (also 20s timeout)
  const directResult = await tryPageSpeedDirect(domain, ttfbFallback, db, apiKey);
  if (db && directResult.score != null) {
    try {
      await db.prepare("INSERT OR REPLACE INTO domain_cache (domain, cache_type, data_json, cached_at) VALUES (?, 'performance', ?, ?)")
        .bind(domain, JSON.stringify(directResult), Date.now()).run();
    } catch { /* ignore */ }
  }
  return directResult;
}

async function tryPageSpeedDirect(domain: string, ttfbFallback: number | null, db?: D1Database, apiKey?: string): Promise<PerformanceResult> {
  try {
    const keyParam = apiKey ? `&key=${apiKey}` : "";
    const res = await fetchWithTimeout(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${encodeURIComponent(domain)}&strategy=mobile&category=performance${keyParam}`, { timeout: 48000 });
    if (res.status === 429) { if (db) logApiError(db, { api: "pagespeed", status: 429, message: "Rate limited", domain }); return { score: null, fcp: null, lcp: null, tbt: null, cls: null, si: null, ttfb: ttfbFallback, strategy: "mobile", error: "Rate limited — try again later", screenshot: null }; }
    if (!res.ok) { if (db) logApiError(db, { api: "pagespeed", status: res.status, message: `API error`, domain }); return { score: null, fcp: null, lcp: null, tbt: null, cls: null, si: null, ttfb: ttfbFallback, strategy: "mobile", error: `API error (${res.status})`, screenshot: null }; }
    const data = await res.json() as { lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, { numericValue?: number; details?: { data?: string } }>; }; };
    const lr = data.lighthouseResult;
    const audits = lr?.audits ?? {};
    const perfScore = lr?.categories?.performance?.score;
    const screenshotData = audits["final-screenshot"]?.details?.data ?? null;
    const result: PerformanceResult = { score: perfScore != null ? Math.round(perfScore * 100) : null, fcp: audits["first-contentful-paint"]?.numericValue ?? null, lcp: audits["largest-contentful-paint"]?.numericValue ?? null, tbt: audits["total-blocking-time"]?.numericValue ?? null, cls: audits["cumulative-layout-shift"]?.numericValue ?? null, si: audits["speed-index"]?.numericValue ?? null, ttfb: audits["server-response-time"]?.numericValue ?? ttfbFallback, strategy: "mobile", error: null, screenshot: screenshotData };
    return result;
  } catch (e) { console.error("[PageSpeed] Direct API error:", e instanceof Error ? e.message : String(e)); return { score: null, fcp: null, lcp: null, tbt: null, cls: null, si: null, ttfb: ttfbFallback, strategy: "mobile", error: "PageSpeed timed out — site may block automated testing", screenshot: null }; }
}

// ─── NEW: Compression Detection ─────────────────────────────────────

export function detectCompression(headers: Record<string, string> | null): CompressionResult | null {
  if (!headers) return null;
  const encoding = headers["content-encoding"] ?? null;
  const varyAE = (headers["vary"] ?? "").toLowerCase().includes("accept-encoding");
  // CF Workers auto-decompress, stripping content-encoding. If vary: accept-encoding is set,
  // the origin supports compression even if we can't see the encoding header.
  return {
    encoding: encoding ?? (varyAE ? "gzip (inferred from Vary)" : null),
    vary_accept_encoding: varyAE,
  };
}

// ─── Website Carbon ──────────────────────────────────────────────────

export async function checkCarbon(domain: string): Promise<{ co2_per_view: number | null; cleaner_than: number | null; green: boolean } | null> {
  try {
    const res = await fetchWithTimeout(`https://api.websitecarbon.com/site?url=https://${encodeURIComponent(domain)}`, { timeout: 10000 });
    if (!res.ok) return null;
    const data = await res.json() as { cleanerThan?: number; statistics?: { co2?: { grid?: { grams?: number } } }; green?: boolean | string; };
    return { co2_per_view: data.statistics?.co2?.grid?.grams ?? null, cleaner_than: data.cleanerThan ?? null, green: data.green === true || data.green === "true" };
  } catch { return null; }
}
