import { fetchWithTimeout, boundedText } from "../../helpers";
import { fingerprints } from "../../fingerprints";
import type { SecurityHeaderCheck, TechItem, HttpAnalysis, MetaResult, RedirectHop } from "./types";

// Build-time globals injected by build_combined.py — available in the combined worker scope
declare const __HTML__: string;
declare const __ROBOTS_TXT__: string;
declare const __SITEMAP_XML__: string;
declare const SECURITY_HEADERS: Record<string, string>;

// ─── HTTP Fetch + Headers + Tech + Meta ──────────────────────────────

export function auditSecurityHeaders(headers: Record<string, string>): { audit: SecurityHeaderCheck[]; grade: string } {
  const checks: SecurityHeaderCheck[] = [];
  const headerDefs = [
    { name: "Strict-Transport-Security", key: "strict-transport-security", important: true, recommend: "Add HSTS header with max-age of at least 31536000" },
    { name: "Content-Security-Policy", key: "content-security-policy", important: true, recommend: "Implement CSP to prevent XSS and injection attacks" },
    { name: "X-Content-Type-Options", key: "x-content-type-options", important: true, recommend: 'Set to "nosniff" to prevent MIME-type sniffing' },
    { name: "X-Frame-Options", key: "x-frame-options", important: true, recommend: 'Set to "DENY" or "SAMEORIGIN" to prevent clickjacking' },
    { name: "Referrer-Policy", key: "referrer-policy", important: false, recommend: 'Set to "strict-origin-when-cross-origin" or stricter' },
    { name: "Permissions-Policy", key: "permissions-policy", important: false, recommend: "Restrict browser features with Permissions-Policy" },
    { name: "X-XSS-Protection", key: "x-xss-protection", important: false, recommend: "Legacy header; modern CSP is preferred" },
    { name: "Cross-Origin-Opener-Policy", key: "cross-origin-opener-policy", important: false, recommend: 'Set to "same-origin" for cross-origin isolation' },
    { name: "Cross-Origin-Resource-Policy", key: "cross-origin-resource-policy", important: false, recommend: 'Set to "same-origin" to prevent resource leaks' },
  ];

  let score = 0;
  let maxScore = 0;
  for (const def of headerDefs) {
    const weight = def.important ? 15 : 5;
    maxScore += weight;
    const val = headers[def.key] ?? null;
    if (val) { checks.push({ header: def.name, status: "pass", value: val, recommendation: null }); score += weight; }
    else { checks.push({ header: def.name, status: def.important ? "fail" : "warning", value: null, recommendation: def.recommend }); }
  }

  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const grade = pct >= 90 ? "A" : pct >= 75 ? "B" : pct >= 55 ? "C" : pct >= 35 ? "D" : "F";
  return { audit: checks, grade };
}

export function detectTechStack(headers: Record<string, string>, html: string): TechItem[] {
  const found: TechItem[] = [];
  const seenNames = new Set<string>();

  for (const fp of fingerprints) {
    let matched = false;
    let version: string | null = null;
    let confidenceScore = 0;

    if (fp.patterns.headers) {
      for (const [key, regex] of Object.entries(fp.patterns.headers)) {
        const val = headers[key];
        if (val && regex.test(val)) { matched = true; confidenceScore += 3; }
      }
    }
    if (fp.patterns.meta) {
      for (const [, regex] of Object.entries(fp.patterns.meta)) {
        const metaMatch = html.match(/<meta[^>]+(?:name|property)=["']generator["'][^>]+content=["']([^"']+)["']/i);
        if (metaMatch?.[1] && regex.test(metaMatch[1])) { matched = true; confidenceScore += 3; }
      }
    }
    if (fp.patterns.scriptUrls) {
      for (const regex of fp.patterns.scriptUrls) {
        if (regex.test(html)) { matched = true; confidenceScore += 2; }
      }
    }
    if (fp.patterns.cssUrls) {
      for (const regex of fp.patterns.cssUrls) {
        if (regex.test(html)) { matched = true; confidenceScore += 1; }
      }
    }
    if (fp.patterns.htmlPatterns) {
      for (const regex of fp.patterns.htmlPatterns) {
        if (regex.test(html)) { matched = true; confidenceScore += 2; }
      }
    }

    if (matched && !seenNames.has(fp.name)) {
      seenNames.add(fp.name);
      if (fp.versionExtract) {
        if (fp.versionExtract.source === "meta") {
          const metaMatch = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*>/gi);
          if (metaMatch) {
            for (const m of metaMatch) {
              const vMatch = m.match(fp.versionExtract.pattern);
              if (vMatch?.[1]) { version = vMatch[1]; break; }
            }
          }
        } else if (fp.versionExtract.source === "header") {
          for (const val of Object.values(headers)) {
            const vMatch = val.match(fp.versionExtract.pattern);
            if (vMatch?.[1]) { version = vMatch[1]; break; }
          }
        } else if (fp.versionExtract.source === "script") {
          const vMatch = html.match(fp.versionExtract.pattern);
          if (vMatch?.[1]) version = vMatch[1];
        }
      }
      found.push({
        category: fp.category, name: fp.name, version,
        confidence: confidenceScore >= 5 ? "high" : confidenceScore >= 2 ? "medium" : "low",
      });
    }
  }
  return found;
}

export async function analyzeHttp(domain: string): Promise<HttpAnalysis | null> {
  // ─── Self-analysis bypass ────────────────────────────────────────────
  // CF Workers can't fetch their own domain (recursive request protection).
  // We have __HTML__ and SECURITY_HEADERS embedded at build time, so synthesize
  // the HTTP analysis directly from the known response.
  if (domain === "yoke.lol" && typeof __HTML__ !== "undefined") {
    const selfHeaders: Record<string, string> = {
      ...(typeof SECURITY_HEADERS !== "undefined" ? Object.fromEntries(Object.entries(SECURITY_HEADERS).map(([k, v]) => [k.toLowerCase(), v])) : {}),
      "content-type": "text/html;charset=utf-8",
      "cache-control": "public, max-age=300",
      "server": "cloudflare",
      "vary": "Accept-Encoding",
      "content-encoding": "br",
      "alt-svc": "h3=\":443\"; ma=86400",
      "cf-ray": "self-analysis",
    };
    const html = __HTML__;
    const { audit, grade } = auditSecurityHeaders(selfHeaders);
    const techStack = detectTechStack(selfHeaders, html);
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ?? null;
    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1] ?? null;
    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ?? null;
    let faviconUrl = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
    if (faviconUrl && !faviconUrl.startsWith("http")) faviconUrl = new URL(faviconUrl, "https://yoke.lol").href;
    return {
      redirects: [{ url: "https://yoke.lol", status_code: 200, server: "cloudflare", response_time_ms: 1 }],
      headers: { raw: selfHeaders, security_audit: audit, security_grade: grade },
      tech_stack: techStack,
      meta: { robots_txt: null, robots_txt_exists: false, sitemap_detected: false, sitemap_url: null, sitemap_page_count: null, og_title: ogTitle, og_description: ogDesc, og_image: ogImage, favicon_url: faviconUrl },
      final_url: "https://yoke.lol", html, status_code: 200, response_time_ms: 1,
    };
  }

  const redirects: RedirectHop[] = [];
  let currentUrl = `https://${domain}`;
  let finalHeaders: Record<string, string> = {};
  let html = "";
  let finalStatusCode = 0;
  let totalTime = 0;

  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(currentUrl, {
        redirect: "manual", timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      });
      const elapsed = Date.now() - start;
      totalTime += elapsed;
      redirects.push({ url: currentUrl, status_code: res.status, server: res.headers.get("server"), response_time_ms: elapsed });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (location) { currentUrl = location.startsWith("http") ? location : new URL(location, currentUrl).href; continue; }
      }
      finalStatusCode = res.status;
      finalHeaders = {};
      res.headers.forEach((v, k) => { finalHeaders[k.toLowerCase()] = v; });
      try { html = await boundedText(res); } catch { html = ""; }
      break;
    } catch {
      if (i === 0 && currentUrl.startsWith("https://")) { currentUrl = `http://${domain}`; continue; }
      break;
    }
  }

  if (redirects.length === 0) return null;

  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ?? null;
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1] ?? null;
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ?? null;
  let faviconUrl = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
  if (faviconUrl && !faviconUrl.startsWith("http")) faviconUrl = new URL(faviconUrl, `https://${domain}`).href;

  const { audit, grade } = auditSecurityHeaders(finalHeaders);
  const techStack = detectTechStack(finalHeaders, html);

  return {
    redirects, headers: { raw: finalHeaders, security_audit: audit, security_grade: grade },
    tech_stack: techStack,
    meta: { robots_txt: null, robots_txt_exists: false, sitemap_detected: false, sitemap_url: null, sitemap_page_count: null, og_title: ogTitle, og_description: ogDesc, og_image: ogImage, favicon_url: faviconUrl },
    final_url: currentUrl, html, status_code: finalStatusCode, response_time_ms: totalTime,
  };
}

// ─── Robots & Sitemap ────────────────────────────────────────────────

export async function checkRobotsSitemap(domain: string): Promise<Pick<MetaResult, "robots_txt" | "robots_txt_exists" | "sitemap_detected" | "sitemap_url" | "sitemap_page_count">> {
  // Self-analysis bypass for robots/sitemap (CF Workers can't fetch their own domain)
  if (domain === "yoke.lol" && typeof __ROBOTS_TXT__ !== "undefined") {
    const robotsTxt = __ROBOTS_TXT__.replace(/\\n/g, "\n");
    const hasSitemap = typeof __SITEMAP_XML__ !== "undefined";
    const sitemapXml = hasSitemap ? __SITEMAP_XML__ : "";
    const urlMatches = sitemapXml.match(/<url>/gi);
    return {
      robots_txt: robotsTxt.slice(0, 2000), robots_txt_exists: true,
      sitemap_detected: hasSitemap, sitemap_url: hasSitemap ? "https://yoke.lol/sitemap.xml" : null,
      sitemap_page_count: urlMatches ? urlMatches.length : null,
    };
  }

  const result = { robots_txt: null as string | null, robots_txt_exists: false, sitemap_detected: false, sitemap_url: null as string | null, sitemap_page_count: null as number | null };
  try {
    const res = await fetchWithTimeout(`https://${domain}/robots.txt`, { timeout: 5000 });
    if (res.ok) { const text = await boundedText(res); const lower = text.toLowerCase(); if (text && !lower.includes("<!doctype") && !lower.includes("<html")) { result.robots_txt = text.slice(0, 2000); result.robots_txt_exists = true; } }
  } catch { /* ignore */ }
  try {
    const res = await fetchWithTimeout(`https://${domain}/sitemap.xml`, { timeout: 5000 });
    if (res.ok) {
      const text = await boundedText(res);
      if (text.includes("<urlset") || text.includes("<sitemapindex")) {
        result.sitemap_detected = true; result.sitemap_url = `https://${domain}/sitemap.xml`;
        const urlMatches = text.match(/<url>/gi); const sitemapMatches = text.match(/<sitemap>/gi);
        if (urlMatches) result.sitemap_page_count = urlMatches.length;
        else if (sitemapMatches) result.sitemap_page_count = sitemapMatches.length;
      }
    }
  } catch { /* ignore */ }
  return result;
}
