# Registry Pattern Refactor — Phase 2 Parallel Checks

**Status:** Queued (execute after punch list completes)
**Scope:** Phase 2 parallel checks in `worker/src/actions/analyze/core.ts` only
**Goal:** One file per check, standard interface, auto-registration

## Interface

```typescript
// worker/src/checks/types.ts
export interface Check {
  key: string;           // result object key, e.g. "ssl"
  label: string;         // streaming label, e.g. "SSL/TLS"
  default: unknown;      // fallback value if check fails
  phase: 2;             // only Phase 2 for now
  run: (ctx: CheckContext) => Promise<unknown>;
}

export interface CheckContext {
  domain: string;
  url: string;
  env: Env;
  phase1: Phase1Result;  // DNS + HTTP results from Phase 1
  signal?: AbortSignal;
}
```

## File Structure

```
worker/src/checks/
  types.ts          — interface definitions
  registry.ts       — auto-discovers and exports all checks
  ssl.ts            — SSL/TLS check
  rdap.ts           — WHOIS/RDAP check
  pagespeed.ts      — Google PageSpeed check
  shodan.ts         — Shodan InternetDB check
  ... (one file per check, ~26 files)
```

## Orchestrator Change

core.ts Phase 2 section goes from:
```typescript
const checks = [
  { key: 'ssl', label: 'SSL/TLS', fn: () => checkSsl(...), default: null },
  { key: 'rdap', label: 'WHOIS', fn: () => checkRdap(...), default: null },
  // ... 24 more hand-wired entries
];
```

To:
```typescript
import { registry } from '../checks/registry';
const results = await Promise.allSettled(
  registry.map(check => check.run(ctx))
);
registry.forEach((check, i) => {
  result[check.key] = results[i].status === 'fulfilled' 
    ? results[i].value 
    : check.default;
});
```

## Error Handling

Each check gets a standard wrapper (from the structured logging work in the punch list):
```typescript
async function runCheck(check: Check, ctx: CheckContext) {
  try {
    return await check.run(ctx);
  } catch (e) {
    log('warn', ctx.domain, `${check.label} failed`, { error: String(e) });
    return check.default;
  }
}
```

## Safety

- Write a test that asserts the registry produces the same keys in the same order as the current hardcoded array
- Phase 1 (sequential DNS + HTTP) stays hand-wired — those have ordering dependencies
- Phase 3 (scoring, caching) stays hand-wired — that's post-processing, not a "check"
- Streaming callbacks use `check.label` automatically

## Contributing Surface

After this lands, CONTRIBUTING.md gets:
```markdown
## Adding a New Check

1. Create `worker/src/checks/your-check.ts`
2. Export a `Check` object with key, label, default, and run function
3. Add it to the registry in `worker/src/checks/registry.ts`
4. Run `bun test` — the orchestrator order test will catch any issues
```

## Estimate
~2 hours. Mostly mechanical extraction — move existing check logic into individual files, wire up the registry, verify tests pass.
