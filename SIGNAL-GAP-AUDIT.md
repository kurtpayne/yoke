# Yoke Signal Gap Audit

**Date:** 2026-05-27
**Current state:** 70 unique signals across 5 axes (some signals have good/bad variants)

## Current Signal Count by Axis

| Axis | Unique Signals | Notes |
|------|---------------|-------|
| Security | 21 | SSL, HSTS, CSP, XFO, XCTO, DNSSEC, blocklist, email auth, WAF, HSTS preload, CAA, cert wildcard, pre-consent cookies, script privacy |
| Performance | 11 | PageSpeed score, LCP, CLS, TTFB, compression, cache headers, HTTP/2-3, CDN, render-blocking scripts, third-party count, slow connection |
| Reliability | 13 | NS count, MX, IPv6, load balancing, CAA, TTL health, SOA, DNS consistency, BGP stability, route visibility |
| Trust | 16 | Domain age, registration length, blocklist, GreyNoise, breaches, Tranco, email trust, DMARC reject, ops transparency, cookie consent/compliance, cert volume, wayback, trust composite |
| Visibility | 9 | Structured data, social meta, robots.txt, sitemap, legal pages, social accounts, accessibility |
| **Total** | **70** | |

---

## Data We Collect but Don't Score

These are collected by existing checks and available in the pipeline but produce **zero findings** in `contextual-scoring.ts`:

| Data Source | Check File | What's There | Why It Matters |
|---|---|---|---|
| **Shodan** | `checks/shodan.ts` | Open ports, CPEs, known vulns, tags | Open ports = attack surface; known CVEs = critical |
| **Observatory** | `checks/observatory.ts` | Mozilla grade, score, tests passed/total | Redundant with our own audit but useful as cross-check |
| **Cookie Security** | `security.ts → auditCookies()` | Per-cookie Secure/HttpOnly/SameSite flags, issues list | Missing flags = session hijack risk |
| **Security.txt** | `checks/security-txt.ts` | found, bug bounty, contact, canonical | Trust signal — responsible disclosure |
| **BIMI** | Part of `email-auth` check | found, logo_url, authority_url | Email brand authenticity |
| **MTA-STS** | Part of `email-auth` check | dns_found, policy_found, mode | Email transport security |
| **TLS-RPT** | Part of `email-auth` check | found, record, rua | Email TLS reporting |
| **Well-known endpoints** | `checks/well-known.ts` | PWA ready, mobile apps, ads.txt | App ecosystem presence |
| **Robots parsed** | `content.ts → parseRobotsDeep()` | is_restrictive, crawl_delay, interesting_blocked | Over-blocking = visibility problem |
| **Green hosting** | `checks/green-hosting.ts` | green, hosted_by, hosted_by_website | Sustainability signal |
| **LLMs.txt** | `checks/llms-txt.ts` | found, content, full_found | AI readiness (already in AI score but not axes) |
| **Redirect chain** | `core.ts → httpAnalysis.redirects` | Array of hops with status codes | Long chains = perf + trust concern |
| **Server/X-Powered-By headers** | Already in `headers.raw` | Server version, framework disclosure | Version disclosure = security risk |
| **Carbon footprint** | `checks/carbon.ts` | Carbon score data | Sustainability / green hosting |
| **Referrer-Policy header** | Already in security audit | Present/absent + value | Privacy header |
| **Permissions-Policy header** | Already in security audit | Present/absent + value | Feature restriction |
| **HTTP status code** | `statusResult.status_code` | Exact status (403, 500, 503, etc.) | Reliability — site serving errors |
| **Site reachability** | `statusResult.is_up` | Boolean + error message | Reliability — site completely down |

---

## Missing Signals: Comprehensive Gap Analysis

### 🔴 CRITICAL GAPS (Kurt-identified + high-impact)

#### 1. `site_unreachable` — Site Does Not Respond to HTTP
- **Axis:** Reliability
- **What:** Domain resolves (has DNS A/AAAA records) but no web server responds — connection refused, timeout, or reset
- **Detection:** `statusResult.is_up === false && dnsResolves === true && !statusResult.http_blocked` — or `httpAnalysis === null && dnsRecords.length > 0`
- **Data source:** ✅ Already collected (`statusResult`, `httpAnalysis`, `dnsRecords`)
- **Severity:** high (weight 5) — a website that doesn't serve HTTP is fundamentally broken
- **Priority:** 🔴 HIGH — this is a gap that matters; a dead domain shouldn't score well on reliability
- **Cost:** FREE

#### 2. `http_error_response` — Site Returns 4xx/5xx Errors
- **Axis:** Reliability
- **What:** Server responds but with error codes (403 self-block excluded — that's already handled as RESTRICTED)
- **Detection:** `statusResult.status_code >= 400` — severity varies: 5xx (server error) worse than 4xx (client error). Exclude known bot-blocking patterns (403/429/503 with WAF detected).
- **Data source:** ✅ Already collected (`statusResult.status_code`, `wafDetection`)
- **Severity:** 5xx → high (weight 4), 4xx non-bot-block → medium (weight 3)
- **Priority:** 🔴 HIGH — a site that serves errors shouldn't get a pass
- **Cost:** FREE

#### 3. `open_ports` — Shodan Open Ports / Attack Surface
- **Axis:** Security
- **What:** Non-standard ports open (beyond 80/443/22). More open ports = larger attack surface. Common risky ports: 3306 (MySQL), 5432 (Postgres), 6379 (Redis), 27017 (MongoDB), 9200 (Elasticsearch).
- **Detection:** `shodanResult.ports` — filter out expected web ports, flag dangerous database/admin ports specifically
- **Data source:** ✅ Already collected (`checks/shodan.ts`)
- **Severity:** Database ports exposed → high (weight 3); unusual ports → medium (weight 2); standard services only → info
- **Priority:** 🔴 HIGH — we're fetching this data and throwing it away
- **Cost:** FREE

#### 4. `known_vulnerabilities` — Shodan CVEs
- **Axis:** Security
- **What:** Known CVEs associated with the IP's exposed services
- **Detection:** `shodanResult.vulns.length > 0`
- **Data source:** ✅ Already collected (`checks/shodan.ts`)
- **Severity:** Any CVEs → high (weight 4); critical CVEs → critical (weight 5)
- **Priority:** 🔴 HIGH — actual vulnerability data that we're ignoring
- **Cost:** FREE

---

### 🟡 HIGH-VALUE SIGNALS FROM EXISTING DATA

#### 5. `cookie_security` — Cookie Secure/HttpOnly/SameSite Flags
- **Axis:** Security
- **What:** Cookies missing Secure, HttpOnly, or SameSite attributes
- **Detection:** `cookieSecurity.issues.length` — already computed by `auditCookies()`
- **Data source:** ✅ Already collected and audited
- **Severity:** Multiple issues → medium (weight 2); all secure → good (weight 2)
- **Priority:** 🟡 HIGH — we literally audit every cookie and then discard the results
- **Cost:** FREE

#### 6. `server_version_disclosure` — Server/X-Powered-By Leaks Version Info
- **Axis:** Security
- **What:** `Server: Apache/2.4.51` or `X-Powered-By: PHP/7.4.3` reveals exact versions → attackers can target known CVEs
- **Detection:** Parse `headers["server"]` and `headers["x-powered-by"]` for version numbers (regex: `/\/[\d.]+/`)
- **Data source:** ✅ Already collected (headers)
- **Severity:** Version number disclosed → low (weight 1); specific framework+version → medium (weight 2)
- **Priority:** 🟡 HIGH — trivial to implement, real security signal
- **Cost:** FREE

#### 7. `referrer_policy` — Referrer-Policy Header
- **Axis:** Security
- **What:** Controls what referrer information is sent with requests. `no-referrer-when-downgrade` (default) leaks full URLs cross-origin.
- **Detection:** Already in security audit headers. Score based on value: `no-referrer` or `strict-origin-when-cross-origin` → good; absent → info; `unsafe-url` → medium
- **Data source:** ✅ Already collected (security audit checks for it)
- **Severity:** Good policy → good (weight 2); absent → info (weight 1); unsafe-url → medium (weight 2)
- **Priority:** 🟡 HIGH — header is already audited, just not scored
- **Cost:** FREE

#### 8. `permissions_policy` — Permissions-Policy Header
- **Axis:** Security
- **What:** Restricts browser features (camera, microphone, geolocation, etc.). Missing = any embedded content can use these APIs.
- **Detection:** Already in security audit headers
- **Data source:** ✅ Already collected (security audit checks for it)
- **Severity:** Present → good (weight 1); absent → info (weight 1)
- **Priority:** 🟡 HIGH — header already audited, just not scored
- **Cost:** FREE

#### 9. `redirect_chain_length` — Excessive Redirects
- **Axis:** Performance
- **What:** Long redirect chains add latency (each hop = full round trip). Also a trust signal — excessive redirects are common in tracking/phishing.
- **Detection:** `httpAnalysis.redirects.length` — more than 2 hops is unusual, more than 4 is problematic
- **Data source:** ✅ Already collected (`httpAnalysis.redirects`)
- **Severity:** 4+ hops → medium (weight 2); 2-3 → info; 0-1 → good
- **Priority:** 🟡 HIGH — already have the data
- **Cost:** FREE

#### 10. `http_to_https_redirect` — HTTP→HTTPS Redirect
- **Axis:** Security
- **What:** Does `http://domain` redirect to `https://domain`? Without this, users who type the domain without `https://` get an insecure connection even if HTTPS exists.
- **Detection:** Check if redirect chain starts with `http://` and ends at `https://` — already in `httpAnalysis.redirects`
- **Data source:** ✅ Already collected
- **Severity:** Redirects properly → good (weight 3); no redirect → medium for commerce/app, low for others
- **Priority:** 🟡 HIGH — classic security check, data is there
- **Cost:** FREE

#### 11. `security_txt_present` — security.txt Responsible Disclosure
- **Axis:** Trust
- **What:** RFC 9116 standard for vulnerability disclosure. Having one signals mature security posture.
- **Detection:** `securityTxt.found` — already fetched
- **Data source:** ✅ Already collected (`checks/security-txt.ts`)
- **Severity:** Found with bug bounty → good (weight 3); found without → good (weight 2); not found → info (weight 1)
- **Priority:** 🟡 HIGH — trust signal we already fetch
- **Cost:** FREE

#### 12. `restrictive_robots` — Overly Restrictive robots.txt
- **Axis:** Visibility
- **What:** `Disallow: /` blocks all crawlers → site won't appear in search results. `is_restrictive` is already computed.
- **Detection:** `robotsParsed.is_restrictive` — already parsed
- **Data source:** ✅ Already collected and analyzed
- **Severity:** Fully restrictive → medium for content sites, info for infrastructure (weight 2)
- **Priority:** 🟡 HIGH — already computed, never scored
- **Cost:** FREE

#### 13. `pwa_ready` — Progressive Web App Readiness
- **Axis:** Visibility (for app archetypes: Reliability)
- **What:** Has manifest.json with required fields, service worker registration, HTTPS. Signals modern web presence.
- **Detection:** `wellKnown.pwa_ready` — already computed
- **Data source:** ✅ Already collected (`checks/well-known.ts`)
- **Severity:** PWA ready → good (weight 1); not ready → neutral (no finding)
- **Priority:** 🟡 MEDIUM — nice bonus signal
- **Cost:** FREE

#### 14. `mobile_app_links` — Mobile App Deep Links
- **Axis:** Visibility
- **What:** Has Apple App Site Association or Android Asset Links → indicates a mobile app ecosystem
- **Detection:** `wellKnown.has_mobile_apps` — already computed
- **Data source:** ✅ Already collected
- **Severity:** Has mobile apps → good (weight 1); absent → neutral
- **Priority:** 🟡 MEDIUM — bonus signal for app/commerce archetypes
- **Cost:** FREE

---

### 🟢 MEDIUM-VALUE SIGNALS (Need Minor New Logic)

#### 15. `mta_sts` — MTA-STS Email Transport Security
- **Axis:** Security (or Trust)
- **What:** MTA-STS enforces TLS for email delivery — prevents downgrade attacks on email transport. Complementary to DMARC.
- **Detection:** `emailAuth.mta_sts.policy_found && emailAuth.mta_sts.mode === "enforce"` — already collected
- **Data source:** ✅ Already collected (part of email-auth check)
- **Severity:** Enforced → good (weight 1); testing → info; absent → neutral
- **Priority:** 🟢 MEDIUM — niche but collected
- **Cost:** FREE

#### 16. `bimi_record` — BIMI (Brand Indicators for Message Identification)
- **Axis:** Trust
- **What:** BIMI displays brand logo in email clients. Requires DMARC enforcement. Signals email brand maturity.
- **Detection:** `emailAuth.bimi.found` — already collected
- **Data source:** ✅ Already collected (part of email-auth check)
- **Severity:** Found → good (weight 1); absent → neutral
- **Priority:** 🟢 MEDIUM — nice trust bonus
- **Cost:** FREE

#### 17. `mixed_content` — HTTP Resources on HTTPS Page
- **Axis:** Security
- **What:** HTTPS page loading images/scripts/stylesheets over HTTP → browser warnings, broken padlock, potential MITM
- **Detection:** Scan HTML for `src="http://` or `href="http://` on non-redirect URLs. Can do from existing `html` string.
- **Data source:** ✅ Partially available (have HTML) — need regex scan
- **Severity:** Mixed active content (scripts) → high (weight 3); mixed passive (images) → medium (weight 2)
- **Priority:** 🟢 MEDIUM — important signal, HTML already available
- **Cost:** FREE (regex on existing HTML)

#### 18. `canonical_url` — Canonical URL Consistency
- **Axis:** Visibility
- **What:** `<link rel="canonical">` tells search engines the preferred URL. Missing → duplicate content issues. Mismatched → SEO confusion.
- **Detection:** Parse HTML for `<link rel="canonical" href="...">`, compare with `httpAnalysis.final_url`
- **Data source:** ✅ Available (have HTML and final URL)
- **Severity:** Present and matching → good (weight 2); present but mismatched → low (weight 2); absent → info for content, neutral for others
- **Priority:** 🟢 MEDIUM — key SEO signal
- **Cost:** FREE (regex on existing HTML)

#### 19. `rss_feed` — RSS/Atom Feed Present
- **Axis:** Visibility
- **What:** RSS/Atom feeds enable syndication and AI consumption. Already detected in `calculateAiReadiness` but not in axis scoring.
- **Detection:** `html.match(/<link[^>]+type=["']application\/(rss|atom)\+xml["']/)` — already done in AI readiness
- **Data source:** ✅ Already detected (in AI readiness checks)
- **Severity:** Present → good (weight 1) for content archetype; neutral for others
- **Priority:** 🟢 MEDIUM — relevant for content sites
- **Cost:** FREE

#### 20. `hreflang` — International Targeting
- **Axis:** Visibility
- **What:** `<link rel="alternate" hreflang="...">` tags signal international targeting. Important for multi-language sites.
- **Detection:** Regex HTML for `hreflang` attributes
- **Data source:** ✅ Available (have HTML)
- **Severity:** Present → good (weight 1); absent → neutral (only penalize if site has multi-language indicators)
- **Priority:** 🟢 MEDIUM — nice signal, no penalty for absence
- **Cost:** FREE (regex on existing HTML)

#### 21. `favicon_present` — Favicon Detection
- **Axis:** Visibility
- **What:** Missing favicon → broken tab icon, unprofessional appearance. Already detected in `meta.favicon_url`.
- **Detection:** `meta.favicon_url !== null`
- **Data source:** ✅ Already collected
- **Severity:** Present → info; absent → low for content/corporate (weight 1)
- **Priority:** 🟢 LOW — minor but available
- **Cost:** FREE

#### 22. `title_tag` — Page Title Present and Reasonable
- **Axis:** Visibility
- **What:** Missing or generic `<title>` → bad search snippets, unprofessional. Can extract from HTML.
- **Detection:** Regex for `<title>...</title>` — check for empty, "Untitled", default CMS titles
- **Data source:** ✅ Available (have HTML)
- **Severity:** Good title → good (weight 1); missing/generic → low (weight 1)
- **Priority:** 🟢 LOW
- **Cost:** FREE

#### 23. `meta_description` — Meta Description Present
- **Axis:** Visibility
- **What:** Missing `<meta name="description">` → search engines generate their own snippet. Easily detectable.
- **Detection:** Regex HTML for `<meta name="description"` or check if `og:description` exists
- **Data source:** ✅ Available (have HTML, OG data)
- **Severity:** Present → info; absent → low for content (weight 1)
- **Priority:** 🟢 LOW
- **Cost:** FREE

#### 24. `dmarc_policy_strength` — DMARC Policy Granularity
- **Axis:** Trust
- **What:** Currently we flag DMARC reject as good in trust. But `p=none` (monitoring only) vs `p=quarantine` vs `p=reject` matters — `none` provides zero protection.
- **Detection:** `emailAuth.dmarc.policy` — already collected with the exact value
- **Data source:** ✅ Already collected
- **Severity:** `reject` → good (weight 2, already scored); `quarantine` → info (weight 1); `none` → low (weight 1) — currently only `reject` gets a trust finding
- **Priority:** 🟢 MEDIUM — more granularity on existing data
- **Cost:** FREE

#### 25. `ads_txt` — Ads.txt for Publisher Transparency
- **Axis:** Trust (for content archetype)
- **What:** ads.txt lists authorized digital advertising sellers. Missing → ad fraud risk. Already fetched by well-known check.
- **Detection:** Check `wellKnown.endpoints` for ads.txt presence
- **Data source:** ✅ Already collected
- **Severity:** Present → good (weight 1) for content archetype; absent → neutral
- **Priority:** 🟢 LOW — niche signal
- **Cost:** FREE

---

### 🔵 NEW-FETCH SIGNALS (Require Additional HTTP Requests)

#### 26. `csp_report_only` — CSP Report-Only Mode
- **Axis:** Security
- **What:** `Content-Security-Policy-Report-Only` header exists but no enforcing CSP. Shows intent to implement CSP but not yet protecting.
- **Detection:** Check `headers["content-security-policy-report-only"]` — no new fetch needed, already in headers
- **Data source:** ✅ Already available in headers
- **Severity:** Report-only without enforcing CSP → info (weight 1)
- **Priority:** 🔵 LOW
- **Cost:** FREE

#### 27. `subresource_integrity` — SRI on Third-Party Scripts
- **Axis:** Security
- **What:** `<script src="..." integrity="sha384-...">` ensures CDN-hosted scripts aren't tampered with. Critical for sites loading from CDNs.
- **Detection:** Scan HTML for `<script` tags with `src` attributes from third-party domains, check for `integrity` attribute
- **Data source:** ✅ Available (have HTML)
- **Severity:** All third-party scripts have SRI → good (weight 2); some missing → info; none → low for app/commerce
- **Priority:** 🔵 MEDIUM — meaningful for high-security sites
- **Cost:** FREE (HTML scan)

#### 28. `form_action_security` — Forms Post to HTTPS
- **Axis:** Security
- **What:** `<form action="http://...">` sends form data over plaintext. Login forms especially.
- **Detection:** Regex HTML for `<form` tags, check `action` attributes for `http://`
- **Data source:** ✅ Available (have HTML)
- **Severity:** Form posts to HTTP → high for commerce, medium for others (weight 3)
- **Priority:** 🔵 MEDIUM — real security issue
- **Cost:** FREE (HTML scan)

#### 29. `dns_geo_diversity` — Nameserver Geographic Diversity
- **Axis:** Reliability
- **What:** All nameservers in same ASN/geography = single point of failure. Diverse NS providers = resilient.
- **Detection:** Resolve NS IPs → check ASN diversity via ip-info data
- **Data source:** ⚠️ Needs additional NS IP resolution (new fetches per NS hostname)
- **Severity:** Single ASN → low (weight 2); multiple ASNs → good (weight 2)
- **Priority:** 🔵 MEDIUM — real reliability signal but needs new fetches
- **Cost:** 2-4 additional DNS lookups

#### 30. `humans_txt` — humans.txt Present
- **Axis:** Visibility / Trust
- **What:** `humans.txt` credits the team behind the site. Minor trust signal — shows a human organization exists.
- **Detection:** `fetch("https://domain/humans.txt")` — new fetch needed
- **Data source:** ❌ New fetch required
- **Severity:** Present → info (weight 0) — informational only, not scored
- **Priority:** 🔵 LOW — too niche to score
- **Cost:** 1 additional fetch

#### 31. `crux_field_data` — Chrome UX Report (Real-User Performance)
- **Axis:** Performance
- **What:** CrUX provides real-user Core Web Vitals (not just lab data from PageSpeed). Available via CrUX API.
- **Detection:** CrUX API call with domain origin — returns p75 LCP, CLS, INP, TTFB from real users
- **Data source:** ❌ New API call required (Google CrUX API, free with API key)
- **Severity:** Good CWV → good (weight 3); poor → high (weight 3)
- **Priority:** 🔵 MEDIUM — significantly better than lab-only metrics, but needs API key + new check
- **Cost:** 1 new API call (rate-limited)

#### 32. `dom_size` — Excessive DOM Size
- **Axis:** Performance
- **What:** HTML size > 1MB or extremely deep nesting = slow rendering. Can estimate from `html.length`.
- **Detection:** `html.length` (rough proxy — we already have the full HTML)
- **Data source:** ✅ Already available
- **Severity:** > 1MB → medium (weight 1); > 3MB → high (weight 2)
- **Priority:** 🔵 LOW — rough proxy only
- **Cost:** FREE

#### 33. `image_optimization` — WebP/AVIF Modern Format Detection
- **Axis:** Performance
- **What:** Sites still serving only JPEG/PNG when WebP/AVIF would be smaller. Detectable via `Accept` header negotiation or scanning HTML for image formats.
- **Detection:** Scan HTML `<img src=` for `.jpg`/`.png` without `<picture>` fallbacks, or check response to image request with WebP Accept header
- **Data source:** ⚠️ Partial (HTML scan for format hints), full check needs image fetches
- **Severity:** All modern formats → good (weight 1); legacy only → info (weight 1)
- **Priority:** 🔵 LOW — hard to test reliably without fetching images
- **Cost:** FREE for HTML scan, expensive for actual format probing

#### 34. `lazy_loading` — Image Lazy Loading
- **Axis:** Performance
- **What:** `loading="lazy"` on off-screen images reduces initial page load. Detectable from HTML.
- **Detection:** Count `<img` tags, check for `loading="lazy"` attribute
- **Data source:** ✅ Available (have HTML)
- **Severity:** Most images lazy-loaded → good (weight 1); none → info (weight 1)
- **Priority:** 🔵 LOW — minor optimization signal
- **Cost:** FREE

#### 35. `preconnect_hints` — Resource Hints (preconnect/prefetch/preload)
- **Axis:** Performance
- **What:** `<link rel="preconnect">` for critical third-party domains reduces connection setup time
- **Detection:** Scan HTML for `rel="preconnect"`, `rel="prefetch"`, `rel="preload"`
- **Data source:** ✅ Available (have HTML)
- **Severity:** Present → info (weight 1) bonus; absent → neutral
- **Priority:** 🔵 LOW — nice to have
- **Cost:** FREE

#### 36. `green_hosting` — Green/Sustainable Hosting
- **Axis:** Trust (or new axis)
- **What:** Hosted on renewable energy. Already fetched by green-hosting check.
- **Detection:** `greenHosting.green === true`
- **Data source:** ✅ Already collected (`checks/green-hosting.ts`)
- **Severity:** Green → info (weight 0) — informational, not scored
- **Priority:** 🔵 LOW — niche, debatable scoring impact
- **Cost:** FREE

---

## Implementation Priority Matrix

### Tier 1: FREE — Already Collected, Just Wire Into Scoring
*Zero new fetches, zero new checks. Pure scoring logic additions.*

| # | Signal | Axis | Data Source | Impact |
|---|--------|------|------------|--------|
| 1 | `site_unreachable` | Reliability | statusResult + dnsRecords | 🔴 Critical gap |
| 2 | `http_error_response` | Reliability | statusResult.status_code | 🔴 Critical gap |
| 3 | `open_ports` | Security | shodanResult.ports | 🔴 Already fetched, not used |
| 4 | `known_vulnerabilities` | Security | shodanResult.vulns | 🔴 Already fetched, not used |
| 5 | `cookie_security` | Security | cookieSecurity.issues | 🟡 Already audited, not scored |
| 6 | `server_version_disclosure` | Security | headers.server / x-powered-by | 🟡 Trivial regex |
| 7 | `referrer_policy` | Security | headers.referrer-policy | 🟡 Already audited |
| 8 | `permissions_policy` | Security | headers.permissions-policy | 🟡 Already audited |
| 9 | `redirect_chain_length` | Performance | httpAnalysis.redirects | 🟡 Data available |
| 10 | `http_to_https_redirect` | Security | httpAnalysis.redirects | 🟡 Data available |
| 11 | `security_txt_present` | Trust | securityTxt.found | 🟡 Already fetched |
| 12 | `restrictive_robots` | Visibility | robotsParsed.is_restrictive | 🟡 Already computed |
| 13 | `pwa_ready` | Visibility | wellKnown.pwa_ready | 🟡 Already computed |
| 14 | `mobile_app_links` | Visibility | wellKnown.has_mobile_apps | 🟡 Already computed |
| 15 | `mta_sts` | Security | emailAuth.mta_sts | 🟢 Already collected |
| 16 | `bimi_record` | Trust | emailAuth.bimi | 🟢 Already collected |
| 17 | `dmarc_policy_strength` | Trust | emailAuth.dmarc.policy | 🟢 More granularity |
| 18 | `ads_txt` | Trust | wellKnown (ads.txt) | 🟢 Already collected |
| 19 | `green_hosting` | Trust | greenHosting.green | 🟢 Already collected |

### Tier 2: FREE — Extractable from Existing HTML/Headers
*No new fetches, but need new parsing logic on HTML we already have.*

| # | Signal | Axis | Data Source | Impact |
|---|--------|------|------------|--------|
| 20 | `mixed_content` | Security | HTML scan | 🟢 Important |
| 21 | `canonical_url` | Visibility | HTML parse + final_url | 🟢 Key SEO signal |
| 22 | `rss_feed` | Visibility | HTML scan (already in AI readiness) | 🟢 Content sites |
| 23 | `hreflang` | Visibility | HTML scan | 🟢 International |
| 24 | `favicon_present` | Visibility | meta.favicon_url | 🟢 Minor |
| 25 | `title_tag` | Visibility | HTML parse | 🟢 Minor |
| 26 | `meta_description` | Visibility | HTML parse / OG data | 🟢 Minor |
| 27 | `subresource_integrity` | Security | HTML scan | 🔵 App/commerce |
| 28 | `form_action_security` | Security | HTML scan | 🔵 Commerce |
| 29 | `dom_size` | Performance | html.length | 🔵 Rough proxy |
| 30 | `lazy_loading` | Performance | HTML scan | 🔵 Minor |
| 31 | `preconnect_hints` | Performance | HTML scan | 🔵 Minor |
| 32 | `csp_report_only` | Security | Already in headers | 🔵 Niche |

### Tier 3: Needs New Fetches
*Additional HTTP requests or API calls.*

| # | Signal | Axis | What's Needed | Impact |
|---|--------|------|--------------|--------|
| 33 | `crux_field_data` | Performance | Google CrUX API call | 🔵 High value but needs API key |
| 34 | `dns_geo_diversity` | Reliability | NS IP resolution + ASN lookup | 🔵 Medium value |
| 35 | `humans_txt` | Visibility | 1 fetch | 🔵 Too niche |
| 36 | `image_optimization` | Performance | Image fetches | 🔵 Hard to test reliably |

---

## Recommended Implementation Order

**Phase 1 — Wire the "free" data (Tier 1, high impact):**
1. `site_unreachable` + `http_error_response` — Kurt's identified gaps, critical
2. `open_ports` + `known_vulnerabilities` — Shodan data we're already paying for
3. `cookie_security` — audited but discarded
4. `server_version_disclosure` — trivial regex on existing headers
5. `referrer_policy` + `permissions_policy` — already in security audit
6. `redirect_chain_length` + `http_to_https_redirect` — performance + security from redirect data
7. `security_txt_present` — trust signal from existing check
8. `restrictive_robots` — visibility signal from existing parse

**Phase 2 — HTML extraction (Tier 2):**
9. `mixed_content` — security from HTML scan
10. `canonical_url` — visibility/SEO from HTML parse
11. `subresource_integrity` — security from HTML scan
12. `form_action_security` — security from HTML scan

**Phase 3 — Remaining freebies (Tier 1, lower impact):**
13. `pwa_ready` + `mobile_app_links` — visibility bonuses
14. `mta_sts` + `bimi_record` — email security/trust bonuses
15. `dmarc_policy_strength` — more trust granularity
16. `rss_feed` + `hreflang` + `favicon_present` — visibility signals

**Deferred:**
- CrUX field data (needs API key setup)
- DNS geo diversity (needs new fetches)
- Green hosting scoring (debatable value)
- DOM size / lazy loading / preconnect (minor signals)

---

## Signal Additions by Axis (Phase 1 only)

After Phase 1 implementation, signal counts would be:

| Axis | Current | Added | New Total |
|------|---------|-------|-----------|
| Security | 21 | +8 (open_ports, known_vulns, cookie_security, server_version, referrer_policy, permissions_policy, http_to_https, mixed_content) | **29** |
| Performance | 11 | +1 (redirect_chain_length) | **12** |
| Reliability | 13 | +2 (site_unreachable, http_error_response) | **15** |
| Trust | 16 | +1 (security_txt_present) | **17** |
| Visibility | 9 | +1 (restrictive_robots) | **10** |
| **Total** | **70** | **+13** | **83** |

---

## Notes

- **Shodan free tier (InternetDB)** gives us ports, vulns, tags, CPEs without an API key. This is gold we're ignoring.
- **Cookie security** is the most egregious gap — we literally run `auditCookies()`, produce a detailed report, include it in the JSON response, and then never score it.
- The **site_unreachable** and **http_error_response** signals would have the single biggest impact on the score distribution for bad domains, pushing them from C toward D/F territory.
- Keep weights low (1-2) for most new signals to avoid overwhelming the existing calibration. The goal is more granularity, not a scoring overhaul.
- All "absent = neutral" signals should use weight 0 or generate no finding at all — we don't want to penalize sites for not having niche features.
