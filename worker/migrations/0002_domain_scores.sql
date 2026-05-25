-- D1 Schema for Historical Domain Score Logging
-- Tracks scoring data on every analysis for trend detection

CREATE TABLE IF NOT EXISTS domain_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  composite_score INTEGER NOT NULL,
  security_score INTEGER NOT NULL,
  performance_score INTEGER NOT NULL,
  reliability_score INTEGER NOT NULL,
  trust_score INTEGER NOT NULL,
  visibility_score INTEGER NOT NULL,
  archetype TEXT NOT NULL,
  archetype_confidence REAL NOT NULL,
  scored_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(domain, scored_at)
);

CREATE INDEX IF NOT EXISTS idx_domain_scores_domain ON domain_scores(domain);
CREATE INDEX IF NOT EXISTS idx_domain_scores_scored_at ON domain_scores(scored_at);
