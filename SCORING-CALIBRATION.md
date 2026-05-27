# Yoke Scoring Calibration Audit

**Date:** 2026-05-27  
**Domains tested:** 45 successful out of 75 attempted (30 timed out at the CF Worker level — separate issue)  
**Methodology:** API calls to `https://yoke.lol/{domain}` with `Accept: application/json`, across 14 categories

---

## 1. Full Results Table

Sorted by overall composite score (descending).

| Domain | Overall | Grade | Security | Performance | Reliability | Trust | Visibility | Category |
|--------|---------|-------|----------|-------------|-------------|-------|------------|----------|
| proton.me | 97 | A | 98 | 98 | 94 | 97 | 100 | Security |
| ca.gov | 96 | A | 98 | 93 | 92 | 97 | 97 | Government |
| cloudflare.com | 95 | A | 100 | 86 | 100 | 98 | 86 | Big Tech |
| etsy.com | 95 | A | 97 | 92 | 97 | 99 | 90 | E-commerce |
| apple.com | 94 | A | 99 | 76 | 91 | 96 | 100 | Big Tech |
| facebook.com | 94 | A | 98 | 97 | 87 | 100 | 90 | Social |
| whitehouse.gov | 94 | A | 96 | 73 | 96 | 97 | 99 | Government |
| godaddy.com | 93 | A | 97 | 92 | 95 | 100 | 80 | Hosting |
| reuters.com | 93 | A | 97 | 92 | 88 | 100 | 90 | Media |
| usa.gov | 93 | A | 89 | 82 | 99 | 96 | 100 | Government |
| yoke.lol | 93 | A | 99 | 85 | 98 | 85 | 100 | Self |
| google.com | 92 | A | 96 | 73 | 95 | 100 | 100 | Big Tech |
| jvns.ca | 92 | A | 89 | 93 | 93 | 99 | 88 | Indie |
| mit.edu | 92 | A | 97 | 71 | 94 | 96 | 86 | University |
| stanford.edu | 92 | A | 99 | 80 | 82 | 98 | 88 | University |
| walmart.com | 92 | A | 97 | 85 | 88 | 96 | 97 | E-commerce |
| berkeley.edu | 91 | A | 89 | 78 | 94 | 98 | 94 | University |
| linkedin.com | 91 | A | 99 | 79 | 100 | 99 | 74 | Social |
| stripe.com | 91 | A | 98 | 69 | 97 | 100 | 97 | Finance |
| danluu.com | 90 | A | 87 | 99 | 97 | 99 | 68 | Indie |
| ebay.com | 90 | A | 94 | 85 | 93 | 98 | 74 | E-commerce |
| hackernews.com | 90 | A | 95 | 97 | 94 | 96 | 66 | Misc |
| irs.gov | 90 | A | 89 | 66 | 97 | 94 | 89 | Government |
| simonwillison.net | 90 | A | 84 | 92 | 97 | 100 | 76 | Indie |
| twitter.com | 90 | A | 100 | 75 | 96 | 96 | 81 | Social |
| example.com | 89 | A | 89 | 94 | 96 | 98 | 70 | Misc |
| harvard.edu | 89 | A | 81 | 78 | 96 | 96 | 100 | University |
| namecheap.com | 89 | A | 97 | 74 | 96 | 97 | 76 | Hosting |
| wordpress.com | 89 | A | 93 | 70 | 97 | 98 | 93 | CMS |
| amazon.com | 88 | A | 86 | 86 | 95 | 99 | 73 | E-commerce |
| lingscars.com | **88** | **A** | 91 | 72 | 97 | 97 | 76 | **Sketchy** |
| microsoft.com | 88 | A | 87 | 83 | 95 | 99 | 74 | Big Tech |
| signal.org | 88 | A | 89 | 79 | 97 | 100 | 77 | Security |
| wikipedia.org | 88 | A | 93 | 79 | 92 | 97 | 77 | Misc |
| archive.org | 87 | A | 97 | 71 | 95 | 100 | 73 | Misc |
| badssl.com | 87 | A | 81 | 94 | 96 | 99 | 66 | Sketchy |
| gmail.com | 87 | A | 99 | 72 | 96 | 95 | 73 | Email |
| info.cern.ch | 87 | A | 84 | 91 | 89 | 100 | 70 | Misc |
| letsencrypt.org | 87 | A | 100 | 72 | 98 | 100 | 81 | Security |
| zombo.com | 86 | A | 85 | 78 | 96 | 100 | 70 | Sketchy |
| github.com | 85 | A | 97 | 68 | 84 | 97 | 81 | Big Tech |
| marco.org | 85 | A | 86 | 71 | 97 | 100 | 70 | Indie |
| arngren.net | 84 | B | 85 | 74 | 92 | 99 | 68 | Sketchy |
| geocities.ws | 82 | B | 83 | 76 | 93 | 94 | 64 | Sketchy |
| httpforever.com | 81 | B | 71 | 74 | 89 | 99 | 80 | Sketchy |

---

## 2. Distribution Analysis

### Overall Scores
```
Count:    45
Min:      81    Max: 97    Range: 16 (!!!)
Mean:     89.9  Median: 90
```

### Histogram
```
80-84:  ███               (3)
85-89:  █████████████████ (17)
90-94:  ████████████████████ (21)
95-99:  ████              (4)
```

### Grade Distribution
```
A:  42 / 45  (93%)
B:   3 / 45  ( 7%)
C:   0 / 45  ( 0%)
D:   0 / 45  ( 0%)
F:   0 / 45  ( 0%)
```

### Per-Axis Statistics
```
Axis           Min   Max   Mean    <70   70-84   85+
─────────────────────────────────────────────────────
Security        71   100   92.3     0      6     39
Performance     66    99   81.4     3     24     18
Reliability     82   100   94.2     0      2     43
Trust           85   100   97.7     0      0     45
Visibility      64   100   82.7     5     20     20
```

---

## 3. Critical Findings — Where Scoring Is Off

### Finding 1: **Trust axis is completely non-discriminating** 🚨
- Range: 85-100. Every single domain scores 85+.
- `geocities.ws` gets Trust 94. `httpforever.com` gets Trust 99. `zombo.com` gets Trust 100.
- **Root cause:** Trust is dominated by two "easy good" signals — domain age (weight 4) and clean blocklist (weight 5). Any domain that's been around a few years and isn't on a blocklist automatically gets ~95+ Trust. There are no negative signals that meaningfully pull Trust down. The blocklist signal is binary (clean=good, listed=critical) with weight 5, so being clean gives 100 points on a weight-5 finding. Domain age for anything >3 years gives "good" (100) at weight 4. These two alone create a floor of ~97.
- **Impact:** Trust axis is dead weight — it inflates composite scores for garbage domains.

### Finding 2: **Reliability axis is nearly non-discriminating** 🚨
- Range: 82-100. Minimum score is 82.
- Even sites with minimal DNS infrastructure get reliability 89+.
- **Root cause:** Having 2 nameservers (severity "info" = 92 points, weight 4) plus any working DNS gives a floor of ~85. The reliability axis lacks negative signals — there's no check for actual uptime, response errors, or service degradation. "Consistent DNS across resolvers" (weight 3, good) is present for almost everything.
- **Impact:** Reliability barely differentiates. A site behind 4 NS + CDN + IPv6 + load balancing scores 100 while a bare-bones single-hoster still scores 89.

### Finding 3: **Severity → Score mapping creates score compression** 🚨
The fundamental problem is the `SEVERITY_SCORES` mapping:
```
critical: 0, high: 30, medium: 65, low: 80, info: 92, good: 100
```
The gap between "info" (92) and "good" (100) is only 8 points. "Low" is 80. "Medium" is 65. When most findings are "info" or "good" (which they are for any domain with basic HTTPS and DNS), the weighted average is guaranteed to be 80+. The severity curve is **top-heavy** — there's very little separation between "fine" and "excellent".

### Finding 4: **lingscars.com scores 88/A — same as Microsoft** ⚠️
lingscars.com is notoriously one of the worst-designed websites on the internet (16.2s LCP, PageSpeed 43/100, zero social meta). It gets the same overall score as `microsoft.com` (88/A) because:
- Trust: 97 (old domain + clean blocklist = automatic high trust)
- Reliability: 97 (basic DNS = reliable enough)
- Security: 91 (A+ SSL + Cloudflare WAF = nearly perfect)
- These three easy-A axes compensate for legitimately bad Performance (72) and Visibility (76)

### Finding 5: **httpforever.com — a site built to demonstrate HTTP-only — scores 81/B** ⚠️
A site literally designed to not use HTTPS gets only a B. Its Trust score is 99 (!!!). Its security is 71 — but 71 in security still contributes positively to the composite.

### Finding 6: **example.com scores 89/A — higher than GitHub** ⚠️
`example.com` — IANA's reserved placeholder domain with no real content — scores 89/A, beating `github.com` (85/A), `microsoft.com` (88/A), and `signal.org` (88/A). Its Performance score is 94 because a blank page is fast.

### Finding 7: **No domains score below 80 or get C/D/F grades**
The grade thresholds are `A≥85, B≥70, C≥55, D≥40, F<40`. With the current severity mapping, it's mathematically nearly impossible to score below 70 unless a domain has multiple critical findings. The C/D/F grades exist on paper but are unreachable in practice.

### Finding 8: **30 of 75 domains (40%) timed out**
This includes major sites: all banks (Chase, BofA, Schwab, PayPal), major media (NYT, BBC, CNN, WaPo), major social (Reddit, TikTok), and major security companies (1Password, Bitwarden, CrowdStrike). These are CF Worker execution timeouts (>45s), not scoring issues, but it's a significant data gap — we can't validate scoring for slow-to-analyze domains. This is a separate operational issue worth noting.

---

## 4. Recommendations

### Recommendation 1: Steepen the severity curve

**Current:**
```ts
SEVERITY_SCORES = { critical: 0, high: 30, medium: 65, low: 80, info: 92, good: 100 }
```

**Proposed:**
```ts
SEVERITY_SCORES = { critical: 0, high: 20, medium: 50, low: 70, info: 85, good: 100 }
```

This spreads the scoring range out. "Info" findings (which dominate most axes) would contribute 85 instead of 92, creating more room for differentiation. A domain that's "info" across the board would score ~85 instead of ~92. "Medium" findings would now actually hurt (50 instead of 65).

### Recommendation 2: Add negative/penalty signals to Trust axis

The trust axis is entirely positive. It needs signals that pull scores **down** for legitimately sketchy domains:
- **No HTTPS redirect** → trust penalty (medium)
- **Parked domain / thin content** → trust penalty (medium/high)
- **Privacy-policy absent** for commerce/corporate → trust penalty (low/medium)
- **WHOIS privacy on commerce domains** → trust penalty (info/low) — legitimate businesses typically have public WHOIS
- **Consider reweighting:** Blocklist clean (weight 5) is too generous as a positive signal. Being on a blocklist is rare. Consider making blocklist weight 5 only as a penalty (when listed), and weight 2 as a positive (when clean). Not being on a blocklist isn't an achievement — it's a baseline.

### Recommendation 3: Add negative signals to Reliability axis

Currently reliability is almost entirely "does DNS exist and is it consistent?" It needs:
- **HTTP error responses** (5xx, connection refused) → reliability penalty
- **DNS TTL anomalies** (extremely low TTLs can indicate instability)
- **No CDN for high-traffic archetypes** → reliability penalty for commerce/content

### Recommendation 4: Rethink the "info" severity as "not quite good, not quite bad"

Right now "info" (92) is used for "we checked this and it's neutral/fine." But 92 is so close to "good" (100) that it provides almost no differentiation. Consider:
- Rename "info" usage or split it: "neutral" (75) for "didn't check / not applicable" vs "info" (85) for "present but basic"
- The current default-when-no-findings score is 75. That's fine, but axes with few findings and mostly "info" results are getting boosted to 90+ just by existing.

### Recommendation 5: Consider asymmetric weighting for baseline vs. above-average signals

Some signals are currently "good" that should really be baseline expectations:
- SSL A+ grade → currently "good" (100) at weight 5. An A+ SSL cert is table stakes in 2026. Consider making A+ the neutral baseline and only penalizing worse grades.
- "Not on any blocklists" → currently "good" (100) at weight 3 on security. This is normal for 99.9% of domains. It shouldn't be a positive signal; it should be a penalty when violated.
- "Clean blocklist record" → same issue on trust axis.

### Recommendation 6: Lower the A threshold

Current: `A ≥ 85`. With the compressed distribution, 85 is easily reachable for almost any functioning domain. Consider:
- `A ≥ 90` (or even 92)
- This would naturally create more B grades without changing the underlying scoring math
- Combined with Recommendation 1 (steeper curve), this alone would fix most of the grade compression.

---

## 5. Verdict: Is Current Calibration Good Enough for Launch?

**No.** The scoring has a fundamental compression problem. Key issues:

1. **93% A grades means the grade is meaningless.** If lingscars.com and Cloudflare both get an A, users learn to ignore the grade entirely.
2. **The Trust and Reliability axes are non-discriminating.** They inflate every domain's composite score by 15-40 points regardless of quality.
3. **The severity curve is too generous.** "Medium" problems (65) barely register, and "info" (92) is essentially a freebie.
4. **Grade thresholds are too low.** C/D/F are mathematically unreachable for any domain with basic HTTPS and DNS.

### What "Good Enough" Would Look Like

A well-calibrated scoring system should produce something like:
- **A (top ~15-25%):** Cloudflare, Proton.me, Stripe, Etsy — genuinely well-run domains
- **B (next ~30-40%):** Most major sites — Google, Microsoft, Apple, GitHub, universities
- **C (~20-30%):** Functional but unremarkable — personal blogs, small businesses, basic sites
- **D (~10-15%):** Poorly maintained — no HTTPS, bad security, thin content
- **F (~5%):** Actively dangerous or broken — blocklisted, expired certs, parked spam

Currently we get: A (93%), B (7%), C/D/F (0%). That's not a useful distribution.

### Priority Order for Fixes

1. **Steepen the severity curve** (Rec 1) — biggest impact, simplest change
2. **Raise A threshold to 90** (Rec 6) — immediate grade distribution improvement
3. **Reweight "baseline" signals** (Rec 5) — stop rewarding normal behavior
4. **Add Trust/Reliability penalties** (Rec 2, 3) — give those axes teeth
5. **Split info/neutral** (Rec 4) — longer-term refinement

Fixes 1+2 alone would shift the distribution significantly. Fix 1 would compress ~90 average → ~80 average, and Fix 2 would make only genuinely excellent domains get an A.

---

## Appendix A: Timed-Out Domains

These 30 domains hit CF Worker timeout limits before returning results. Scoring cannot be validated for them:

meta.com, 1password.com, bitwarden.com, crowdstrike.com, cdc.gov, chase.com, bankofamerica.com, schwab.com, paypal.com, cnn.com, washingtonpost.com, nytimes.com, bbc.com, shopify.com, tiktok.com, reddit.com, kottke.org, wix.com, squarespace.com, wordpress.org, angelfire.com, craigslist.org, outlook.com, coinbase.com, protonmail.com, binance.com, stackoverflow.com, npmjs.com, techcrunch.com, neverssl.com

## Appendix B: Per-Domain Archetype Classification

| Domain | Archetype | Confidence |
|--------|-----------|------------|
| lingscars.com | corporate | 0.55 |
| httpforever.com | infrastructure | 0.30 |
| geocities.ws | general | default |
| example.com | general | default |
| whitehouse.gov | institutional | 0.70 |
| google.com | content | varies |

The archetype system is well-designed but only matters if the underlying axis scores differentiate properly (which they currently don't).
