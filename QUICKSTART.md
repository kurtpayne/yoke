# Yoke Self-Hosting Quickstart

Run your own Yoke instance with **no rate limits**.

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Node.js 18+](https://nodejs.org/) or [Bun](https://bun.sh/)
- Git

## Quick Start (5 minutes)

```bash
# Clone
git clone https://github.com/kurtpayne/yoke.git
cd yoke

# Install deps
bun install        # or: npm install
cd client && bun install && cd ..
cd worker && bun install && cd ..

# Create D1 databases
npx wrangler d1 create yoke-cache
npx wrangler d1 create yoke-stats

# Update worker/wrangler.toml with your database IDs from the output above
# (replace the database_id values in the [[d1_databases]] blocks)

# Build client
cd client && bun run build.ts && cd ..

# Deploy
cd worker && npx wrangler deploy
```

## Optional: API Keys

Yoke works without any API keys — but some features are enhanced with them:

| Key | Feature | Free Tier? |
|-----|---------|-----------|
| `OPENROUTER_API_KEY` | AI Analysis tab | Yes (limited credits) |
| `WHOISFREAKS_API_KEY` | Extended WHOIS data | Yes (100 lookups/month) |
| `GOOGLE_PAGESPEED_API_KEY` | Performance scores | Yes (generous quota) |

Set secrets (one-time):

```bash
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put WHOISFREAKS_API_KEY
npx wrangler secret put GOOGLE_PAGESPEED_API_KEY
npx wrangler secret put ADMIN_KEY  # for the /usage dashboard
```

## Optional: Fly.io Probe

The SSL/protocol probe runs on Fly.io for deeper TLS certificate chain analysis and HTTP/2/3 protocol detection. Without it, Yoke falls back to SSL Labs + direct HTTPS checks — still works great, just less detailed.

See [fly-proxy/](fly-proxy/) for probe setup.

## Custom Domain

```bash
npx wrangler domains attach your-domain.com
```

## Updating

```bash
git pull
cd client && bun run build.ts && cd ..
cd worker && npx wrangler deploy
```

## No Rate Limits

Self-hosted instances have **no rate limits**. All features work identically to yoke.lol. The rate limiting code only activates when a public instance is configured — your private deployment skips it entirely.

## Troubleshooting

**D1 tables not created?** Tables are auto-created on first request. Just hit your instance once.

**Secrets not working?** Run `npx wrangler secret list` to verify they're set.

**Build errors?** Make sure you're using Node 18+ and have both `client/` and `worker/` dependencies installed.
