# Scoring Calibration Changes — 2026-05-27

## Problem

Scoring was badly compressed: 93% of domains got an A, score range was only 16 points (81-97), and domains like `lingscars.com` scored the same as Microsoft. Key signals like data breaches and Tranco ranking weren't being scored at all.

## Changes Made

### 1. Steepened severity curve
**File:** `worker/src/config/scoring-thresholds.ts`

| Severity | Before | After |
|----------|--------|-------|
| critical | 0 | 0 |
| high | 30 | 20 |
| medium | 65 | 50 |
| low | 80 | 70 |
| info | 92 | 85 |
| good | 100 | 100 |

This spreads the scoring range — "info" findings (which dominate most axes) now contribute 85 instead of 92, creating 15 points of headroom instead of 8.

### 2. Raised grade thresholds
**Files:** `worker/src/actions/analyze/contextual-scoring.ts`, `worker/src/actions/analyze/scoring.ts`

| Grade | Before | After |
|-------|--------|-------|
| A | ≥85 | ≥90 |
| B | ≥70 | ≥75 |
| C | ≥55 | ≥60 |
| D | ≥40 | ≥45 |
| F | <40 | <45 |

Combined with the steeper curve, this ensures only genuinely well-configured domains get an A.

### 3. Recalibrated baseline signals
**File:** `worker/src/actions/analyze/contextual-scoring.ts`

- **Blocklist clean (Security axis):** `severity: "good" → "info"`, `weight: 3 → 1`. Not being blocklisted is a baseline expectation, not an achievement.
- **Blocklist clean (Trust axis):** `severity: "good" → "info"`, `weight: 5 → 3`. Penalty side (when listed) stays at high/critical severity — being listed still hurts badly.
- **Domain age (Trust axis):** `weight: 4 → 3`. Still meaningful, but no longer dominates the trust axis alongside blocklist.

### 4. Added data breach scoring (HIBP)
**Files:** `worker/src/actions/analyze/contextual-scoring.ts`, `worker/src/actions/analyze/core.ts`

Breaches now feed into the **Trust axis** with graduated severity:

| Condition | Severity | Weight |
|-----------|----------|--------|
| >10M accounts pwned | high | 4 |
| >1M accounts OR 3+ verified breaches | medium | 3 |
| 1+ verified breach | low | 2 |
| 1+ unverified breach | info | 1 |

Includes tradeoff note: "Historical breaches reflect past security incidents, not necessarily current posture."

### 5. Added Tranco ranking scoring
**File:** `worker/src/actions/analyze/contextual-scoring.ts`

Tranco web popularity ranking feeds into the **Trust axis**:

| Rank | Severity | Weight |
|------|----------|--------|
| Top 1K | good | 3 |
| Top 10K | good | 2 |
| Top 100K | info | 1 |
| Unranked | no finding | — |

No penalty for unranked domains — Tranco is a bonus for established web presence.

### 6. Added social account presence scoring
**File:** `worker/src/actions/analyze/contextual-scoring.ts`

Social accounts feed into the **Visibility axis**:

| Condition | Severity | Weight |
|-----------|----------|--------|
| 2+ verified (rel=me) accounts | good | 3 |
| 1 verified OR 2+ linked | good | 2 |
| 1+ detected (any method) | info | 1 |
| None detected (content/corporate) | low | 1 |
| None detected (other) | info | 1 |

**Note:** Social accounts are currently fetched via a separate `/api/social/:domain` endpoint, not during the analysis pipeline. The `socialAccounts` parameter is passed as `null` for now. The plumbing is in place for when social detection is integrated into the analysis pipeline.

### 7. Wired new parameters in core.ts
**File:** `worker/src/actions/analyze/core.ts`

Added `breaches: breachResult`, `trancoRank: tranco`, and `socialAccounts: null` to the `calculateDomainScore()` call. Breaches and Tranco are already available from the analysis pipeline. Social accounts are a future integration.

## Verification

- TypeScript compilation: ✅ `npx tsc --noEmit` passes with zero errors
- Bun build: ✅ `bun build src/index.ts` succeeds (74 modules, 0.43 MB)
- No test files exist in the worker directory

## Expected Impact

With these changes:
- Domains previously scoring 88-92 should spread out to ~75-90
- Only domains with excellent configurations across all axes should reach A (≥90)
- Domains with data breaches (Yahoo, LinkedIn, Adobe, etc.) will see reduced Trust scores
- Popular domains (Tranco-ranked) will get a Trust boost
- The B grade (75-89) becomes the expected range for "decent but not great" domains
- C/D/F grades become reachable for genuinely problematic domains
