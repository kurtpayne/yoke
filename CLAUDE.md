# CLAUDE.md

Project context for AI coding assistants (Claude Code, Cursor, Copilot, Codex, Hatch, etc.).

## What This Is

Yoke is a domain intelligence / OSINT tool. Users enter a domain → get a comprehensive multi-tab analysis (DNS, WHOIS, SSL, security, tech stack, performance, breaches, AI insights). Served as a web SPA, a JSON API (`curl yoke.lol/stripe.com`), and a Chrome extension.

## Architecture

```
worker/src/          → Cloudflare Worker (TypeScript). Hand-rolled router, NO framework.
client/src/          → React SPA (Vite + TypeScript + Tailwind v4)
fly-proxy/           → Go HTTP proxy on Fly.io (SSL probing, GeoIP, SSRF-safe fetch)
extension/           → Chrome extension (Manifest V3, side panel iframe to yoke.lol)
cli/                 → Go CLI (goreleaser, Homebrew tap at yokedotlol/homebrew-tap)
prompts/             → AI analysis prompt (extracted .txt file, imported by worker)
tests/               → Vitest (pure function tests only — no D1 mocks, no integration tests)
```

### Storage: KV Cache + D1 Stats

- **`REFERENCE_DATA`** (KV namespace) — all caching. Domain analysis results, recent lookups, subdomain scans, AI analysis. TTL-based expiry, no manual cleanup needed.
- **`STATS_DB`** (`yoke-stats`, D1) — durable stats. Rate limits (`endpoint_rate_limits`, `ai_rate_limits`), endpoint usage, domain scores, tab analytics, daily snapshots. Do NOT wipe.

There is no second D1 database. The old `yoke-cache` D1 was migrated to KV.

### Module Scope in CF Workers

CF Worker module scope persists across requests within the same isolate. **Do NOT use module-level `let` for per-request state.** Pass `env` through function parameters. The codebase was cleaned of module-level mutable state — don't reintroduce it.

### Self-Analysis Trap

CF Workers cannot `fetch()` their own domain (creates a loop). Yoke detects self-analysis via `instanceHost` and uses `env.ASSETS.fetch()` to serve its own HTML locally. Do NOT use build-time globals (`__HTML__`, `__ROBOTS_TXT__`) — those are dead codepaths from a removed Python combiner.

## Key Patterns — Follow These

### Signal Registry (`worker/src/config/signal-registry.ts`)

Single source of truth for all ~136 scoring signals. Every signal declares its axis, actionability, effort, fix description, and severity. Derived constants (`NON_ACTIONABLE`, `EFFORT_MAP`, `FIX_DESC_MAP`, etc.) are exported for use across server and client.

When adding a signal:
1. Add it to `signal-registry.ts`
2. Add the scoring logic in `contextual-scoring.ts` (`findings.push(...)`)
3. Run `npx vitest run` — the registry enforcement tests will catch gaps

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

**To add a check:** create a file in `checks/`, export a `Check` object, register in `checks/registry.ts`. Append to the end — order matters for streaming.

### Client Build

The client SPA is built by `client/build.ts`, which generates `client/dist/index.html` from a **hardcoded template literal** — NOT from `client/index.html`. If you need to change the HTML shell (meta tags, footer links, inline scripts), edit the template in `build.ts`, not `client/index.html`.

### External Fetches

Always use helpers from `worker/src/helpers.ts`:

- **`fetchWithTimeout(url, init, timeoutMs)`** — every external call needs a timeout
- **`boundedText(response, maxBytes)`** — caps response body reads (default 2MB). Use for any response you `.text()`
- **`safeFetchWithRedirects(url, init, maxRedirects)`** — follows redirects with SSRF checks at each hop
- **`isBlockedUrl(url)`** — SSRF check. Always validate URLs from user input or redirects

Never use bare `fetch()` for external calls. Never use `.text()` without `boundedText()`.

### Caching

Use `getFromCache()` and `setCache()` from `helpers.ts`. Both operate on the KV namespace (`env.REFERENCE_DATA`). Cache keys follow the pattern `cache:{type}:{domain}`. TTL is handled by KV expiry — no manual pruning needed.

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
log('error', 'KV write failed', { domain, error: String(e) });
```

### CORS

CORS headers are applied by the `json()` helper in `helpers.ts` for public endpoints. Admin endpoints (`/api/cleanup`, `/api/cache`, `/usage`) use `adminJson()` which does NOT include CORS. Don't add `Access-Control-Allow-Origin: *` to admin responses.

### Rate Limiting

- Endpoint rate limits: D1-backed (`STATS_DB`), per-IP, checked via `checkRateLimit()`.
- AI analysis: separate rate limit table in `STATS_DB`, slot reserved before API call, refunded on failure using the specific row ID (not `ORDER BY id DESC LIMIT 1` — that's racy).

## Anti-Patterns — Don't Do These

- **No `as any`** — the codebase is fully typed, keep it that way
- **No bare `console.log`** — use the structured logger
- **No module-level `let`** for per-request state — pass through params
- **No unbounded response reads** — always use `boundedText()`
- **No `io.Copy` without `io.LimitReader`** in the Go proxy — cap at 1MB
- **No raw error messages to clients** in the Go proxy — log details server-side, return generic errors
- **No `__HTML__` / `__ROBOTS_TXT__` build-time globals** — use `env.ASSETS.fetch()`
- **No CORS on admin endpoints** — use `adminJson()` not `json()`
- **No editing `client/index.html` for the HTML shell** — edit the template in `client/build.ts`

## Testing

```bash
npx vitest run        # 192 tests, all should pass
cd fly-proxy && go test -v   # Go proxy unit tests
```

Tests cover: scoring thresholds, signal registry enforcement, detection fingerprints, WHOIS parsing, helpers, registry order, content negotiation, structured data, scoring integration. No D1 mocking or integration tests — tests are pure functions only.

When adding a check, add a test for its expected output shape and a test for graceful failure.

## Build & Deploy

```bash
bun install && cd client && bun install && cd ../worker && bun install && cd ..
bash deploy.sh --cf              # builds client + worker, deploys to CF
cd worker && bun run dev         # local Worker dev (needs wrangler.toml)
cd client && bun run dev         # local Vite dev server
```

Type checking: `cd worker && bun run typecheck` (must pass with zero errors — CI enforces this).

Linting: `npx @biomejs/biome check .` (must pass with zero errors — CI enforces this). Auto-fix: `npx @biomejs/biome check --write .`. Config in `biome.json`. Covers formatting (2-space indent, double quotes, trailing commas), import sorting, and lint rules across `worker/src/`, `client/src/`, `tests/`, and `client/build.ts`. CSS files excluded (Tailwind v4's `@theme` syntax isn't supported by Biome's parser).

Secrets (OpenRouter, WhoisFreaks, PageSpeed API keys, ADMIN_KEY, SHARE_SECRET) are CF Worker secrets — never in code or wrangler.toml. `SHARE_SECRET` hard-fails if missing (no dev fallback).

## File Quick Reference

| Task | File |
|------|------|
| Add an analysis check | `worker/src/checks/` + `registry.ts` |
| Add/modify a scoring signal | `worker/src/config/signal-registry.ts` + `contextual-scoring.ts` |
| Change scoring logic/axes | `worker/src/actions/analyze/contextual-scoring.ts` + `config/` |
| Change routing / add endpoint | `worker/src/index.ts` |
| Modify analysis orchestration | `worker/src/actions/analyze/core.ts` |
| Edit AI analysis prompt | `prompts/ai-analysis.txt` |
| Edit the HTML shell / footer | `client/build.ts` (NOT `client/index.html`) |
| SSRF / CORS / fetch / cache helpers | `worker/src/helpers.ts` |
| OG tags / CSP / SPA serving | `worker/src/spa.ts` |
| Share cards / signed URLs | `worker/src/share.ts` |
| Fly proxy (SSL, GeoIP) | `fly-proxy/main.go` |
| Chrome extension | `extension/` |
| CLI | `cli/` |
| Tests | `tests/*.test.ts` |
