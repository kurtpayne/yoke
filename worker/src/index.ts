// Minimal Cloudflare Worker router — no external dependencies
// Replaces Hono with a tiny hand-rolled router for zero-dependency deployment

import { analyzeDomain } from "./actions/analyze";
import { analyzeDomainStream } from "./actions/analyze-stream";
import { compareDomains } from "./actions/compare";
import { checkGlobalAvailability } from "./actions/availability";
import { getRecentLookups } from "./actions/recent";
import { getSubdomains } from "./actions/subdomains";
import { scanSubdomains } from "./actions/subdomain-scan";
import { getApiHealth } from "./api-errors";
import { renderStatusPage } from "./status-page";
import { ALL_THRESHOLDS, SEVERITY_SCORES } from "./config/scoring-thresholds";
import { getCompanyInfo } from "./actions/company";
import { getNews } from "./actions/news";
import { getSocialAccounts } from "./actions/social";
import { getReverseIP } from "./actions/reverse-ip";
import { getDomainSuggestions } from "./actions/suggestions";
import { getAIAnalysis } from "./actions/ai-analysis";
import { trackUsage, getUsageStats } from "./usage-tracking";
import { renderUsagePage } from "./usage-page";

interface Env {
  DB: D1Database;
  STATS_DB: D1Database;
  OPENROUTER_API_KEY?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  GOOGLE_PAGESPEED_API_KEY?: string;
  WHOISFREAKS_API_KEY?: string;
  ADMIN_KEY?: string;
}

import { CORS_HEADERS, normalizeDomain } from "./helpers";

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

/** Constant-time string comparison to prevent timing side-channels. */
function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Verify admin Basic auth. Returns null if valid, or a Response to return if invalid. */
function checkAdminAuth(request: Request, adminKey: string | undefined): Response | null {
  if (!adminKey) return new Response("Admin key not configured", { status: 503 });
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Basic ")) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Yoke Admin"', ...CORS_HEADERS },
    });
  }
  let pass: string;
  try {
    const decoded = atob(authHeader.slice(6));
    [, pass] = decoded.split(":");
  } catch {
    return new Response("Malformed credentials", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Yoke Admin"', ...CORS_HEADERS },
    });
  }
  if (!pass || !timingSafeEq(pass, adminKey)) {
    return new Response("Invalid credentials", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Yoke Admin"', ...CORS_HEADERS },
    });
  }
  return null; // auth passed
}

/** Normalize and validate a domain string. Returns the cleaned domain or null if invalid. */
function cleanDomain(raw: string): string | null {
  const d = normalizeDomain(raw);
  return isValidDomain(d) ? d : null;
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

    // Static content routes (SEO + LLMO)
    if (method === "GET" && path === "/robots.txt") {
      return new Response(
        "User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://yoke.lol/sitemap.xml",
        { headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=86400", ...CORS_HEADERS } }
      );
    }

    if (method === "GET" && path === "/sitemap.xml") {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://yoke.lol</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n  <url><loc>https://yoke.lol/api/docs</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n  <url><loc>https://yoke.lol/status</loc><changefreq>hourly</changefreq><priority>0.5</priority></url>\n  <url><loc>https://yoke.lol/privacy</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>\n  <url><loc>https://yoke.lol/terms</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>\n</urlset>`,
        { headers: { "Content-Type": "application/xml;charset=UTF-8", "Cache-Control": "public, max-age=86400", ...CORS_HEADERS } }
      );
    }

    if (method === "GET" && path === "/llms.txt") {
      return new Response(
        `# Yoke — Free Domain Intelligence & OSINT Tool\n\n> Yoke is a free, open-source domain intelligence tool at https://yoke.lol\n\n## What Yoke Does\n\nYoke provides instant, comprehensive analysis of any internet domain. Enter a domain name and get detailed intelligence across security, infrastructure, technology, performance, and business dimensions.\n\n## Key Capabilities\n\n- DNS Analysis: A, AAAA, MX, NS, TXT, CNAME, SOA records with DNSSEC validation\n- SSL/TLS: Certificate details, chain validation, SSL Labs grading, CAA records\n- WHOIS/RDAP: Registrar, registration and expiry dates, domain age\n- Security Audit: HTTP security headers, Mozilla Observatory scoring, cookie security\n- Data Breaches: HIBP breach detection\n- Threat Intelligence: Shodan port/vulnerability data, GreyNoise IP classification\n- Technology Detection: Frameworks, CMS, CDN, WAF, deep WordPress fingerprinting\n- Email Authentication: SPF, DKIM, DMARC validation\n- Performance: Google PageSpeed, Core Web Vitals, compression\n- Certificate Transparency: CT log monitoring for subdomain discovery\n- Business Intelligence: Company enrichment via Wikidata, Brandfetch, Crunchbase\n- AI Analysis: LLM-powered analysis from 6 expert personas\n\n## Free JSON API\n\nNo authentication required.\n\ncurl yoke.lol/stripe.com | jq\ncurl "yoke.lol/stripe.com?pretty"\ncurl -s yoke.lol/stripe.com | jq '.ssl'\n\n## Links\n\n- Web UI: https://yoke.lol\n- API Docs: https://yoke.lol/api/docs\n- Chrome Extension: Chrome Web Store\n- Source: https://github.com/kurtpayne/yoke\n- License: MIT`,
        { headers: { "Content-Type": "text/plain;charset=UTF-8", "Cache-Control": "public, max-age=86400", ...CORS_HEADERS } }
      );
    }

    // Status page — server-rendered, public
    if (method === "GET" && path === "/status") {
      return renderStatusPage(env.DB);
    }

    // Usage dashboard — admin-only, basic auth with ADMIN_KEY secret
    if (path === "/usage" || path === "/api/usage") {
      const authErr = checkAdminAuth(request, env.ADMIN_KEY);
      if (authErr) return authErr;
      const days = parseInt(url.searchParams.get("days") ?? "30");
      const stats = await getUsageStats(env.STATS_DB, days);
      if (path === "/api/usage") return json(stats);
      return renderUsagePage(env.STATS_DB, days);
    }

    // API routes
    if (path.startsWith("/api/")) {
      try {
        // POST /api/analyze
        if (method === "POST" && path === "/api/analyze") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain || typeof body.domain !== "string") return json({ error: "domain is required" }, 400);
          const domain = cleanDomain(body.domain);
          if (!domain) return json({ error: "Invalid domain format" }, 400);
          await trackUsage(env.STATS_DB, "analyze");
          // Support SSE streaming when client requests it
          const wantsStream = request.headers.get("Accept") === "text/event-stream";
          if (wantsStream) return analyzeDomainStream(domain, env);
          return analyzeDomain(domain, env);
        }

        // POST /api/compare
        if (method === "POST" && path === "/api/compare") {
          const body = await parseBody<{ domain1?: string; domain2?: string }>(request);
          if (!body.domain1 || !body.domain2) return json({ error: "domain1 and domain2 are required" }, 400);
          const d1 = cleanDomain(body.domain1);
          const d2 = cleanDomain(body.domain2);
          if (!d1 || !d2) return json({ error: "Invalid domain format" }, 400);
          await trackUsage(env.STATS_DB, "compare");
          return compareDomains({ domain1: d1, domain2: d2 }, env);
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
          const domain = cleanDomain(body.domain);
          if (!domain) return json({ error: "Invalid domain format" }, 400);
          const result = await getSubdomains(env.DB, domain);
          await trackUsage(env.STATS_DB, "subdomains");
          return json(result);
        }

        // POST /api/subdomain-scan
        if (method === "POST" && path === "/api/subdomain-scan") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain) return json({ error: "domain is required" }, 400);
          const domain = cleanDomain(body.domain);
          if (!domain) return json({ error: "Invalid domain format" }, 400);
          const result = await scanSubdomains(env.DB, domain);
          await trackUsage(env.STATS_DB, "subdomain-scan");
          return json(result);
        }

        // POST /api/company
        if (method === "POST" && path === "/api/company") {
          const body = await parseBody<{ domain?: string; force?: boolean }>(request);
          if (!body.domain) return json({ error: "domain is required" }, 400);
          const domain = cleanDomain(body.domain);
          if (!domain) return json({ error: "Invalid domain format" }, 400);
          const result = await getCompanyInfo(env.DB, domain, body.force);
          await trackUsage(env.STATS_DB, "company");
          return json(result);
        }

        // POST /api/news
        if (method === "POST" && path === "/api/news") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain) return json({ error: "domain is required" }, 400);
          const domain = cleanDomain(body.domain);
          if (!domain) return json({ error: "Invalid domain format" }, 400);
          const result = await getNews(env.DB, domain);
          await trackUsage(env.STATS_DB, "news");
          return json(result);
        }

        // POST /api/social
        if (method === "POST" && path === "/api/social") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain) return json({ error: "domain is required" }, 400);
          const domain = cleanDomain(body.domain);
          if (!domain) return json({ error: "Invalid domain format" }, 400);
          const result = await getSocialAccounts(env.DB, domain);
          await trackUsage(env.STATS_DB, "social");
          return json(result);
        }

        // POST /api/reverse-ip
        if (method === "POST" && path === "/api/reverse-ip") {
          const body = await parseBody<{ ip?: string }>(request);
          if (!body.ip) return json({ error: "ip is required" }, 400);
          const result = await getReverseIP(env.DB, body.ip);
          await trackUsage(env.STATS_DB, "reverse-ip");
          return json(result);
        }

        // POST /api/availability
        if (method === "POST" && path === "/api/availability") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain) return json({ error: "domain is required" }, 400);
          const domain = cleanDomain(body.domain);
          if (!domain) return json({ error: "Invalid domain format" }, 400);
          const cfColo = (request as any).cf?.colo as string | undefined;
          const cfCountry = (request as any).cf?.country as string | undefined;
          const cfCity = (request as any).cf?.city as string | undefined;
          const result = await checkGlobalAvailability(domain, { colo: cfColo, country: cfCountry, city: cfCity });
          await trackUsage(env.STATS_DB, "availability");
          return json(result);
        }

        // POST /api/suggestions
        if (method === "POST" && path === "/api/suggestions") {
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain) return json({ error: "domain is required" }, 400);
          const result = await getDomainSuggestions(body.domain, env);
          await trackUsage(env.STATS_DB, "suggestions");
          return json(result);
        }

        // POST /api/ai-analysis — restricted to web/extension only (cost control)
        if (method === "POST" && path === "/api/ai-analysis") {
          const referer = request.headers.get("referer") || "";
          const origin = request.headers.get("origin") || "";
          const isWebUI = referer.includes("yoke.lol") || origin.includes("yoke.lol") || origin.includes("chrome-extension://");
          if (!isWebUI) return json({ error: "AI analysis is only available via the web UI and Chrome extension" }, 403);
          await trackUsage(env.STATS_DB, "ai-analysis");
          const body = await parseBody<{ domain?: string }>(request);
          if (!body.domain || typeof body.domain !== "string") return json({ error: "domain is required" }, 400);
          const domain = cleanDomain(body.domain);
          if (!domain) return json({ error: "Invalid domain format" }, 400);
          return getAIAnalysis(domain, env);
        }

        // GET /api/health — API error observability dashboard
        if (method === "GET" && path === "/api/health") {
          const health = await getApiHealth(env.DB);
          return json(health);
        }

        // GET /api/scoring — transparent scoring methodology
        if (method === "GET" && path === "/api/scoring") {
          return json({
            description: "Yoke domain scoring methodology. All thresholds, weights, and severity mappings used to calculate the 5-axis composite score.",
            severity_scores: SEVERITY_SCORES,
            thresholds: ALL_THRESHOLDS,
            archetype_note: "Axis weights vary by detected site archetype (commerce, content, application, corporate, infrastructure, institutional, general). See archetype field in analysis response.",
          }, 200);
        }

        // DELETE /api/cache/:domain — purge cached analysis for a domain (admin-only)
        if (method === "DELETE" && path.startsWith("/api/cache/")) {
          const authErr = checkAdminAuth(request, env.ADMIN_KEY);
          if (authErr) return authErr;
          const domain = cleanDomain(path.replace("/api/cache/", ""));
          if (!domain) return json({ error: "Invalid domain" }, 400);
          try {
            await env.DB.prepare("DELETE FROM domain_cache WHERE domain = ?").bind(domain).run();
            return json({ ok: true, domain, message: "Cache cleared" });
          } catch (e) {
            return json({ error: "Failed to clear cache" }, 500);
          }
        }

        // GET /api/docs — handled by combined worker (serveSPA), but provide JSON fallback here
        if (method === "GET" && path === "/api/docs") {
          return json({
            name: "Yoke Domain Intelligence API",
            version: "1.0",
            endpoints: {
              "GET /{domain}": "Full domain analysis (content negotiation: JSON for curl/API clients, HTML for browsers)",
              "POST /api/analyze": "Full domain analysis (JSON body: {domain: string})",
              "POST /api/compare": "Compare two domains side-by-side (JSON body: {domain1: string, domain2: string})",
              "POST /api/subdomains": "Subdomain enumeration (JSON body: {domain: string})",
              "POST /api/company": "Company/business info (JSON body: {domain: string})",
              "POST /api/news": "News articles (JSON body: {domain: string})",
              "POST /api/social": "Social accounts (JSON body: {domain: string})",
              "POST /api/suggestions": "Domain suggestions (JSON body: {domain: string})",
              "POST /api/availability": "Global availability check (JSON body: {domain: string})",
              "POST /api/reverse-ip": "Reverse IP lookup (JSON body: {ip: string})",
              // AI analysis not listed — restricted to web/extension only
              "GET /api/recent": "Recent lookups (query: ?limit=N)",
              "GET /api/health": "Health check",
              "GET /api/scoring": "Scoring methodology — all thresholds, weights, and severity bands",
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
        // Return 400 for JSON parse errors (malformed request body)
        const status = (err instanceof SyntaxError) ? 400 : 500;
        return json({ error: msg }, status);
      }
    }

    // For non-API routes, Cloudflare Assets will serve static files automatically
    // (configured in wrangler.toml [assets] directory)
    // This fallback only fires if no static asset matched
    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};
