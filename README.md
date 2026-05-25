<div align="center">

# 🔗 Yoke

**Domain intelligence and OSINT tool**

Analyze any domain — DNS, WHOIS, SSL, security headers, tech stack, performance, breaches, company intel, and more. All from one search.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/kurtpayne/yoke/actions/workflows/ci.yml/badge.svg)](https://github.com/kurtpayne/yoke/actions/workflows/ci.yml)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/fghkhjlelidaepapcdfjifnlcjmkgpcj?label=Chrome%20Extension)](https://chromewebstore.google.com/detail/yoke/fghkhjlelidaepapcdfjifnlcjmkgpcj)

**[Try it → yoke.lol](https://yoke.lol)**

</div>

---

## Support Yoke

If Yoke saves you time, consider ⭐ [starring the repo](https://github.com/kurtpayne/yoke). GitHub Sponsors coming soon.

---

## What is Yoke?

Yoke is a fast, comprehensive domain intelligence tool built for developers, security researchers, sysadmins, and anyone who's curious about what's behind a domain. It pulls data from 50+ data points and presents it in a clean tabbed interface with a contextual scoring system.

Think of it as `dig` + `whois` + `nmap` + `curl` + BuiltWith + SecurityTrails — in one tool, with no account required.

## Features

### 📊 Domain Score
- **Composite Score & Radar Plot** — 5-axis scoring (Security, Performance, Reliability, Trust, Visibility) with SVG radar visualization
- **Contextual Scoring** — Same signal, different severity depending on what the site is. Missing HSTS is critical for e-commerce, low-priority for a blog.
- **Archetype Detection** — Auto-classifies sites into 7 archetypes (commerce, content, application, corporate, infrastructure, institutional, general) and adjusts weights accordingly
- **Archetype Override** — Disagree with the auto-detection? Override it and watch scores shift in real time
- **Domain Comparison** — Side-by-side scoring at `yoke.lol/compare/github.com/gitlab.com` with overlaid radar, per-axis deltas, and key differences table

### 🔍 Core Analysis
- **DNS Records** — A, AAAA, MX, NS, TXT, CNAME, CAA, SOA with TTL and provider detection
- **WHOIS / RDAP** — Registrar, registration/expiry dates, domain age, nameservers. Dynamic IANA bootstrap + WhoisFreaks fallback for ccTLDs without RDAP
- **SSL/TLS** — Grade, issuer, validity, protocols, key exchange. Fallback HTTPS + crt.sh check when SSL Labs has no cached result
- **HTTP Analysis** — Redirect chain, response times, protocol detection (HTTP/2, HTTP/3)
- **Global Availability** — Multi-region HTTP checks via check-host.net with latency and status mapping
- **Network Health** — DNS propagation across Google, Cloudflare, Quad9, and OpenDNS; TCP connection timing with DNS/TCP/TLS breakdown via Fly probe; RIPE RIS BGP routing data (ASN, prefix, visibility, stability); outage monitoring via Downdetector and IsItDownRightNow

### 🛡️ Security
- **Security Headers Audit** — CSP, HSTS, X-Frame-Options, and more with pass/fail grading
- **Email Authentication** — SPF, DKIM, DMARC, BIMI, MTA-STS, TLS-RPT
- **DNSSEC Validation** — DNSKEY and DS record verification
- **Certificate Transparency** — CT log subdomain discovery via CertSpotter
- **Subdomain Enumeration** — Active scan of 157 common prefixes across 12 categories (mail, API, dev, infra, etc.) with DNS resolution and caching
- **Data Breach Detection** — HIBP breach database lookup
- **security.txt** — RFC 9116 security contact and bug bounty detection
- **Cookie Security** — Secure, HttpOnly, SameSite audit
- **Blocklist Check** — DNS-based blocklist scanning (4 reliable lists with false-positive filtering)
- **GreyNoise IP Intelligence** — Noise/RIOT classification for IP addresses

### ⚙️ Tech Stack
- **Technology Detection** — CMS, frameworks, CDNs, analytics, and more (100+ fingerprints)
- **WordPress Deep Detection** — Theme, plugins (100+), version, page builder, hosting environment
- **Hosting / CDN / WAF** — Provider identification from headers, rDNS, and ASN data
- **Structured Data Validation** — JSON-LD validation against schema.org specs for 20+ types (Organization, Product, Article, Event, etc.) with required/recommended field checking
- **Third-Party Script Analysis** — 100+ domain patterns across 9 categories (analytics, advertising, social, CDN, etc.) with render-blocking detection and privacy concerns
- **Cookie Consent Detection** — Identifies 13+ CMP platforms (OneTrust, CookieBot, Osano, etc.)
- **Accessibility Quick Scan** — 9 WCAG checks covering form labels, image alt text, color contrast, heading hierarchy, landmarks, and more

### 📊 Performance & Business
- **PageSpeed Insights** — Lighthouse scores, Core Web Vitals (FCP, LCP, TBT, CLS)
- **Company Intelligence** — Wikidata + Brandfetch + Crunchbase enrichment
- **Stock Data** — Live ticker, price, change, market cap, volume, 52-week range, and 5-day sparkline for publicly traded companies (via Yahoo Finance)
- **News & Social** — Bing News, Hacker News, and social account discovery
- **Domain Signals** — Aggregated strength/notice/weakness indicators

### 🤖 AI Analysis
- **6 AI Personas** — Security Analyst, SEO Expert, Developer, Business Analyst, Privacy Auditor, Performance Engineer
- **Top Priorities** — Deterministic prioritized action plan with effort estimates, cross-axis insights, ranked by impact
- **Posture Assessment** — Strong/Fair/Poor/Critical posture labels (not alarmist risk scores)
- **BYO API Key** — Set your own OpenRouter key (gear icon on AI tab) to bypass platform rate limits. Includes model picker (Claude Sonnet 4, Opus 4, GPT-4o, o3, Gemini 2.5 Pro, Llama 4 Maverick) and prompt editor.
- **Powered by Claude** — Deep analysis via OpenRouter with 24h caching

### 🔗 Sharing & API
- **Share Bar** — Copy link, share to X/Twitter, LinkedIn, Reddit, plus native Web Share API on mobile
- **Dynamic OG Tags** — Rich link previews when sharing domain analysis URLs
- **Re-analyze** — Force a fresh analysis bypassing cache with one click
- **Public JSON API** — `curl yoke.lol/stripe.com | jq`
- **Streaming Analysis** — Real-time SSE progress with per-check status updates
- **Chrome Extension** — One-click analysis for any site you're visiting
- **Well-Known Endpoints** — robots.txt parsing, sitemap detection, ads.txt, humans.txt, llms.txt
- **ANS / DNS-AID Detection** — Agent Name Service (`_ans.` TXT), DNS-AID/BANDAID (`_agents.` TXT), and `/.well-known/agent.json` — scored as bonus points under AI Readiness. Wildcard DNS detection prevents false positives.
- **SSL Labs Deep Link** — Every SSL panel links directly to the full SSL Labs report for the domain
- **Social Verification Badges** — Green (verified on homepage) and yellow (probe-discovered) indicators for social accounts
- **RFC / Documentation Links** — Findings link to relevant RFCs and MDN documentation (HSTS → MDN, DMARC → RFC 7489, etc.)
- **6 Themes** — Dark (default), Light, Midnight, Nord, Solarized, High Contrast

## Usage

### Web
Visit **[yoke.lol](https://yoke.lol)** and type a domain.

### API
```bash
# Full analysis as JSON
curl yoke.lol/stripe.com | jq

# Pretty-printed (no jq needed)
curl "yoke.lol/stripe.com?pretty"

# Extract specific fields
curl -s yoke.lol/stripe.com | jq '.ssl'
curl -s yoke.lol/stripe.com | jq '.tech_stack'
curl -s yoke.lol/stripe.com | jq '.wordpress'
curl -s yoke.lol/stripe.com | jq '.network_health'

# Compare two domains
curl -s yoke.lol/api/compare -X POST \
  -H "Content-Type: application/json" \
  -d '{"domain1":"github.com","domain2":"gitlab.com"}' | jq '.comparison'
```

### Chrome Extension

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/yoke/fghkhjlelidaepapcdfjifnlcjmkgpcj), then click the Yoke icon on any page. Opens a side panel with full domain analysis for the current site.

**Load from source** (for development):
1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" → select the `extension/` directory
4. Click the Yoke icon on any site to open the side panel

The extension source lives in [`extension/`](extension/) — it's a lightweight wrapper that loads yoke.lol in a side panel and auto-detects the domain from your current tab.

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Analyze | 30/hr |
| Compare | 15/hr |
| AI Analysis (platform key) | 10/day |
| AI Analysis (BYO key) | Unlimited |

Bring your own OpenRouter API key (gear icon on the AI tab) to bypass the platform AI rate limit.

## Self-Hosting

### Prerequisites
- [Bun](https://bun.sh/) (build toolchain)
- [Node.js 22+](https://nodejs.org/) (required for Wrangler CLI / `npx wrangler deploy`)
- [Cloudflare account](https://dash.cloudflare.com/) with Workers and D1 enabled
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm i -g wrangler`)

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/kurtpayne/yoke.git
   cd yoke
   cd client && bun install && cd ..
   cd worker && bun install && cd ..
   ```

2. **Configure Wrangler:**
   ```bash
   cp worker/wrangler.toml.example worker/wrangler.toml
   ```
   Edit `worker/wrangler.toml` — uncomment and fill in your `account_id`, D1 database IDs, and route. This file is gitignored, so `git pull` will never overwrite your config.

3. **Create D1 databases:**
   ```bash
   wrangler d1 create yoke-cache
   wrangler d1 create yoke-stats
   ```
   Update `worker/wrangler.toml` with the database IDs from the output.

4. **Run migrations:**
   ```bash
   wrangler d1 execute yoke-cache --file=worker/migrations/0001_init.sql
   wrangler d1 execute yoke-cache --file=worker/migrations/0002_domain_scores.sql
   ```

5. **Configure secrets:**
   ```bash
   # Recommended — set your instance URL for self-analysis support
   wrangler secret put BASE_URL    # e.g. https://yoke.example.com

   # Optional — enables AI Analysis tab
   wrangler secret put OPENROUTER_API_KEY

   # Optional — WHOIS fallback for ccTLDs without RDAP
   wrangler secret put WHOISFREAKS_API_KEY

   # Optional — unlocks Lighthouse scores in Performance tab
   wrangler secret put GOOGLE_PAGESPEED_API_KEY
   ```

6. **Build and deploy:**
   ```bash
   bash deploy.sh --cf
   ```
   This builds the client and worker, then deploys via `npx wrangler deploy`. Requires Node.js 22+.

7. **Deploy HTTP probe proxy (optional but recommended):**

   Cloudflare Worker outbound requests come from Cloudflare IP ranges, which some sites block. The included Fly.io proxy routes HTTP status probes from non-Cloudflare IPs so sites like `meta.com` don't falsely report as DOWN.

   ```bash
   # Install flyctl if needed
   curl -L https://fly.io/install.sh | sh

   # Configure the probe
   cd fly-proxy
   cp fly.toml.example fly.toml   # edit app name and region
   fly launch          # first time — creates the app
   fly deploy           # subsequent deploys
   ```

   The `fly-proxy/fly.toml` is gitignored, so updates via `git pull` won't conflict.

   The proxy exposes these endpoints:
   - `/probe-status?domain=example.com` — HTTP status check with redirect following, HTTP/2 and HTTP/3 protocol detection, returns `{is_up, status_code, response_time_ms, status_label, http2, http3, alt_svc, error}`
   - `/probe-timing?host=example.com` — Connection timing breakdown, returns `{dns_ms, tcp_ms, tls_ms, total_ms, ip, tls_version, error}`
   - `/probe-geo?ip=1.2.3.4` — IP geolocation via local MaxMind GeoLite2-City database (sub-ms, no rate limits), falls back to ip-api.com and ipwho.is
   - `/check-http?host=example.com` — Proxied check-host.net global availability probes (check-host.net blocks CF Worker IPs directly)

   **MaxMind GeoIP (recommended):** For reliable IP geolocation without rate limits, sign up for a free [MaxMind GeoLite2](https://www.maxmind.com/en/geolite2/signup) account and pass your license key as a build argument when deploying:

   ```bash
   MAXMIND_LICENSE_KEY=your_key_here fly deploy -a your-app -c fly-proxy/fly.toml fly-proxy/
   ```

   The Dockerfile downloads the GeoLite2-City database at build time. Without a license key, the probe falls back to ip-api.com and ipwho.is (rate-limited).

   **Using your own proxy:** If you'd rather run the probe elsewhere (Docker, VPS, Lambda, etc.), the proxy is a single Go file (`fly-proxy/main.go`). Set the `FLY_PROBE_URL` environment variable to point at your deployment.

   **Without a proxy:** Everything still works — the worker falls back to direct HTTP probes from the Cloudflare edge. Sites that block CF IPs will show as RESTRICTED instead of UP, but DNS, SSL, and all other checks are unaffected.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | No | Enables AI Analysis tab (Claude via OpenRouter) |
| `WHOISFREAKS_API_KEY` | No | WHOIS fallback for ccTLDs without RDAP (`.it`, `.ru`, `.es`, etc.). Free tier: 100 req/month. Get one at [WhoisFreaks](https://whoisfreaks.com/). |
| `GOOGLE_PAGESPEED_API_KEY` | No | Google PageSpeed Insights API key — unlocks Lighthouse scores and Core Web Vitals. Without it, PageSpeed requests are unauthenticated and rate-limited. Free tier: 25K req/day. Get one at [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (enable "PageSpeed Insights API"). |
| `CF_ACCOUNT_ID` | No | Cloudflare account ID (for some API features) |
| `CF_API_TOKEN` | No | Cloudflare API token (for DNS-over-HTTPS fallback) |
| `BASE_URL` | No | Instance base URL (e.g. `https://yoke.example.com`). Enables self-analysis (analyzing your own domain). Auto-detected from incoming requests if unset. |
| `FLY_PROBE_URL` | No | URL of the Fly.io HTTP probe service (defaults to `https://yoke-probe.fly.dev`). Set this if you deploy your own probe, or leave unset to use direct probes from the Cloudflare edge. |
| `FLY_AUTH_SECRET` | No | Shared secret between the Worker and Fly probe. **Required** for the probe to start — set it on both sides. To run without auth, set `ALLOW_OPEN_PROXY=true` on the probe instead. See [Worker-to-Fly Proxy Auth](#worker-to-fly-proxy-auth). |
| `ADMIN_KEY` | No | Admin key for gated endpoints like `/api/cleanup`. |
| `RATE_LIMIT_ANALYZE` | No | Max analyze requests per IP per hour. Default: `30`. Set to `0` to disable. |
| `RATE_LIMIT_COMPARE` | No | Max compare requests per IP per hour. Default: `15`. Set to `0` to disable. |
| `RATE_LIMIT_SUBDOMAIN` | No | Max subdomain scan requests per IP per hour. Default: `20`. Set to `0` to disable. |
| `RATE_LIMIT_AVAILABILITY` | No | Max availability check requests per IP per hour. Default: `60`. Set to `0` to disable. |
| `CACHE_TTL_HOURS` | No | Analysis cache TTL in hours. Default: `1`. Set to `0` to disable caching. |

To disable all rate limits on a self-hosted instance, set each `RATE_LIMIT_*` variable to `0`.

### Updating

Both `worker/wrangler.toml` and `fly-proxy/fly.toml` are gitignored — `git pull` will never overwrite your config.

```bash
git pull
bash deploy.sh --all
```

### Troubleshooting

- **D1 tables not created?** Tables are auto-created on first request. Just hit your instance once.
- **Secrets not working?** Run `npx wrangler secret list` to verify they're set.
- **Build errors?** Make sure you're using Node 22+ and have both `client/` and `worker/` dependencies installed.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  yoke.lol                         │
│                                                   │
│  ┌─────────────┐     ┌──────────────────────┐    │
│  │ React Client│────▶│  Cloudflare Worker    │    │
│  │ (Tailwind,  │     │  (zero-dep router)    │    │
│  │  React Query│     │                       │    │
│  │  Leaflet)   │     │  ┌─────────────────┐  │    │
│  └─────────────┘     │  │  D1 Cache (SQL)  │  │    │
│                       │  └─────────────────┘  │    │
│  ┌─────────────┐     └───────┬───────────────┘    │
│  │Chrome Ext.  │─ iframe ────┘       │            │
│  │ (side panel)│                     │            │
│  └─────────────┘                     │            │
└──────────────────────────────┼───────┼────────────┘
                               │       │
          ┌────────────────────┘       │
          │                    ┌───────┴──────────┐
          │                    │  Fly.io Proxy     │
          │                    │  (HTTP probes +   │
          │                    │   check-host.net) │
          │                    └──────────────────┘
          │
          ┌─────────────────────┼─────────────────────┐
          │                     │                      │
     ┌────┴────┐  ┌────────────┴──┐  ┌──────────────┐
     │DNS/RDAP │  │SSL Labs/HIBP  │  │PageSpeed/    │
     │Tranco   │  │CertSpotter    │  │GreyNoise     │
     │ipwho.is │  │Observatory    │  │Green Web     │
     │Wikidata │  │Brandfetch     │  │Crunchbase    │
     │Yahoo Fin│  │Bing News      │  │HackerNews    │
     └─────────┘  └───────────────┘  └──────────────┘
                    50+ data points
```

### Tech Stack
- **Frontend:** React 19, Tailwind CSS v4, React Query, Leaflet, Lucide icons — code-split with React.lazy (21 lazy chunks, ~213KB initial JS)
- **Backend:** Cloudflare Worker (zero external dependencies, ~214KB bundled) with DNS-over-HTTPS fallback (dns.google → cloudflare-dns.com)
- **Database:** Cloudflare D1 (SQLite-compatible, edge caching)
- **Probe Proxy:** Go on Fly.io (HTTP status checks + check-host.net relay), secured via shared `FLY_AUTH_SECRET`
- **Extension:** Chrome Manifest V3, side panel API, zero dependencies
- **Build:** Bun (bundler + runtime), Node.js 22+ for Wrangler deploy

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:domain` | Public JSON API — full analysis |
| `POST` | `/api/analyze` | Full domain analysis (JSON or SSE streaming via `Accept: text/event-stream`) |
| `POST` | `/api/compare` | Side-by-side domain comparison |
| `POST` | `/api/subdomains` | CT log subdomain discovery |
| `POST` | `/api/subdomain-scan` | Active subdomain enumeration (157 prefixes) |
| `POST` | `/api/availability` | Global HTTP availability check |
| `POST` | `/api/company` | Company enrichment + stock data |
| `POST` | `/api/news` | News aggregation |
| `POST` | `/api/social` | Social account discovery |
| `POST` | `/api/suggestions` | Related domain suggestions |
| `POST` | `/api/reverse-ip` | Reverse IP lookup |
| `POST` | `/api/ai-analysis` | AI-powered deep analysis (web/extension only) |
| `GET` | `/api/recent` | Recent lookups |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/cleanup` | D1 cleanup — admin only (see Maintenance) |
| `GET` | `/api/docs` | API documentation (JSON) |
| `GET` | `/compare/:d1/:d2` | Compare view (client-side SPA route) |

## Maintenance

### D1 Database Cleanup

Call `GET /api/cleanup` with your admin key to clean up old data:

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_KEY" https://yoke.lol/api/cleanup
```

This deletes:
- **domain_cache** entries older than 7 days
- **domain_lookups** keeping only the 500 most recent
- **ai_rate_limits** expired records (>1 day old)
- **endpoint_rate_limits** expired records (>1 day old)
- **api_errors** older than 7 days

Recommended: run daily via cron or Cloudflare scheduled worker.

### Worker-to-Fly Proxy Auth

The Fly probe **requires** `FLY_AUTH_SECRET` to start. Set it on both the Worker and the probe:

```bash
# Cloudflare Worker
wrangler secret put FLY_AUTH_SECRET

# Fly.io
fly secrets set FLY_AUTH_SECRET=your-shared-secret
```

Both sides must use the same secret. The Worker sends it as a Bearer token; the probe rejects requests without it.

To intentionally run the probe without authentication (not recommended for public deployments), set `ALLOW_OPEN_PROXY=true`:

```bash
fly secrets set ALLOW_OPEN_PROXY=true
```

## Contributing

Contributions welcome! Please open an issue first to discuss what you'd like to change.

```bash
# Install dependencies
cd client && bun install && cd ..
cd worker && bun install && cd ..

# Run tests
npx vitest run

# Build client + worker
cd client && bun run build.ts && cd ..
cd worker && bun run build && cd ..

# Deploy (requires Node.js 22+ for Wrangler)
bash deploy.sh
```

## License

[MIT](LICENSE) — do whatever you want with it.


