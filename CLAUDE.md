# CLAUDE.md

Project context for AI coding assistants (Claude Code, Cursor, Copilot, Codex, Hatch, etc.).

## What This Is

Yoke is a domain intelligence / OSINT tool. Users enter a domain → get a comprehensive multi-tab analysis (DNS, WHOIS, SSL, security, tech stack, performance, breaches, AI insights). Served as a web SPA, a JSON API (`curl yoke.lol/stripe.com`), and a Chrome extension.

## Architecture

```
worker/src/          → Cloudflare Worker (TypeScript). Hand-rolled router, NO framework.
client/src/          → React SPA (Vite + TypeScript). NO Tailwind — plain CSS.
fly-proxy/           → Go HTTP proxy on Fly.io (SSL probing, GeoIP, SSRF-safe fetch)
extension/           → Chrome extension (Manifest V3, side panel iframe to yoke.lol)
tests/               → Vitest (pure function tests only — no D1 mocks, no integration tests)
```

### Two D1 Databases (important — don't confuse them)

- **`DB`** (`yoke-cache`) — ephemeral. Domain analysis cache, recent lookups. Can be wiped.
- **`STATS_DB`** (`yoke-stats`) — durable. Rate limits, endpoint usage, domain scores, tab analytics. Do NOT wipe.

### Module Scope in CF Workers

CF Worker module scope persists across requests within the same isolate. **Do NOT use module-level `let` for per-request state.** Pass `env` through function parameters. The codebase was cleaned of module-level mutable state — don't reintroduce it.

### Self-Analysis Trap

CF Workers cannot `fetch()` their own domain (creates a loop). Yoke detects self-analysis via `instanceHost` and uses `env.ASSETS.fetch()` to serve its own HTML locally. Do NOT use build-time globals (`__HTML__`, `__ROBOTS_TXT__`) — those are dead codepaths from a removed Python combiner.

## Key Patterns — Follow These

### Check Registry (`worker/src/checks/`)

Analysis checks are individual files with a standard interface. See `worker/src/checks/types.ts`:

```typescript
interface Check {
  key: string;       // result object key
  label: string;     // streaming progress label
  default: unknown;  // fallback on failure
  run: (ctx: CheckContext) => Promise<unknown>;
}
```

**To add a check:** create a file in `checks/`, export a `Check` object, register in `checks/registry.ts`. Append to the end — order matters.

### External Fetches

Always use helpers from `worker/src/helpers.ts`:

- **`fetchWithTimeout(url, init, timeoutMs)`** — every external call needs a timeout
- **`boundedText(response, maxBytes)`** — caps response body reads (default 2MB). Use for any response you `.text()`
- **`safeFetchWithRedirects(url, init, maxRedirects)`** — follows redirects with SSRF checks at each hop
- **`isBlockedUrl(url)`** — SSRF check. Always validate URLs from user input or redirects

Never use bare `fetch()` for external calls. Never use `.text()` without `boundedText()`.

### Error Handling

- Checks **must not throw**. Return `check.default` on failure.
- Use `log('warn', ...)` from `worker/src/logger.ts` in catch blocks — not bare `console.log` and never empty `catch {}`.
- Fail-open for non-critical checks (one failed check shouldn't block the analysis).
- Fail-closed for security checks (SSRF protection, admin auth).

### Logging

Use the structured logger (`worker/src/logger.ts`), not `console.log`:

```typescript
import { log } from '../logger';
log('info', 'analysis started', { domain: 'stripe.com' });
log('warn', 'RDAP timeout', { domain, elapsed: 5000 });
log('error', 'D1 write failed', { domain, error: String(e) });
```

### CORS

CORS headers are applied by the `json()` helper in `helpers.ts` for public endpoints. Admin endpoints (`/api/cleanup`, `/api/cache`, `/usage`) use `adminJson()` which does NOT include CORS. Don't add `Access-Control-Allow-Origin: *` to admin responses.

### Rate Limiting

- Endpoint rate limits: D1-backed, per-IP, checked via `checkRateLimit()`.
- AI analysis: separate rate limit table, slot reserved before API call, refunded on failure using the specific row ID (not `ORDER BY id DESC LIMIT 1` — that's racy).

## Anti-Patterns — Don't Do These

- **No `as any`** — the codebase is fully typed, keep it that way
- **No bare `console.log`** — use the structured logger
- **No module-level `let`** for per-request state — pass through params
- **No unbounded response reads** — always use `boundedText()`
- **No `io.Copy` without `io.LimitReader`** in the Go proxy — cap at 1MB
- **No raw error messages to clients** in the Go proxy — log details server-side, return generic errors
- **No `__HTML__` / `__ROBOTS_TXT__` build-time globals** — use `env.ASSETS.fetch()`
- **No CORS on admin endpoints** — use `adminJson()` not `json()`
- **No storing full analysis JSON in `domain_lookups`** — summary fields only, full result is in `domain_cache`

## Testing

```bash
bun test              # 131 tests, all should pass
cd fly-proxy && go test -v   # Go proxy unit tests
```

Tests cover: scoring thresholds, detection fingerprints, WHOIS parsing, helpers, registry order. No D1 mocking or integration tests yet — tests are pure functions only.

When adding a check, add a test for its expected output shape and a test for graceful failure.

## Build & Deploy

```bash
bun install && cd client && bun install && cd ../worker && bun install && cd ..
bun run build                    # builds client + worker
cd worker && bun run dev         # local Worker dev (needs wrangler.toml)
bun run dev:client               # local Vite dev server
./deploy.sh                      # deploy to CF (requires CF API token)
```

Secrets (OpenRouter, WhoisFreaks, PageSpeed API keys, ADMIN_KEY) are CF Worker secrets — never in code or wrangler.toml.

## File Quick Reference

| Task | File |
|------|------|
| Add an analysis check | `worker/src/checks/` + `registry.ts` |
| Change routing / add endpoint | `worker/src/index.ts` |
| Modify analysis orchestration | `worker/src/actions/analyze/core.ts` |
| Change scoring | `worker/src/actions/analyze/contextual-scoring.ts` + `config/` |
| Edit AI analysis prompts | `worker/src/actions/ai-analysis.ts` |
| SSRF / CORS / fetch helpers | `worker/src/helpers.ts` |
| OG tags / CSP / SPA serving | `worker/src/spa.ts` |
| Fly proxy (SSL, GeoIP) | `fly-proxy/main.go` |
| Chrome extension | `extension/` |
| Tests | `tests/*.test.ts` |
