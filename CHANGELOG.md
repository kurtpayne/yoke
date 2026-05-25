# Changelog

All notable changes to Yoke are documented here.

## [1.3.0] — 2026-05-28

### Features
- **Top Priorities engine** — replaced Key Findings with a ranked, actionable fix-it list with effort estimates and cross-axis insights
- **BYO API Key panel** — gear icon on AI tab opens advanced settings: API key input, model picker (Claude Sonnet 4, Opus 4, GPT-4o, o3, Gemini 2.5 Pro, Llama 4 Maverick), and live prompt editor
- **Re-analyze button** — force a fresh analysis bypassing cache with one click
- **Social verification badges** — green (verified on homepage) and yellow (probe-discovered) indicators for discovered social accounts
- **RFC / documentation links** — findings link to relevant RFCs and MDN docs (HSTS → MDN, DMARC → RFC 7489, CSP → MDN, etc.)
- **SSL Labs deep link** — every SSL panel links directly to the full SSL Labs report
- **6 themes** — Dark (default), Light, Midnight, Nord, Solarized, High Contrast
- **Wildcard DNS detection** — random subdomain probe prevents false positives for ANS/DNS-AID agent discovery on domains with `*.domain` records
- **D1 cleanup endpoint** — `GET /api/cleanup` (admin-gated) clears stale cache, rate limits, and error logs
- **Domain comparison** — side-by-side scoring at `/compare/domain1/domain2` with overlaid radar, per-axis deltas, and key differences

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

### Infrastructure
- **Shared analysis core** — merged `analyze.ts` and `analyze-stream.ts` into a single `analyze/core.ts` pipeline; JSON and SSE endpoints are now thin wrappers with zero logic duplication
- **DoH fallback** — DNS resolution falls back from dns.google to cloudflare-dns.com on failure
- **Self-hosting support** — all URLs dynamic via `getBaseUrl(request, env)`; `BASE_URL` and `FLY_PROBE_URL` env vars for custom deployments
- **Zero `as any`** — full type safety across the entire codebase

### Developer Experience
- **`deploy.sh` in repo** — no longer gitignored; clean build + deploy in one command
- **Retired `build_combined.py`** — all SPA routing ported to TypeScript (`worker/src/spa.ts`)
- **125 tests** — scoring, detection, helpers, WHOIS, structured data
- **CHANGELOG.md** — you're reading it

## [1.0.0] — 2026-05-21

Initial release. 9-tab domain intelligence dashboard with 50+ data points.
