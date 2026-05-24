// ─── Centralized Cache TTL Configuration ─────────────────────────────
// All cache TTL values in one place for easy tuning.

/** Default analysis cache: 1 hour */
export const ANALYSIS_CACHE_TTL_MS = 60 * 60 * 1000;

/** PageSpeed results: 24 hours (aggressive rate-limiting) */
export const PERF_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** AI analysis results: 24 hours */
export const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** HIBP breach catalog: 24 hours */
export const BREACH_CATALOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Per-domain breach results: 6 hours */
export const BREACH_RESULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
