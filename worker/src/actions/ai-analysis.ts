import { type Env, normalizeDomain, fetchWithTimeout, getFromCache, setCache, CORS_HEADERS } from "../helpers";
import { AI_CACHE_TTL_MS } from "../config/cache";
import { logWarn, logError } from "../logger";
import { logApiError } from "../api-errors";

// ─── System Prompt ──────────────────────────────────────────────────

// AI analysis prompt — extracted to prompts/ai-analysis.txt for easy editing.
// At build time this is inlined as a string constant.
// See: https://github.com/yokedotlol/yoke/blob/main/prompts/ai-analysis.txt
import SYSTEM_PROMPT_RAW from "../../../prompts/ai-analysis.txt";
const SYSTEM_PROMPT = SYSTEM_PROMPT_RAW;

// ─── Data Sanitizer ─────────────────────────────────────────────────
// Strip verbose fields to keep token count low

function sanitizeForLLM(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...data };

  // Remove verbose/binary fields
  delete sanitized.screenshot_url;

  // Strip raw headers (security_audit already summarizes them)
  if (sanitized.headers && typeof sanitized.headers === "object") {
    const h = { ...(sanitized.headers as Record<string, unknown>) };
    delete h.raw;
    sanitized.headers = h;
  }

  // Strip verbose robots parsed blocks
  if (sanitized.robots_parsed && typeof sanitized.robots_parsed === "object") {
    const rp = { ...(sanitized.robots_parsed as Record<string, unknown>) };
    delete rp.blocks;
    sanitized.robots_parsed = rp;
  }

  // Strip llms_txt full content (can be huge)
  if (sanitized.llms_txt && typeof sanitized.llms_txt === "object") {
    const lt = { ...(sanitized.llms_txt as Record<string, unknown>) };
    delete lt.content;
    delete lt.full_content;
    sanitized.llms_txt = lt;
  }

  // Strip json_ld raw fields
  if (Array.isArray(sanitized.json_ld)) {
    sanitized.json_ld = (sanitized.json_ld as Array<Record<string, unknown>>).map(item => {
      const clean = { ...item };
      delete clean.raw;
      return clean;
    });
  }

  // Strip performance screenshot
  if (sanitized.performance && typeof sanitized.performance === "object") {
    const p = { ...(sanitized.performance as Record<string, unknown>) };
    delete p.screenshot;
    sanitized.performance = p;
  }

  // Remove meta fields that aren't useful for analysis
  if (sanitized.meta && typeof sanitized.meta === "object") {
    const m = { ...(sanitized.meta as Record<string, unknown>) };
    delete m.robots_txt; // raw text, already parsed in robots_parsed
    sanitized.meta = m;
  }

  // Strip verbose third-party script URLs — keep counts, categories, and flags
  if (sanitized.third_party_scripts && typeof sanitized.third_party_scripts === "object") {
    const tps = { ...(sanitized.third_party_scripts as Record<string, unknown>) };
    if (tps.categories && typeof tps.categories === "object") {
      const cats: Record<string, unknown> = {};
      for (const [cat, val] of Object.entries(tps.categories as Record<string, unknown>)) {
        if (val && typeof val === "object" && "count" in (val as Record<string, unknown>)) {
          cats[cat] = { count: (val as Record<string, unknown>).count };
        }
      }
      tps.categories = cats;
    }
    sanitized.third_party_scripts = tps;
  }

  // Strip verbose accessibility check details — keep name, status, and impact
  if (sanitized.accessibility && typeof sanitized.accessibility === "object") {
    const a11y = { ...(sanitized.accessibility as Record<string, unknown>) };
    if (Array.isArray(a11y.checks)) {
      a11y.checks = (a11y.checks as Array<Record<string, unknown>>).map(check => ({
        name: check.name,
        status: check.status,
        impact: check.impact,
      }));
    }
    sanitized.accessibility = a11y;
  }

  // Strip verbose cookie details — keep category counts and compliance flags
  if (sanitized.cookie_consent && typeof sanitized.cookie_consent === "object") {
    const cc = { ...(sanitized.cookie_consent as Record<string, unknown>) };
    if (Array.isArray(cc.cookies_set)) {
      const cookies = cc.cookies_set as Array<Record<string, unknown>>;
      cc.cookie_count = cookies.length;
      cc.cookie_categories = cookies.reduce((acc: Record<string, number>, c) => {
        const cat = String(c.category || "unknown");
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      cc.insecure_cookies = cookies.filter(c => !c.secure).length;
      delete cc.cookies_set;
    }
    sanitized.cookie_consent = cc;
  }

  // Strip per-resolver IPs from DNS propagation — keep consistency summary
  if (sanitized.network_health && typeof sanitized.network_health === "object") {
    const nh = { ...(sanitized.network_health as Record<string, unknown>) };
    if (nh.dns_propagation && typeof nh.dns_propagation === "object") {
      const dns = { ...(nh.dns_propagation as Record<string, unknown>) };
      if (Array.isArray(dns.resolvers)) {
        dns.resolvers = (dns.resolvers as Array<Record<string, unknown>>).map(r => ({
          name: r.name,
          status: r.status,
          response_time_ms: r.response_time_ms,
          ip_count: Array.isArray(r.ips) ? (r.ips as string[]).length : 0,
        }));
      }
      nh.dns_propagation = dns;
    }
    sanitized.network_health = nh;
  }

  return sanitized;
}

// ─── Prompt Builder (shared by AI call and DIY copy) ────────────────

export function buildAIPrompt(analysisData: Record<string, unknown>): { system: string; user: string } {
  const sanitized = sanitizeForLLM(analysisData);
  const userMessage = `<domain_data>\n${JSON.stringify(sanitized, null, 0)}\n</domain_data>\n\nAnalyze this domain and provide your structured assessment.`;
  return { system: SYSTEM_PROMPT, user: userMessage };
}

// ─── OpenRouter API Call ────────────────────────────────────────────

const DEFAULT_MODEL = "anthropic/claude-sonnet-4";


interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

async function callOpenRouter(
  apiKey: string,
  analysisData: Record<string, unknown>,
  referer?: string,
): Promise<AIAnalysisResult> {
  const { system, user } = buildAIPrompt(analysisData);

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }

    try {
      const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        timeout: 55000,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": referer || "https://github.com/yokedotlol/yoke",
          "X-Title": "Yoke Domain Intelligence",
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.3,
          max_tokens: 4000,
        }),
      });

      // Don't retry on 4xx (auth errors, bad request) — only on 5xx/network
      if (!response.ok) {
        const errText = await response.text();
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`OpenRouter API error ${response.status}: ${errText.slice(0, 200)}`);
        }
        lastError = new Error(`OpenRouter API error ${response.status}: ${errText.slice(0, 200)}`);
        logWarn("OpenRouter attempt failed", { attempt: attempt + 1, maxRetries, status: response.status });
        continue;
      }

      const data = (await response.json()) as OpenRouterResponse;

      if (!data.choices?.[0]?.message?.content) {
        throw new Error("Empty response from LLM");
      }

      const content = data.choices[0].message.content.trim();

      // Parse JSON from the response — handle potential markdown wrapping
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      // Strip BOM and extra whitespace that some models emit
      jsonStr = jsonStr.replace(/^\uFEFF/, '').trim();

      let parsed: AIAnalysisResult;
      try {
        parsed = JSON.parse(jsonStr);
      } catch { /* invalid JSON */
        throw new Error(`Failed to parse LLM response as JSON: ${content.slice(0, 200)}`);
      }

      // Validate required fields
      if (!parsed.summary || !parsed.posture || !Array.isArray(parsed.key_findings)) {
        throw new Error("LLM response missing required fields (summary, posture, key_findings)");
      }

      // Attach token usage for transparency
      if (data.usage) {
        parsed._usage = {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
        };
      }

      return parsed;
    } catch (err) {
      // 4xx and parse errors bubble up immediately (already thrown above)
      if (lastError === null) throw err;
      logWarn("OpenRouter attempt error", { attempt: attempt + 1, maxRetries, error: err instanceof Error ? err.message : String(err) });
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("AI analysis failed after retries");
}

// ─── Types ──────────────────────────────────────────────────────────

interface KeyFinding {
  category: string;
  finding: string;
  severity: string;
  action: string;
}

interface Recommendation {
  priority: number;
  action: string;
  impact: string;
  effort: string;
  tool?: string;
}

interface PersonaInsights {
  site_owner: string;
  security_researcher: string;
  competitor_analyst: string;
  domain_buyer: string;
  developer: string;
  seo_professional: string;
}

interface AIAnalysisResult {
  summary: string;
  posture: string;
  key_findings: KeyFinding[];
  persona_insights: PersonaInsights;
  attack_surface: string[];
  recommendations: Recommendation[];
  _usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface CachedAIResult {
  result: AIAnalysisResult;
  analyzed_at: string;
  domain: string;
}

// ─── Rate Limiting ──────────────────────────────────────────────────

const AI_HOURLY_LIMIT = 10;

async function ensureRateLimitTable(db: D1Database): Promise<void> {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS ai_rate_limits (id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT NOT NULL, ts INTEGER NOT NULL DEFAULT 0)"
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_ai_rate_ip_ts ON ai_rate_limits(ip, ts)"
  ).run();
}

async function getRateLimitCount(db: D1Database, ip: string): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - 3600;
  const row = await db.prepare(
    "SELECT COUNT(*) as cnt FROM ai_rate_limits WHERE ip = ? AND ts > ?"
  ).bind(ip, cutoff).first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

async function recordRateLimitHit(db: D1Database, ip: string): Promise<void> {
  await db.prepare(
    "INSERT INTO ai_rate_limits (ip, ts) VALUES (?, ?)"
  ).bind(ip, Math.floor(Date.now() / 1000)).run();
}

async function cleanupOldRateLimits(db: D1Database): Promise<void> {
  // Probabilistic cleanup: 5% chance per request, delete entries older than 2 hours
  if (Math.random() > 0.05) return;
  try {
    const cutoff = Math.floor(Date.now() / 1000) - 7200;
    await db.prepare("DELETE FROM ai_rate_limits WHERE ts < ?").bind(cutoff).run();
  } catch { /* cleanup failure is non-critical */ }
}

// ─── Main Export ────────────────────────────────────────────────────

export async function getAIAnalysis(
  domain: string,
  env: Env,
  options?: { clientIP?: string }
): Promise<Response> {
  const normalized = normalizeDomain(domain);
  const clientIP = options?.clientIP || "unknown";

  // Must have platform key
  if (!env.OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: "AI analysis not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // Check cache first
  const cached = (await getFromCache(env.DB, normalized, "ai_analysis", AI_CACHE_TTL_MS)) as CachedAIResult | null;
  if (cached) {
    return new Response(JSON.stringify({ ...cached, cached: true }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // Get the analysis data for this domain (from cache or fresh)
  const analysisCache = (await getFromCache(env.DB, normalized, "analysis", 60 * 60 * 1000)) as Record<string, unknown> | null;

  if (!analysisCache) {
    return new Response(
      JSON.stringify({ error: "Domain not yet analyzed. Run a standard analysis first." }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  // Rate limiting
  let rateLimitRowId: number | undefined;
  try {
    await ensureRateLimitTable(env.STATS_DB);
    const count = await getRateLimitCount(env.STATS_DB, clientIP);
    if (count >= AI_HOURLY_LIMIT) {
      // Build the DIY prompt for the rate-limited user
      const { system, user } = buildAIPrompt(analysisCache);
      const diyPrompt = `${system}\n\n---\n\n${user}`;
      return new Response(JSON.stringify({
        rate_limited: true,
        limit: AI_HOURLY_LIMIT,
        used: count,
        reset: "~1 hour",
        diy_prompt: diyPrompt,
        model_suggestion: "anthropic/claude-sonnet-4",
        instructions: "Copy the prompt below and paste it into ChatGPT, Claude, Gemini, or any AI assistant.",
      }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
          "X-RateLimit-Limit": String(AI_HOURLY_LIMIT),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 3600),
          "Retry-After": "3600",
        },
      });
    }
    // Reserve the slot BEFORE calling OpenRouter to prevent race conditions.
    const rlResult = await env.STATS_DB.prepare(
      "INSERT INTO ai_rate_limits (ip, ts) VALUES (?, ?)"
    ).bind(clientIP, Math.floor(Date.now() / 1000)).run();
    rateLimitRowId = rlResult.meta?.last_row_id as number | undefined;
  } catch (rateLimitErr) {
    // Rate limit check failed (STATS_DB issue)
    logError("AI rate-limit DB error", { error: rateLimitErr instanceof Error ? rateLimitErr.message : String(rateLimitErr) });
    // Fail-open with logging — D1 hiccups shouldn't block AI analysis entirely
    logWarn("Proceeding without rate limit check due to STATS_DB error");
  }

  try {
    const result = await callOpenRouter(env.OPENROUTER_API_KEY!, analysisCache, env.BASE_URL);

    const responseData: CachedAIResult = {
      result,
      analyzed_at: new Date().toISOString(),
      domain: normalized,
    };

    // Cache the result
    await setCache(env.DB, normalized, "ai_analysis", responseData);

    // Probabilistic cleanup of old rate limit entries
    try {
      await cleanupOldRateLimits(env.STATS_DB);
    } catch { /* non-critical */ }

    return new Response(JSON.stringify({ ...responseData, cached: false }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    // OpenRouter call failed — best-effort release of the rate limit slot
    if (rateLimitRowId) {
      try {
        await env.STATS_DB.prepare(
          "DELETE FROM ai_rate_limits WHERE id = ?"
        ).bind(rateLimitRowId).run();
      } catch { /* decrement failure is non-critical */ }
    }
    const msg = err instanceof Error ? err.message : "AI analysis failed";
    logApiError(env.STATS_DB, { api: "openrouter", status: 0, message: msg.slice(0, 200), domain: normalized });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}
