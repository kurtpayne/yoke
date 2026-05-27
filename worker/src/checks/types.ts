// ─── Check Interface & Context ──────────────────────────────────────
// Standard interface for all Phase 2 parallel analysis checks.
// Each check is a self-contained module that describes itself and runs independently.

import type { Env } from "../helpers";
import type { DnsRecord } from "../actions/analyze/types";

/**
 * Context passed to every Phase 2 check.
 * Contains everything a check might need from Phase 1 results and the environment.
 */
export interface CheckContext {
  /** Normalized domain being analyzed */
  domain: string;
  /** Cloudflare Worker environment bindings */
  env: Env;
  /** Instance hostname for self-analysis bypass (e.g., "yoke.lol") */
  instanceHost?: string;
  /** DNS records resolved in Phase 1 */
  dnsRecords: DnsRecord[];
  /** First A-record IP, if any */
  ip?: string;
  /** HTTP response time from Phase 1 probe (ms), or null if probe failed */
  httpResponseTimeMs: number | null;
  /** Skip D1 cache (force fresh analysis) */
  skipCache?: boolean;
}

/**
 * A single analysis check in the Phase 2 parallel pipeline.
 *
 * ## Adding a new check
 *
 * 1. Create `worker/src/checks/your-check.ts`
 * 2. Export a `Check` object: `{ key, label, default, run }`
 * 3. Import and add it to the `registry` array in `worker/src/checks/registry.ts`
 * 4. Run `bun test` — the registry order test will catch any issues
 */
export interface Check {
  /** Result object key (e.g., "ssl", "rdap"). Must be unique across all checks. */
  key: string;
  /** Human-readable label for streaming progress (e.g., "SSL / TLS"). */
  label: string;
  /** Fallback value used when the check throws or rejects. */
  default: unknown;
  /** Execute the check. Receives the shared context; returns the result value. */
  run: (ctx: CheckContext) => Promise<unknown>;
  /** Per-check timeout in ms. Overrides the default PER_CHECK_TIMEOUT_MS when set. */
  timeout?: number;
}
