# Contributing to Yoke

Thanks for wanting to contribute! Yoke is MIT-licensed and welcomes pull requests.

## Quick Start

```bash
git clone https://github.com/kurtpayne/yoke.git
cd yoke

# Install dependencies
cd client && bun install && cd ..
cd worker && bun install && cd ..

# Run tests
bun test

# Build everything
cd client && bun run build.ts && cd ..
cd worker && bun run build && cd ..
```

No Cloudflare account needed for local development or running tests.

## Project Structure

```
yoke/
├── worker/src/          # Cloudflare Worker (TypeScript, zero-framework router)
│   ├── index.ts         # HTTP router + entry point
│   ├── checks/          # Analysis check registry (one file per check)
│   ├── actions/         # API action handlers (analyze, compare, company, etc.)
│   ├── actions/analyze/ # Analysis pipeline (core.ts orchestrator + modules)
│   ├── config/          # Scoring thresholds, cache config
│   ├── helpers.ts       # Shared utilities, SSRF protection, CORS
│   ├── logger.ts        # Structured JSON logger
│   └── spa.ts           # SPA serving, OG tag injection, CSP
├── client/src/          # React SPA (Vite + Tailwind)
├── fly-proxy/           # Go HTTP probe (SSL, GeoIP, check-host relay)
├── extension/           # Chrome extension (Manifest V3, side panel)
└── tests/               # Vitest test suite
```

## Adding a New Analysis Check

This is the easiest and most impactful way to contribute. Each check lives in its own file under `worker/src/checks/`.

### 1. Create your check file

```typescript
// worker/src/checks/my-check.ts
import type { Check, CheckContext } from './types';

const myCheck: Check = {
  key: 'my_check',        // Key in the analysis result object
  label: 'My Check',      // Streaming progress label shown to users
  default: null,           // Fallback value if the check fails
  phase: 2,                // Phase 2 = runs in parallel with other checks

  async run(ctx: CheckContext) {
    // ctx.domain  — the domain being analyzed
    // ctx.url     — the resolved URL (after redirects)
    // ctx.env     — Cloudflare Worker env bindings
    // ctx.phase1  — results from Phase 1 (DNS + HTTP)

    const resp = await fetch(`https://api.example.com/${ctx.domain}`);
    const data = await resp.json();
    return data;
  },
};

export default myCheck;
```

### 2. Register it

Add your check to `worker/src/checks/registry.ts`:

```typescript
import myCheck from './my-check';

export const registry: Check[] = [
  // ... existing checks
  myCheck,
];
```

### 3. Run tests

```bash
bun test
```

The orchestrator order test will verify your check is properly registered.

### What makes a good check?

- **Free public API** — no API key required (or has a generous free tier)
- **Fast** — under 5 seconds. Checks run in parallel but slow ones delay the overall result.
- **Graceful failure** — returns `null` or a default on error, never throws
- **No PII** — don't send user data to third parties beyond the domain name

## Code Style

- **TypeScript** everywhere (worker + client + tests)
- **No framework** in the worker — hand-rolled router, plain `fetch` handler
- **Structured logging** — use `log()` from `worker/src/logger.ts`, not bare `console.log`
- **Error handling** — fail gracefully. Individual check failures should never crash the pipeline. Use the standard check wrapper for consistent error handling.
- **No `as any`** — the codebase is fully typed

## Testing

Tests use [Vitest](https://vitest.dev/) and live in `tests/`:

```bash
bun test                    # Run all tests
bun test -- --watch         # Watch mode
bun test -- scoring         # Run specific test file
```

### What needs tests?

- Scoring logic and threshold boundaries
- Detection fingerprints (tech stack, WordPress, WAF)
- Helper/utility functions
- WHOIS/RDAP parsing for new TLD formats
- New analysis checks (at minimum: expected output shape, graceful failure on error)

### Adding a test

```typescript
// tests/my-feature.test.ts
import { describe, it, expect } from 'vitest';

describe('my feature', () => {
  it('handles the happy path', () => {
    expect(myFunction('input')).toEqual('expected');
  });

  it('handles errors gracefully', () => {
    expect(myFunction(null)).toEqual(defaultValue);
  });
});
```

## Pull Request Checklist

- [ ] `bun test` passes
- [ ] No TypeScript errors (`cd worker && bunx tsc --noEmit`)
- [ ] New checks include a test for the expected output shape
- [ ] No hardcoded secrets or API keys
- [ ] Errors are handled (no empty `catch {}` blocks without logging)
- [ ] Commit message is descriptive (not "fix stuff")

## What Reviewers Look For

- **Does it work?** Reviewers will test your PR against a few domains.
- **Does it fail gracefully?** What happens when the external API is down, rate-limited, or returns garbage?
- **Is it fast?** Checks should complete in under 5 seconds. Use `fetchWithTimeout()` from helpers.
- **Is it typed?** No `any` types. If the external API response is complex, define an interface.

## Opening Issues

Found a bug or have a feature idea? [Open an issue](https://github.com/kurtpayne/yoke/issues). Include:

- What you expected vs. what happened
- The domain you tested (if applicable)
- Browser/OS (for UI bugs)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
