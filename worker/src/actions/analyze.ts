// ─── Domain Analysis Orchestrator ────────────────────────────────────
// JSON endpoint — delegates all analysis logic to the shared core pipeline.

import { CORS_HEADERS, type Env, normalizeDomain } from "../helpers";
import { runAnalysis } from "./analyze/core";

export async function analyzeDomain(domain: string, env: Env, skipCache = false): Promise<Response> {
  domain = normalizeDomain(domain);
  if (!domain?.includes(".")) {
    return new Response(JSON.stringify({ error: "Invalid domain" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const result = await runAnalysis(domain, env, skipCache);
  // All result kinds return JSON — the core handles caching internally
  return new Response(JSON.stringify(result.data), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
