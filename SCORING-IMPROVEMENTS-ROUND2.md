# Scoring Improvements — Round 2

**Date:** 2026-05-27
**Files changed:** 6 files modified, 1 file created

---

## Improvement 1: Breach Grade Cap ✅

**File:** `worker/src/actions/analyze/contextual-scoring.ts`

Domains with catastrophic data breaches can no longer earn an A grade:
- **>500M total pwned accounts** → capped at B (even if composite says A)
- **>100M total pwned accounts** → capped at B
- This prevents embarrassments like yahoo.com (3B breached) earning an A

Changed `const grade` to `let grade` and added post-scoring override before the return statement.

## Improvement 2: Social Accounts in Analysis Pipeline ✅

**Files:**
- `worker/src/checks/social-accounts.ts` — NEW check file
- `worker/src/checks/registry.ts` — registered the new check
- `worker/src/actions/analyze/core.ts` — extracts result, passes to scoring + final output

Social account detection (rel=me, homepage links, probes) now runs as a standard Phase 2 check during analysis. Previously only available via a separate `/api/social/:domain` endpoint. Now the Visibility axis gets real social presence data:
- ≥2 verified (rel=me) accounts → good, weight 3
- ≥1 verified or ≥2 linked → good, weight 2
- Any detected → info, weight 1
- None detected (content/corporate) → low, weight 1

Results also included in the analysis JSON response as `social_accounts`.

## Improvement 3: Cert Transparency Findings ✅

**File:** `worker/src/actions/analyze/contextual-scoring.ts`

Previously `certTransparency` was in the function signature but generated zero findings. Now:
- **Wildcard certificates** → Security axis, info severity (low for institutional/commerce), weight 1. Tradeoff note about blast radius.
- **Certificate volume in CT logs** → Trust axis. >100 certs = good, >10 = info. Weight 1. Indicates established, active domain.

## Improvement 4: Per-Check + Overall Phase 2 Timeout ✅

**File:** `worker/src/actions/analyze/core.ts`

Previously, individual checks had no enforced timeout limit. Slow external APIs (PageSpeed, Wayback, HIBP, etc.) could accumulate, pushing the Worker past its ~45s wall-clock limit.

Now:
- **Per-check timeout (25s):** Each check's promise is raced against a 25s timer. If a check exceeds this, it falls back to its default value and the pipeline continues.
- **Overall Phase 2 deadline (35s):** All Phase 2 checks race against a 35s timer. If the deadline fires first, we proceed with whatever results have arrived (remaining checks default). This leaves ~10s for scoring + response assembly, well within the CF Worker limit.

Slow checks now degrade gracefully rather than killing the entire analysis.

## Improvement 5: Reliability Axis Enhancement ✅

**File:** `worker/src/actions/analyze/contextual-scoring.ts`

Added two new reliability signals from existing DNS data:
- **DNS TTL health:** Very low TTLs (<60s) get an info finding noting possible instability. Stable TTLs (≥3600s) get a good finding. Weight 1.
- **SOA record presence:** Authoritative zone delegation confirmed. Good severity, weight 1.

These add granularity to the reliability axis without requiring longitudinal monitoring data.

---

## Verification

- TypeScript compiles clean: `tsc --noEmit` passes
- All 153 tests pass: `vitest run` clean
- Registry test updated: 26 → 27 checks, `social_accounts` key added to expected order
