# Scoring Redesign v2 — Pre-Launch

**Decision date:** 2026-05-30
**Target:** Ship before June 23 launch

## Summary

Replace the current 5-axis weighted-average model with a 6-category anchor-and-adjust model using weighted geometric mean for the composite grade.

## Categories (was: Axes)

| Old | New | Signals | Weight |
|-----|-----|---------|--------|
| Security | **Security** | ~43 | 0.24 |
| Performance | **Speed** | 16 | 0.18 |
| Infrastructure | **Foundations** | 18 | 0.18 |
| Trust → split | **Reputation** | ~20 | 0.15 |
| Visibility | **Discoverability** | ~18 | 0.13 |
| *(new)* | **Email** | 8 | 0.12 |

### Signal Assignment Rules

**Primary-only.** Each signal belongs to exactly one category. No dual-scoring.

### Key Reclassifications

| Signal | Old Axis | New Category | Rationale |
|--------|----------|-------------|-----------|
| dnssec | security | **Security** | Prevents DNS spoofing — security objective |
| caa, caa_records, caa_wildcard_unrestricted, caa_iodef | infrastructure/security | **Security** | Certificate issuance restriction = security |
| ct_caa_mismatch | trust | **Security** | CT/CAA divergence = security concern |
| cdn | performance | **Foundations** | Platform choice, not speed outcome |
| http2, http3, http1_only | performance | **Foundations** | Protocol modernity = infrastructure |
| slow_connection | performance | **Foundations** | Network quality, not user-perceived speed |
| ops_transparency | trust | **Foundations** | Operational maturity |
| cert_validation_type | trust | **Foundations** | PKI maturity |
| email_auth, email_auth_incomplete, email_trust | security | **Email** | Standalone category |
| spf_without_dmarc | security | **Email** | Email auth |
| dmarc_reject | trust | **Email** | Email policy enforcement |
| mta_sts | security | **Email** | Email transport security |
| bimi_record | trust | **Email** | Email brand indicator |
| mx_redundancy | infrastructure | **Email** | Mail infrastructure |
| script_privacy, third_party_scripts | security | **Reputation** | Privacy posture |
| referrer_policy, referrer_policy_missing, referrer_policy_unsafe | security | **Security** | Header defense (stays) |
| permissions_policy, permissions_policy_missing, permissions_policy_unrestricted | security | **Security** | Header defense (stays) |
| cookie_consent_cmp, cookie_consent_missing, cookie_compliance, pre_consent_cookies | trust | **Reputation** | Privacy/compliance |
| organizational_identity | trust | **Reputation** | Org transparency |
| domain_age_trust, registration_length | trust | **Reputation** | Domain credibility |
| breaches | trust | **Reputation** | Breach history |
| tranco_rank, domain_popularity | trust/visibility | **Reputation** | Domain credibility |
| blocklist_listed, blocklist_trust | security/trust | **Reputation** | Domain reputation |
| greynoise_noise, greynoise_riot | trust | **Reputation** | IP reputation |
| legal_pages | visibility | **Reputation** | Org legitimacy |
| accessibility | visibility | **Discoverability** | WCAG/reach |
| social_meta, og_completeness | visibility | **Discoverability** | Social sharing |

## Scoring Model: Anchor-and-Adjust

Replace `computeAxisScore` (weighted average of findings) with:

```
category_score = clamp(BASELINE + positives - negatives - absences, 0, 100)
```

- **BASELINE = 50** — neutral starting point
- **Positives:** Each `good` finding adds `GOOD_BONUS[weight]` points
- **Negatives:** Each non-good finding subtracts `SEVERITY_PENALTY[severity] × weight_factor`
- **Absences:** Each expected-but-missing signal subtracts a mild penalty

### Severity Penalty Scale

| Severity | Penalty per weight unit |
|----------|----------------------|
| critical | -15 |
| high | -10 |
| medium | -5 |
| low | -2 |
| info | -1 |

### Good Bonus Scale

| Weight | Bonus |
|--------|-------|
| 1 | +2 |
| 2 | +3 |
| 3 | +4 |
| 4 | +5 |
| 5 | +6 |

### Expected Baselines (absence penalties)

Each category defines signals that a competent site should have. If the signal is completely absent from findings (never fired), a mild penalty applies.

**Security:**
- HSTS (-3 if absent)
- HTTPS redirect (-3 if absent)
- TLS 1.2+ (-2 if absent, only when SSL data exists)

**Email:**
- SPF (-4 if absent)
- DMARC (-3 if absent)

**Speed:**
- No absences — CWV signals always fire if PageSpeed runs. If PageSpeed is unavailable, that has its own signal.

**Foundations:**
- CDN (-4 if absent)
- HTTP/2+ (-3 if absent, only when HTTP protocol detected)
- IPv6 (-2 if absent)

**Discoverability:**
- Title tag (-2 if absent)
- Meta description (-1 if absent)

**Reputation:**
- Privacy/terms pages (-2 if absent)

### Absence Detection

An "absent" signal means no finding was emitted for that signal key at all. This is different from a finding with severity `info` — `info` means "we checked and it's neutral." Absence means "we expected this signal and it didn't fire."

Implementation: after all findings are collected for a category, check whether expected baseline signal keys appear. If not, apply the absence penalty directly to the score.

## Composite: Weighted Geometric Mean

Replace arithmetic weighted mean with:

```ts
function computeComposite(scores: Record<Category, number>): number {
  // Floor at 1 to prevent geometric mean collapse
  let logSum = 0;
  for (const cat of CATEGORIES) {
    const s = Math.max(scores[cat], 1);
    logSum += WEIGHTS[cat] * Math.log(s);
  }
  return Math.round(Math.exp(logSum));
}
```

Weights sum to 1.0.

## Per-Category Hard Caps

Applied to the composite grade AFTER geometric mean calculation:

| Condition | Max Grade |
|-----------|-----------|
| Any category has a `critical` finding | D |
| Any category has a `high` finding | C+ |
| Any category score < 30 | B |
| Two+ categories score < 40 | C+ |

## Grade Thresholds

To be calibrated empirically after implementing anchor-and-adjust + geometric mean. Initial proposal (adjust after running across reference domains):

| Grade | Threshold |
|-------|-----------|
| A+ | ≥ 88 |
| A | ≥ 82 |
| B+ | ≥ 76 |
| B | ≥ 70 |
| C+ | ≥ 64 |
| C | ≥ 58 |
| D+ | ≥ 50 |
| D | ≥ 40 |
| F | < 40 |

These thresholds WILL change after calibration.

## Archetype Handling

Archetypes (content, commerce, application, infrastructure, institutional, community, personal) still apply. They modify severity of individual signals contextually, same as today. The category a signal belongs to doesn't change by archetype.

**Email category + infrastructure archetype:** API/infrastructure domains that don't send email can have Email scored as "Not Assessed" instead of penalizing. Archetype detection already identifies these.

## Implementation Phases

### Phase 1: Signal Reclassification
- Update `axis` field for all signals in `signal-registry.ts`
- Add `email` to Axis type
- Rename axis values: `performance` → `speed`, `infrastructure` → `foundations`, `trust` → `reputation`, `visibility` → `discoverability`
- Update `AXIS_WEIGHTS` to 6-category weights
- Update all archetype notes referencing old axis names
- Run tests, fix breakage

### Phase 2: Scoring Engine
- Implement `computeAnchorAdjustScore` to replace `computeAxisScore`
- Define expected baselines per category
- Implement absence detection
- Replace `computeComposite` with geometric mean
- Implement per-category hard caps
- Update `gradeFromComposite` thresholds (initial values, will recalibrate)
- Update all tests

### Phase 3: Client Updates
- Rename all axis labels in UI components
- Add Email category tab/panel
- Update radar chart from 5 to 6 spokes (hexagonal)
- Update share cards and OG images
- Update comparison view

### Phase 4: AI & Prompt Updates
- Update AI analysis prompt with new categories
- Update Grade-Up recommendations
- Update cross-signal insights references

### Phase 5: Calibration
- Run scoring against 50-100 reference domains
- Compare old vs new scores
- Adjust grade thresholds
- Adjust absence penalties
- Verify no pathological cases (sites that should score well don't, or vice versa)
- Update daily_snapshots schema if needed

## Reference Domains for Calibration

Mix of well-known sites across quality spectrum:
- **Expected A-tier:** cloudflare.com, github.com, google.com, stripe.com
- **Expected B-tier:** nytimes.com, shopify.com, reddit.com
- **Expected C-tier:** Small business sites, basic WordPress installs
- **Expected D/F-tier:** Sites with known security issues, abandoned domains
- **Self-test:** yoke.lol
