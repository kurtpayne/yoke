-- DEPRECATED: This migration was for the old D1-based cache layer.
-- Cache has been migrated to Cloudflare KV (REFERENCE_DATA binding).
-- These tables are no longer used. New installations should skip this file
-- and only run 0002_domain_scores.sql against the yoke-stats database.
--
-- Original: D1 Schema for Yoke Domain Intelligence Cache

CREATE TABLE IF NOT EXISTS domain_lookups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  results_json TEXT NOT NULL,
  analyzed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS domain_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  cache_type TEXT NOT NULL,
  data_json TEXT NOT NULL,
  cached_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lookups_domain ON domain_lookups(domain);
CREATE INDEX IF NOT EXISTS idx_lookups_at ON domain_lookups(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_domain_type ON domain_cache(domain, cache_type);
CREATE INDEX IF NOT EXISTS idx_cache_at ON domain_cache(cached_at DESC);
