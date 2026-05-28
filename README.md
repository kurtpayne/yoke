<div align="center">

# 🔗 Yoke

**Free, open-source domain intelligence — DNS, WHOIS, SSL, security, tech stack, performance, breaches, AI analysis, and more. Web, API, CLI, and Chrome extension.**

[![CI](https://github.com/yokedotlol/yoke/actions/workflows/ci.yml/badge.svg)](https://github.com/yokedotlol/yoke/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.4.0-blue)](https://github.com/yokedotlol/yoke/blob/main/CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/fghkhjlelidaepapcdfjifnlcjmkgpcj?label=Chrome%20Extension)](https://chromewebstore.google.com/detail/yoke/fghkhjlelidaepapcdfjifnlcjmkgpcj)

**[Try it → yoke.lol](https://yoke.lol)** · **[API Docs](https://yoke.lol/api/docs)** · **[CLI](#cli)** · **[Chrome Extension](https://chromewebstore.google.com/detail/yoke/fghkhjlelidaepapcdfjifnlcjmkgpcj)** · **[Status](https://yoke.lol/status)**

</div>

---

## What is Yoke?

Yoke pulls 100+ data points for any domain and presents them in a clean tabbed interface with a contextual scoring system. Think `dig` + `whois` + `nmap` + `curl` + BuiltWith + SecurityTrails — in one tool, no account required.

```bash
curl yoke.lol/stripe.com | jq
```

## Features

### 📊 Contextual Scoring
5-axis scoring (Security, Performance, Reliability, Trust, Visibility) with radar visualization. Fixed axis weights prioritize Security and Reliability (0.25 each), then Trust (0.20), Performance (0.18), and Visibility (0.12). Auto-classifies sites into 7 archetypes (commerce, content, application, corporate, infrastructure, institutional, general) to adjust individual finding severity — missing HSTS is critical for e-commerce, low-priority for a blog. [Compare domains side-by-side](https://yoke.lol/compare/github.com/gitlab.com) with overlaid radar and per-axis deltas.

### 🔍 Core Analysis
- **DNS** — A, AAAA, MX, NS, TXT, CNAME, CAA, SOA with TTL and provider detection
- **WHOIS / RDAP** — 4-tier resolution: RDAP bootstrap → IANA fallback → WhoisFreaks → raw WHOIS. Registrar, dates, domain age, nameservers
- **SSL/TLS** — Grade, issuer, validity, protocols, key exchange. SSL Labs deep link
- **HTTP** — Redirect chain, response times, HTTP/2 and HTTP/3 detection
- **Network Health** — Global availability (check-host.net), DNS propagation (4 resolvers), TCP timing breakdown, BGP routing (RIPE RIS)

### 🛡️ Security
- **Headers Audit** — CSP, HSTS, X-Frame-Options, and more with pass/fail grading
- **Email Auth** — SPF, DKIM, DMARC, BIMI, MTA-STS, TLS-RPT
- **DNSSEC** — DNSKEY and DS record verification
- **Breach Detection** — HIBP database lookup
- **Subdomain Scan** — 157 common prefixes across 12 categories + CT log discovery via CertSpotter
- **Cookie Security** — Secure, HttpOnly, SameSite audit
- **WAF Detection** — 11+ providers (Cloudflare, Sucuri, Imperva, Akamai, etc.)
- **GreyNoise Intel** — Noise/RIOT IP classification
- **Trust Signals** — HSTS preload, CAA, security.txt, bug bounty, status pages, and more

### ⚙️ Tech Stack
- **Technology Detection** — 100+ fingerprints: CMS, frameworks, CDNs, analytics
- **WordPress Deep Detection** — Theme, 100+ plugins, version, page builder, hosting
- **Structured Data** — JSON-LD validation against schema.org for 20+ types
- **Third-Party Scripts** — 100+ patterns across 9 categories with render-blocking detection
- **Cookie Consent** — 13+ CMP platforms detected
- **Accessibility** — 9 WCAG quick checks (labels, alt text, contrast, headings, landmarks)

### 📊 Performance & Business
- **PageSpeed** — Lighthouse scores, Core Web Vitals (FCP, LCP, TBT, CLS), cache analysis
- **Company Intel** — Wikidata + Brandfetch + Crunchbase enrichment
- **Stock Data** — Live ticker, price, market cap, sparkline for public companies
- **News & Social** — Bing News, Hacker News, social account discovery with rel="me" verification badges across 12+ platforms

### 🤖 AI Analysis
6 AI personas (Security Analyst, SEO Expert, Developer, Business Analyst, Privacy Auditor, Performance Engineer). Powered by Claude via OpenRouter with 24h caching. BYO API key to bypass rate limits — includes model picker and prompt editor.

### 🔗 API & Sharing
- **JSON API** — `curl yoke.lol/stripe.com | jq` — content-negotiated, no auth required
- **SSE Streaming** — Real-time per-check progress
- **Share Bar** — Copy link, X, LinkedIn, Reddit, native Web Share
- **Dynamic OG Tags** — Rich previews when sharing analysis URLs
- **Chrome Extension** — [Install from Web Store](https://chromewebstore.google.com/detail/yoke/fghkhjlelidaepapcdfjifnlcjmkgpcj) — one-click side panel analysis
- **Agent Discovery** — ANS (`_ans.` TXT), DNS-AID (`_agents.` TXT), `/.well-known/agent.json`
- **6 Themes** — Dark, Light, Midnight, Nord, Solarized, High Contrast

---

## API

No auth required. JSON by default for programmatic clients, HTML for browsers.

```bash
# Full analysis
curl yoke.lol/stripe.com | jq

# Pretty-printed (no jq needed)
curl "yoke.lol/stripe.com?pretty"

# Specific fields
curl -s yoke.lol/stripe.com | jq '.ssl'
curl -s yoke.lol/stripe.com | jq '.domain_score'
curl -s yoke.lol/stripe.com | jq '.tech_stack'

# Compare two domains
curl -s yoke.lol/api/compare -X POST \
  -H "Content-Type: application/json" \
  -d '{"domain1":"github.com","domain2":"gitlab.com"}' | jq '.comparison'

# Health / status
curl yoke.lol/api/health | jq

# Scoring methodology
curl yoke.lol/api/scoring | jq
```

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| Analyze | 50/hr per IP |
| Compare | 50/hr per IP |
| Subdomain Scan | 30/hr per IP |
| Availability | 60/hr per IP |
| AI Analysis (platform key) | 10/hr per IP |
| AI Analysis (BYO key) | Unlimited |

All limits use a rolling 1-hour window. Self-hosted instances can override or disable limits via environment variables.

### API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:domain` | Full analysis (JSON) |
| `POST` | `/api/analyze` | Analysis (JSON or SSE via `Accept: text/event-stream`) |
| `POST` | `/api/compare` | Side-by-side domain comparison |
| `POST` | `/api/subdomains` | CT log subdomain discovery |
| `POST` | `/api/subdomain-scan` | Active subdomain enumeration |
| `POST` | `/api/availability` | Global HTTP availability check |
| `POST` | `/api/company` | Company enrichment + stock data |
| `POST` | `/api/news` | News aggregation |
| `POST` | `/api/social` | Social account discovery |
| `POST` | `/api/suggestions` | Related domain suggestions |
| `POST` | `/api/reverse-ip` | Reverse IP lookup |
| `POST` | `/api/ai-analysis` | AI deep analysis |
| `GET` | `/api/recent` | Recent lookups |
| `GET` | `/api/health` | Service health |
| `GET` | `/api/scoring` | Scoring methodology |
| `GET` | `/api/docs` | API documentation |

---

## CLI

Yoke includes a fast Go-based CLI for terminal domain analysis.

### Install

**Homebrew (macOS/Linux):**
```bash
brew install yokedotlol/tap/yoke
```

**Shell script:**
```bash
curl -sSL https://yoke.lol/install.sh | bash
```

**From source:**
```bash
git clone https://github.com/yokedotlol/yoke.git
cd yoke/cli && go build -o yoke .
```

### Usage

```bash
# Analyze a domain
yoke stripe.com
yoke stripe.com --json | jq .ssl
yoke score stripe.com
yoke compare github.com gitlab.com

# AI-powered analysis
yoke ai stripe.com

# Configure (for self-hosting)
yoke config --set-base-url https://your-instance.com
export YOKE_BASE_URL=https://your-instance.com  # ephemeral override

# Commands
yoke <domain>                    # Full analysis card
yoke <domain> --json             # Raw JSON output
yoke score <domain>              # Quick score (e.g., "92/100 A")
yoke compare <d1> <d2>           # Side-by-side comparison
yoke ai <domain>                 # AI-powered analysis
yoke config                      # Show current config
yoke config --set-base-url <url> # Set custom API endpoint
yoke --version                   # Print version info
```

The CLI uses the same API as the web app and supports custom endpoints via config file (`~/.yoke.toml`) or `YOKE_BASE_URL` env var.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                    yoke.lol                        │
│                                                    │
│  ┌─────────────┐       ┌──────────────────────┐   │
│  │ React SPA   │──────▶│  Cloudflare Worker    │   │
│  │ (Tailwind,  │       │  (zero-dep router)    │   │
│  │  React Query│       │                       │   │
│  │  Leaflet)   │       │  ┌─────────────────┐  │   │
│  └─────────────┘       │  │  D1 (SQLite)    │  │   │
│                         │  └─────────────────┘  │   │
│  ┌─────────────┐       └───────┬────────────────┘   │
│  │Chrome Ext.  │─ iframe ──────┘       │            │
│  └─────────────┘                       │            │
└────────────────────────────────┼───────┼────────────┘
                                 │       │
            ┌────────────────────┘       │
            │                    ┌───────┴──────────┐
            │                    │  Fly.io Proxy     │
            │                    │  (Go — probes,    │
            │                    │   GeoIP, relay)   │
            │                    └──────────────────┘
            │
            └───── 20+ external APIs (DNS, RDAP, SSL Labs,
                   HIBP, Shodan, PageSpeed, Wikidata, etc.)
```

| Layer | Tech | Details |
|-------|------|---------|
| **Frontend** | React 19, Tailwind v4, React Query, Leaflet | 21 lazy chunks, ~213KB initial JS |
| **Backend** | Cloudflare Worker (TypeScript) | Zero dependencies, ~214KB bundled |
| **Database** | Cloudflare D1 | SQLite at the edge — cache + rate limits + analytics |
| **Proxy** | Go on Fly.io | HTTP probes, MaxMind GeoIP, check-host.net relay |
| **Extension** | Chrome Manifest V3 | Side panel, zero dependencies |
| **Build** | Bun + Vite | Node.js 22+ for Wrangler deploy |

### Check Registry

Analysis checks use a registry pattern — each check is a self-contained file under `worker/src/checks/` that exports a standard interface. The orchestrator iterates the registry, runs checks in parallel, and handles errors uniformly. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add new checks.

---

## Self-Hosting

### Prerequisites

- [Bun](https://bun.sh/)
- [Node.js 22+](https://nodejs.org/) (for Wrangler CLI)
- [Cloudflare account](https://dash.cloudflare.com/) with Workers + D1
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### Setup

```bash
# 1. Clone and install
git clone https://github.com/yokedotlol/yoke.git
cd yoke
cd client && bun install && cd ..
cd worker && bun install && cd ..

# 2. Configure
cp worker/wrangler.toml.example worker/wrangler.toml
# Edit wrangler.toml — fill in account_id, D1 database IDs, route

# 3. Create D1 databases
wrangler d1 create yoke-cache
wrangler d1 create yoke-stats
# Update wrangler.toml with the database IDs

# 4. Run migrations
wrangler d1 execute yoke-cache --file=worker/migrations/0001_init.sql
wrangler d1 execute yoke-cache --file=worker/migrations/0002_domain_scores.sql

# 5. Set secrets (all optional — each prompt asks for the value interactively)
wrangler secret put BASE_URL              # Your instance URL (enables self-analysis)
wrangler secret put OPENROUTER_API_KEY    # Enables AI Analysis tab
wrangler secret put WHOISFREAKS_API_KEY   # WHOIS fallback for ccTLDs without RDAP
wrangler secret put GOOGLE_PAGESPEED_API_KEY  # Lighthouse scores
wrangler secret put ADMIN_KEY             # Protects /usage, /api/cleanup, /api/cache
wrangler secret put FLY_AUTH_SECRET       # Shared auth between Worker and Fly probe
wrangler secret put SHARE_SECRET          # HMAC-SHA256 key for signed share card URLs

# 6. Build and deploy
bash deploy.sh --cf
```

Both `worker/wrangler.toml` and `fly-proxy/fly.toml` are gitignored — `git pull` will never overwrite your config.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | Enables AI Analysis (Claude via OpenRouter) |
| `WHOISFREAKS_API_KEY` | WHOIS fallback for ccTLDs without RDAP. [Free: 100 req/mo](https://whoisfreaks.com/) |
| `GOOGLE_PAGESPEED_API_KEY` | Lighthouse scores + Core Web Vitals. [Free: 25K req/day](https://console.cloud.google.com/apis/credentials) |
| `BASE_URL` | Instance base URL for self-analysis support |
| `FLY_PROBE_URL` | Custom Fly probe URL (default: direct probes from CF edge) |
| `FLY_AUTH_SECRET` | Shared secret between Worker and Fly probe |
| `SHARE_SECRET` | HMAC-SHA256 key for signing share card URLs. If unset, falls back to a dev key — set your own for production |
| `ADMIN_KEY` | Admin key for `/api/cleanup` |
| `RATE_LIMIT_ANALYZE` | Max analyze/hr per IP (default: 50, 0 = disable) |
| `RATE_LIMIT_COMPARE` | Max compare/hr per IP (default: 50, 0 = disable) |
| `RATE_LIMIT_SUBDOMAIN` | Max subdomain-scan/hr per IP (default: 30, 0 = disable) |
| `RATE_LIMIT_AVAILABILITY` | Max availability/hr per IP (default: 60, 0 = disable) |
| `CACHE_TTL_HOURS` | Cache TTL in hours (default: 1, 0 = disable) |

### Fly Proxy (optional)

The Go proxy routes HTTP probes from non-Cloudflare IPs (some sites block CF ranges). Also provides MaxMind GeoIP and check-host.net relay.

```bash
cd fly-proxy
cp fly.toml.example fly.toml  # Edit app name and region
fly launch                      # First time
fly deploy                      # Subsequent deploys

# For MaxMind GeoIP (recommended):
MAXMIND_LICENSE_KEY=your_key fly deploy -a your-app -c fly-proxy/fly.toml fly-proxy/
```

Without a proxy, everything still works — sites that block CF IPs show as RESTRICTED instead of UP, but DNS, SSL, and all other checks are unaffected.

### Updating

```bash
git pull
bash deploy.sh --all
```

### Share Card URLs

Share cards generate signed URLs for social sharing with OG image previews. The payload (domain, score, grade, axis scores) is base64url-encoded and signed with HMAC-SHA256.

```bash
# Generate a secret and set it on the worker
openssl rand -hex 32
wrangler secret put SHARE_SECRET
```

If `SHARE_SECRET` is not set, a built-in dev fallback key is used. Set your own for production deployments to prevent URL forgery.

URL patterns:
- `/r/{payload}.{sig}` — Report card HTML page (human-viewable)
- `/og/{payload}.{sig}.png` — Dynamic OG image (PNG, 1200×630, rendered via resvg-wasm)

---

## Chrome Extension

Install from the **[Chrome Web Store](https://chromewebstore.google.com/detail/yoke/fghkhjlelidaepapcdfjifnlcjmkgpcj)** — click the Yoke icon on any site to open a side panel with full analysis.

**Load from source** (development):
1. `chrome://extensions/` → Enable "Developer mode"
2. "Load unpacked" → select the `extension/` directory
3. Click the Yoke icon on any site

---

## Contributing

Contributions welcome! The easiest way to contribute is adding a new analysis check — one file, standard interface, instant impact. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full guide.

```bash
# Quick start
cd client && bun install && cd ..
cd worker && bun install && cd ..
bun test
```

---

## Maintenance

### Admin Endpoints

Three endpoints are protected by `ADMIN_KEY` (set via `wrangler secret put ADMIN_KEY`). Auth uses HTTP Basic — any username, password is your key:

```bash
# Generate a strong key
openssl rand -hex 32

# Usage dashboard (also available at /usage in the browser)
curl -u admin:YOUR_KEY https://your-instance.com/usage

# D1 cleanup — stale cache, old lookups, expired rate limits
curl -u admin:YOUR_KEY https://your-instance.com/api/cleanup

# Purge cached analysis for a specific domain
curl -u admin:YOUR_KEY -X DELETE https://your-instance.com/api/cache/example.com

# Purge all AI analysis cache
curl -u admin:YOUR_KEY -X DELETE "https://your-instance.com/api/cache?type=ai_analysis"
```

Run `/api/cleanup` daily via cron to keep D1 lean.

### Rate Limit Bypass

For batch analysis, internal tooling, or CI pipelines, pass `X-Admin-Key` to skip per-IP rate limits on `/api/analyze`:

```bash
curl -X POST https://your-instance.com/api/analyze \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: YOUR_KEY" \
  -d '{"domain": "example.com"}'
```

Uses the same `ADMIN_KEY` secret. All other endpoints (compare, subdomain-scan, AI, etc.) remain rate-limited as normal.

### Worker-to-Fly Proxy Auth

```bash
# Generate a shared secret and set it on both sides
openssl rand -hex 32
wrangler secret put FLY_AUTH_SECRET
fly secrets set FLY_AUTH_SECRET=your-shared-secret
```

---

## Support

If Yoke saves you time, consider ⭐ [starring the repo](https://github.com/yokedotlol/yoke). GitHub Sponsors coming soon.

## License

[MIT](LICENSE)
