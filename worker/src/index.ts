// Minimal Cloudflare Worker router — no external dependencies
// Replaces Hono with a tiny hand-rolled router for zero-dependency deployment

import { analyzeDomain } from "./actions/analyze";
import { checkGlobalAvailability } from "./actions/availability";
import { getRecentLookups } from "./actions/recent";
import { getSubdomains } from "./actions/subdomains";
import { getCompanyInfo } from "./actions/company";
import { getNews } from "./actions/news";
import { getSocialAccounts } from "./actions/social";
import { getReverseIP } from "./actions/reverse-ip";
import { getDomainSuggestions } from "./actions/suggestions";
import { getAIAnalysis } from "./actions/ai-analysis";

interface Env {
  DB: D1Database;
  OPENROUTER_API_KEY?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
}

import { CORS_HEADERS } from "./helpers";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function parseBody<T>(req: Request): Promise<T> {
  return req.json() as Promise<T>;
}

const DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain) && domain.includes(".");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // API routes
    if (path.startsWith("/api/")) {
      try {
        // POST /api/analyze
        if (method === "POST" && path === "/api/analyze") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain || typeof body.domain !== "string") return json({ error: "domain is required" }, 400);
          if (!isValidDomain(body.domain)) return json({ error: "Invalid domain format" }, 400);
          return analyzeDomain(body.domain, env);
        }

        // GET /api/recent
        if (method === "GET" && path === "/api/recent") {
          const limit = parseInt(url.searchParams.get("limit") ?? "10");
          const result = await getRecentLookups(env.DB, limit);
          return json(result);
        }

        // POST /api/subdomains
        if (method === "POST" && path === "/api/subdomains") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain) return json({ error: "domain is required" }, 400);
          const result = await getSubdomains(env.DB, body.domain);
          return json(result);
        }

        // POST /api/company
        if (method === "POST" && path === "/api/company") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain) return json({ error: "domain is required" }, 400);
          if (!isValidDomain(body.domain)) return json({ error: "Invalid domain format" }, 400);
          const result = await getCompanyInfo(env.DB, body.domain);
          return json(result);
        }

        // POST /api/news
        if (method === "POST" && path === "/api/news") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain) return json({ error: "domain is required" }, 400);
          if (!isValidDomain(body.domain)) return json({ error: "Invalid domain format" }, 400);
          const result = await getNews(env.DB, body.domain);
          return json(result);
        }

        // POST /api/social
        if (method === "POST" && path === "/api/social") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain) return json({ error: "domain is required" }, 400);
          const result = await getSocialAccounts(env.DB, body.domain);
          return json(result);
        }

        // POST /api/reverse-ip
        if (method === "POST" && path === "/api/reverse-ip") {
          const body = await parseBody<{ ip?: string }>(request);
          if (!body.ip) return json({ error: "ip is required" }, 400);
          const result = await getReverseIP(env.DB, body.ip);
          return json(result);
        }

        // POST /api/availability
        if (method === "POST" && path === "/api/availability") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain) return json({ error: "domain is required" }, 400);
          if (!isValidDomain(body.domain)) return json({ error: "Invalid domain format" }, 400);
          const result = await checkGlobalAvailability(body.domain);
          return json(result);
        }

        // POST /api/suggestions
        if (method === "POST" && path === "/api/suggestions") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain) return json({ error: "domain is required" }, 400);
          const result = await getDomainSuggestions(body.domain, env);
          return json(result);
        }

        // POST /api/ai-analysis
        if (method === "POST" && path === "/api/ai-analysis") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain || typeof body.domain !== "string") return json({ error: "domain is required" }, 400);
          if (!isValidDomain(body.domain)) return json({ error: "Invalid domain format" }, 400);
          return getAIAnalysis(body.domain, env);
        }

        // GET /api/health
        if (method === "GET" && path === "/api/health") {
          return json({ status: "ok", timestamp: new Date().toISOString() });
        }

        // GET /api/docs — handled by combined worker (serveSPA), but provide JSON fallback here
        if (method === "GET" && path === "/api/docs") {
          return json({
            name: "Yoke Domain Intelligence API",
            version: "1.0",
            endpoints: {
              "GET /{domain}": "Full domain analysis (content negotiation: JSON for curl/API clients, HTML for browsers)",
              "POST /api/analyze": "Full domain analysis (JSON body: {domain: string})",
              "POST /api/subdomains": "Subdomain enumeration (JSON body: {domain: string})",
              "POST /api/company": "Company/business info (JSON body: {domain: string})",
              "POST /api/news": "News articles (JSON body: {domain: string})",
              "POST /api/social": "Social accounts (JSON body: {domain: string})",
              "POST /api/suggestions": "Domain suggestions (JSON body: {domain: string})",
              "POST /api/availability": "Global availability check (JSON body: {domain: string})",
              "POST /api/reverse-ip": "Reverse IP lookup (JSON body: {ip: string})",
              "POST /api/ai-analysis": "AI-powered domain analysis (JSON body: {domain: string})",
              "GET /api/recent": "Recent lookups (query: ?limit=N)",
              "GET /api/health": "Health check",
            },
            examples: {
              curl_simple: "curl yoke.lol/stripe.com",
              curl_pretty: "curl 'yoke.lol/stripe.com?pretty' | less",
              curl_jq: "curl -s yoke.lol/stripe.com | jq '.ssl'",
              curl_post: "curl -X POST yoke.lol/api/analyze -H 'Content-Type: application/json' -d '{\"domain\":\"stripe.com\"}'",
            },
            source: "https://yoke.lol",
          });
        }

        return json({ error: "Not found" }, 404);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Internal server error";
        return json({ error: msg }, 500);
      }
    }

    // For non-API routes, Cloudflare Assets will serve static files automatically
    // (configured in wrangler.toml [assets] directory)
    // This fallback only fires if no static asset matched
    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
