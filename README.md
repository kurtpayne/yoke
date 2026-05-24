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

## What is Yoke?

Yoke is a fast, comprehensive domain intelligence tool built for developers, security researchers, sysadmins, and anyone who's curious about what's behind a domain. It pulls data from 20+ sources and presents it in a clean tabbed interface.

Think of it as `dig` + `whois` + `nmap` + `curl` + BuiltWith + SecurityTrails — in one tool, with no account required.

## Features

### 🔍 Core Analysis
- **DNS Records** — A, AAAA, MX, NS, TXT, CNAME, CAA, SOA with TTL and provider detection
- **WHOIS / RDAP** — Registrar, registration/expiry dates, domain age, nameservers
- **SSL/TLS** — Grade, issuer, validity, protocols, key exchange
- **HTTP Analysis** — Redirect chain, response times, protocol detection (HTTP/2, HTTP/3)

### 🛡️ Security
- **Security Headers Audit** — CSP, HSTS, X-Frame-Options, and more with pass/fail grading
- **Email Authentication** — SPF, DKIM, DMARC, BIMI, MTA-STS, TLS-RPT
- **DNSSEC Validation** — DNSKEY and DS record verification
- **Certificate Transparency** — CT log subdomain discovery via CertSpotter
- **Data Breach Detection** — HIBP breach database lookup
- **security.txt** — RFC 9116 security contact and bug bounty detection
- **Cookie Security** — Secure, HttpOnly, SameSite audit
- **Blocklist Check** — DNS-based blocklist scanning
- **GreyNoise IP Intelligence** — Noise/RIOT classification for IP addresses

### ⚙️ Tech Stack
- **Technology Detection** — CMS, frameworks, CDNs, analytics, and more (100+ fingerprints)
- **WordPress Deep Detection** — Theme, plugins, version, page builder, hosting environment
- **Hosting / CDN / WAF** — Provider identification from headers, rDNS, and ASN data

### 📊 Performance & Business
- **PageSpeed Insights** — Lighthouse scores, Core Web Vitals (FCP, LCP, TBT, CLS)
- **Company Intelligence** — Wikidata + Brandfetch + Crunchbase enrichment
- **News & Social** — Google News, Hacker News, and social account discovery
- **Domain Signals** — Aggregated strength/notice/weakness indicators

### 🤖 AI Analysis
- **6 AI Personas** — Security Analyst, SEO Expert, Developer, Business Analyst, Privacy Auditor, Performance Engineer
- **Powered by Claude** — Deep analysis via OpenRouter

### 🔗 API & Extensions
- **Public JSON API** — `curl yoke.lol/stripe.com | jq`
- **Chrome Extension** — One-click analysis for any site you're visiting
- **Well-Known Endpoints** — robots.txt parsing, sitemap detection, ads.txt, humans.txt, llms.txt

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
```

### Chrome Extension
Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/yoke/fghkhjlelidaepapcdfjifnlcjmkgpcj), then click the Yoke icon on any page.

## Self-Hosting

### Prerequisites
- [Bun](https://bun.sh/) (build toolchain)
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

2. **Create D1 database:**
   ```bash
   wrangler d1 create yoke-cache
   ```
   Update `worker/wrangler.toml` with your database ID.

3. **Run migrations:**
   ```bash
   wrangler d1 execute yoke-cache --file=worker/migrations/001_init.sql
   ```

4. **Configure secrets** (for AI Analysis):
   ```bash
   wrangler secret put OPENROUTER_API_KEY
   ```

5. **Build:**
   ```bash
   bun run build
   ```

6. **Deploy:**
   ```bash
   cd worker && npx wrangler deploy
   ```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | No | Enables AI Analysis tab (Claude via OpenRouter) |
| `CF_ACCOUNT_ID` | No | Cloudflare account ID (for some API features) |
| `CF_API_TOKEN` | No | Cloudflare API token (for DNS-over-HTTPS fallback) |

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
│                       └───────┬───────────────┘    │
│                               │                    │
└───────────────────────────────┼────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                      │
     ┌────┴────┐  ┌────────────┴──┐  ┌──────────────┐
     │DNS/RDAP │  │SSL Labs/HIBP  │  │PageSpeed/    │
     │Tranco   │  │CertSpotter    │  │GreyNoise     │
     │ip-api   │  │Observatory    │  │Green Web     │
     │Wikidata │  │Brandfetch     │  │Crunchbase    │
     └─────────┘  └───────────────┘  └──────────────┘
                    20+ data sources
```

### Tech Stack
- **Frontend:** React 19, Tailwind CSS v4, React Query, Leaflet, Lucide icons
- **Backend:** Cloudflare Worker (zero external dependencies, ~35KB bundled)
- **Database:** Cloudflare D1 (SQLite-compatible, edge caching)
- **Build:** Bun (bundler + runtime)

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:domain` | Public JSON API — full analysis |
| `POST` | `/api/analyze` | Full domain analysis |
| `POST` | `/api/subdomains` | CT log subdomain discovery |
| `POST` | `/api/company` | Company enrichment |
| `POST` | `/api/news` | News aggregation |
| `POST` | `/api/social` | Social account discovery |
| `POST` | `/api/reverse-ip` | Reverse IP lookup |
| `POST` | `/api/ai-analysis` | AI-powered deep analysis |
| `GET` | `/api/recent` | Recent lookups |
| `GET` | `/api/health` | Health check |

## Contributing

Contributions welcome! Please open an issue first to discuss what you'd like to change.

```bash
# Type check everything
bun run typecheck

# Run tests
bun run test
```

## License

[MIT](LICENSE) — do whatever you want with it.

---

<div align="center">

Built by [Kurt Payne](https://github.com/kurtpayne) ⚡

</div>
