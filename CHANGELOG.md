# Changelog

All notable changes to Yoke are documented here.

## [1.3.0] — 2026-06-23

### Features
- **Network Health panel** — Infrastructure tab gains DNS propagation (multi-resolver consistency), TCP connection timing (DNS/TCP/TLS breakdown via Fly probe), RIPE RIS routing data (ASN, prefix, BGP visibility & stability), and outage monitoring links (Downdetector, IsItDownRightNow). Surfaces DNS inconsistency and routing instability as domain signals and scoring findings. Compare view shows connection timing and routing stability differences. New external links to bgp.tools, HE BGP, and Downdetector on the Infrastructure tab.
- **Top Priorities engine** — replaced Key Findings with a ranked, actionable fix-it list with effort estimates and cross-axis insights
- **BYO API Key panel** — gear icon on AI tab opens advanced settings: API key input, model picker (Claude Sonnet 4, Opus 4, GPT-4o, o3, Gemini 2.5 Pro, Llama 4 Maverick), and live prompt editor; controls visible but disabled without a key to improve discoverability
- **BYO key UX copy** — clear "Why?" and "Privacy:" explanations in the panel; expanded `/privacy` page with full BYO key data handling details
- **Re-analyze button** — force a fresh analysis bypassing cache with one click
- **Social verification badges** — green (verified on homepage) and yellow (probe-discovered) indicators for discovered social accounts
- **RFC / documentation links** — AI Readiness checklist items link to specs (llmstxt.org, OpenAI crawler docs, schema.org, ANS spec); security headers link to MDN docs
- **Cache analysis panel** — Performance tab shows parsed Cache-Control directives, CDN cache status (Cloudflare/Vercel/CloudFront/Fastly), ETag/Last-Modified, Vary, effective TTL, and a verdict with issues
- **WAF detection** — identifies 11+ WAF providers (Cloudflare, Sucuri, Imperva, Akamai, AWS WAF, Barracuda, F5, DDoS-Guard, StackPath, Wordfence, ModSecurity) from headers, cookies, and HTML with confidence scoring
- **Trust signals** — aggregated trust hallmarks across security (HSTS preload, CSP, CAA, DNSSEC, WAF), identity (OV/EV certs, security.txt, bug bounty, DMARC enforcement), transparency (humans.txt, ads.txt, open source), and operational maturity (status pages, uptime monitoring, feedback tools, changelog widgets, trust badges)
- **SSL Labs deep link** — every SSL panel links directly to the full SSL Labs report
- **6 themes** — Dark (default), Light, Midnight, Nord, Solarized, High Contrast
- **Wildcard DNS detection** — random subdomain probe prevents false positives for ANS/DNS-AID agent discovery on domains with `*.domain` records
- **D1 cleanup endpoint** — `GET /api/cleanup` (admin-gated) clears stale cache, rate limits, and error logs
- **Domain comparison** — side-by-side scoring at `/compare/domain1/domain2` with overlaid radar, per-axis deltas, and key differences
- **83 detection signals** — expanded from 70 with 13 new signals extracted from existing data: open ports (Shodan), known vulnerabilities, cookie security, server version disclosure, referrer policy, permissions policy, HTTP-to-HTTPS redirect, redirect chain length, site unreachable, HTTP error response, security.txt, restrictive robots, PWA readiness
- **Fixed axis weights** — Security (0.25), Reliability (0.25), Trust (0.20), Performance (0.18), Visibility (0.12) replace per-archetype weight profiles for more consistent scoring
- **Breach grade cap** — domains with >100M breached accounts capped at B grade
- **Social verification** — Instagram and Threads added to rel="me" verification and footer links (7 platforms total)
- **Threads detection fix** — Threads accounts no longer misidentified as Mastodon due to generic Mastodon URL pattern

### Security
- **Worker-to-Fly auth** — optional `FLY_AUTH_SECRET` shared secret between the CF Worker and Fly probe; graceful degradation when unset
- **SSRF protection** — private IP blocking on redirect chains
- **Rate limiting** — per-endpoint D1-backed rate limits (30/hr analyze, 15/hr compare, 10/day AI)
- **Cache upsert** — `INSERT OR REPLACE` prevents UNIQUE constraint races on concurrent writes

### Performance
- **Code splitting** — React.lazy with 21 lazy chunks; initial JS reduced from 646KB to 213KB (67% reduction)
- **Clean landing page** — no auto-analyze on bare homepage load
- **`ctx.waitUntil`** — non-blocking background cache writes and analytics inserts
- **Go proxy timeouts** — read (10s), write (30s), idle (120s) server timeouts on the Fly probe
- **Timeout tuning** — per-check 30s timeout, Phase 2 deadline 50s, optimized for Cloudflare Workers paid plan
- **Port classification** — 8080/8443 removed from dangerous ports list (standard HTTP alternate ports)

### Infrastructure
- **Shared analysis core** — merged `analyze.ts` and `analyze-stream.ts` into a single `analyze/core.ts` pipeline; JSON and SSE endpoints are now thin wrappers with zero logic duplication
- **DoH fallback** — DNS resolution falls back from dns.google to cloudflare-dns.com on failure
- **Self-hosting support** — all URLs dynamic via `getBaseUrl(request, env)`; `BASE_URL` and `FLY_PROBE_URL` env vars for custom deployments
- **Zero `as any`** — full type safety across the entire codebase

### Bug Fixes
- **Browser title** — document title now resets when navigating home via logo click

### Developer Experience
- **Homebrew tap** — `brew install yokedotlol/tap/yoke` via GoReleaser-managed releases
- **CLI version flag** — `yoke --version` prints version, commit, and build date (injected by GoReleaser at release time)
- **`deploy.sh` in repo** — no longer gitignored; clean build + deploy in one command
- **Retired `build_combined.py`** — all SPA routing ported to TypeScript (`worker/src/spa.ts`)
- **Retired `QUICKSTART.md`** — self-hosting guide consolidated into README
- **151 tests** — scoring, detection, helpers, WHOIS, structured data
- **CHANGELOG.md** — you're reading it

## [1.0.0] — 2026-05-21

Initial release. 9-tab domain intelligence dashboard with 50+ data points.
