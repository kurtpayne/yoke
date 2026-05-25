// ─── Domain Analysis Orchestrator ────────────────────────────────────
// This file coordinates all analysis modules. Individual checks are in
// the ./analyze/ directory, split by domain (dns, http, network, etc.).

import { type Env, normalizeDomain, fetchWithTimeout, CORS_HEADERS, maybePruneCache } from "../helpers";
import { ANALYSIS_CACHE_TTL_MS } from "../config/cache";
import { analyzeWordPress, type WordPressDetails } from "./wordpress";
import { checkBreaches, type BreachResult } from "./breaches";

// Import all analysis modules
import type {
  DnsRecord, HttpAnalysis, MetaResult, IpInfo, BlocklistResult, SslResult,
  PerformanceResult, RdapResult, LlmsTxtResult, ShodanResult, DnssecResult,
  HostingResult, OgTwitterResult, LegalResult, CookieSecurityResult,
  CompressionResult, AiReadinessResult, HealthScoreResult, RobotsParsed,
  JsonLdItem, CertTransparencyResult, SecurityTxtResult, GreenHostingResult,
  WellKnownResult, CaaDisplayResult, GreynoiseResult, EmailAuthResult,
} from "./analyze/types";

import { checkDns, isSubdomain, checkRdap } from "./analyze/dns";
import { auditSecurityHeaders, detectTechStack, analyzeHttp, checkRobotsSitemap } from "./analyze/http";
import { checkIpInfo, checkBlocklists, checkSsl, checkStatus, checkShodan, checkDnssec } from "./analyze/network";
import { checkPageSpeed, detectCompression, checkCarbon } from "./analyze/performance";
import { isActuallyCloudflare, sanitizeCfHeaders, detectHosting, auditCookies } from "./analyze/security";
import {
  checkLlmsTxt, checkWayback, checkTranco, checkObservatory,
  checkEmailAuth, parseRobotsDeep, detectHttpProtocols, extractJsonLd,
  extractSocialMeta, detectLegalPages, calculateAiReadiness,
} from "./analyze/content";
import { calculateHealthScore, getScreenshotUrl } from "./analyze/scoring";
import { calculateDomainScore } from "./analyze/contextual-scoring";
import { validateStructuredData } from "./analyze/structured-data";
import { analyzeAccessibility } from "./analyze/accessibility";
import { analyzeThirdPartyScripts } from "./analyze/third-party-scripts";
import { analyzeCookieConsent } from "./analyze/cookie-consent";
import {
  checkCertTransparency, checkSecurityTxt, checkGreenHosting,
  checkWellKnownEndpoints, analyzeCaaRecords, checkGreynoise,
} from "./analyze/tier1";

export async function analyzeDomain(domain: string, env: Env): Promise<Response> {
  domain = normalizeDomain(domain);
  if (!domain || !domain.includes(".")) {
    return new Response(JSON.stringify({ error: "Invalid domain" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  // Check cache
  try {
    const cached = await env.DB.prepare("SELECT data_json, cached_at FROM domain_cache WHERE domain = ? AND cache_type = 'analysis' ORDER BY cached_at DESC LIMIT 1").bind(domain).first<{ data_json: string; cached_at: number }>();
    if (cached && Date.now() - cached.cached_at < ANALYSIS_CACHE_TTL_MS) {
      const parsed = JSON.parse(cached.data_json);
      return new Response(JSON.stringify({ ...parsed, cached: true }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  } catch { /* cache miss */ }

  // Phase 0: Quick DNS resolution check — detect non-existent domains early
  let dnsRecords: DnsRecord[];
  let httpAnalysis: HttpAnalysis | null;

  try {
    const quickDns = await fetchWithTimeout(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
      { timeout: 5000 },
    );
    const quickData = await quickDns.json() as { Status: number; Answer?: unknown[] };
    // Status 3 = NXDOMAIN (domain does not exist)
    if (quickData.Status === 3) {
      const notRegisteredResult = {
        domain,
        analyzed_at: new Date().toISOString(),
        cached: false,
        not_registered: true,
        status: { is_up: false, status_code: null, response_time_ms: null, error: "Domain not registered (NXDOMAIN)", status_label: "NOT REGISTERED" },
        dns: { records: [] },
        rdap: null,
        redirects: [],
        headers: null,
        tech_stack: null,
        meta: { robots_txt: null, robots_txt_exists: false, sitemap_detected: false, sitemap_url: null, sitemap_page_count: null, og_title: null, og_description: null, og_image: null, favicon_url: null },
        ip_info: null,
        blocklists: [],
        ssl: null,
        performance: null,
        llms_txt: null,
        wayback: null,
        tranco_rank: null,
        observatory: null,
        email_auth: null,
        carbon: null,
        robots_parsed: null,
        json_ld: [],
        http_protocols: null,
        screenshot_url: null,
        shodan: null,
        dnssec: null,
        hosting: null,
        social_meta: null,
        legal: null,
        cookie_security: null,
        compression: null,
        ai_readiness: null,
        health_score: { score: 0, max_score: 71, grade: "N/A", breakdown: {} },
        cert_transparency: null,
        security_txt: null,
        green_hosting: null,
        well_known: null,
        caa_analysis: null,
        greynoise: null,
        domain_score: null,
        structured_data: null,
        accessibility: null,
        third_party_scripts: null,
        cookie_consent: null,
      };
      // Cache it too
      try {
        await env.DB.prepare("INSERT INTO domain_cache (domain, cache_type, data_json, cached_at) VALUES (?, 'analysis', ?, ?)")
          .bind(domain, JSON.stringify(notRegisteredResult), Date.now()).run();
      } catch { /* ignore */ }
      return new Response(JSON.stringify(notRegisteredResult), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  } catch { /* DNS check failed, proceed with full analysis */ }

  // Phase 1: DNS + HTTP fetch in parallel (everything else depends on these)
  {
    const [dnsResult, httpResult] = await Promise.allSettled([
      checkDns(domain),
      analyzeHttp(domain),
    ]);
    dnsRecords = dnsResult.status === "fulfilled" ? dnsResult.value : [];
    httpAnalysis = httpResult.status === "fulfilled" ? httpResult.value : null;
  }

  // ─── C2/C3: Detect HTTP probe failures ─────────────────────────────
  // If the HTTP fetch returned a non-200 (502, 403, 503, etc.), the response
  // headers are from the error page (often Cloudflare's), not the actual site.
  // We must NOT use those for security/tech/CDN analysis.
  const httpStatusCode = httpAnalysis?.status_code ?? 0;
  const httpProbeSucceeded = httpStatusCode >= 200 && httpStatusCode < 400;
  const httpProbeBlocked = httpStatusCode === 403 || httpStatusCode === 502 || httpStatusCode === 503 || httpStatusCode === 530;

  // Only trust HTML + headers if we got a real response
  const html = httpProbeSucceeded ? (httpAnalysis?.html ?? "") : "";
  const rawHeadersOriginal = httpProbeSucceeded ? (httpAnalysis?.headers?.raw ?? null) : null;

  // Phase 2: Everything else in parallel (depends on DNS/HTTP results)
  const ip = dnsRecords.find((r) => r.type === "A")?.data;

  const phase2Results = await Promise.allSettled([
    checkRdap(domain, env),
    checkRobotsSitemap(domain),
    checkIpInfo(domain, dnsRecords),
    checkBlocklists(dnsRecords),
    checkSsl(domain),
    checkPageSpeed(domain, httpAnalysis?.response_time_ms ?? null, env.DB, env.GOOGLE_PAGESPEED_API_KEY),
    checkStatus(domain),
    checkLlmsTxt(domain),
    checkWayback(domain),
    checkTranco(domain),
    checkObservatory(domain),
    checkEmailAuth(domain, dnsRecords),
    checkCarbon(domain),
    ip ? checkShodan(ip) : Promise.resolve(null),
    checkDnssec(domain),
    checkBreaches(domain, env.DB),
    checkCertTransparency(domain),
    checkSecurityTxt(domain),
    checkGreenHosting(domain),
    checkWellKnownEndpoints(domain),
    ip ? checkGreynoise(ip) : Promise.resolve(null),
  ]);

  // Unwrap settled results — use null for any rejected promises
  const unwrap = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
    r.status === "fulfilled" ? r.value : fallback;

  const rdapResult = unwrap(phase2Results[0], null) as RdapResult | null;
  const robotsSitemap = unwrap(phase2Results[1], { robots_txt: null, robots_txt_exists: false, sitemap_detected: false, sitemap_url: null, sitemap_page_count: null }) as Pick<MetaResult, "robots_txt" | "robots_txt_exists" | "sitemap_detected" | "sitemap_url" | "sitemap_page_count">;
  const ipInfo = unwrap(phase2Results[2], null) as IpInfo | null;
  const blocklists = unwrap(phase2Results[3], []) as BlocklistResult[];
  const sslResult = unwrap(phase2Results[4], null) as SslResult | null;
  const pageSpeedResult = unwrap(phase2Results[5], { ttfb_ms: null, fcp_ms: null, lcp_ms: null, cls: null, tbt_ms: null, si_ms: null, performance_score: null, response_time_ms: null } as any) as PerformanceResult;
  const statusResult = unwrap(phase2Results[6], { is_up: false, status_code: null, response_time_ms: null, error: "Phase 2 promise rejected", status_label: "error", http_blocked: false }) as { is_up: boolean; status_code: number | null; response_time_ms: number | null; error: string | null; status_label: string; http_blocked: boolean };
  const llmsTxt = unwrap(phase2Results[7], { exists: false, url: null, size_bytes: null, title: null, summary: null, sections: [] } as any) as LlmsTxtResult;
  const wayback = unwrap(phase2Results[8], null) as Awaited<ReturnType<typeof checkWayback>>;
  const tranco = unwrap(phase2Results[9], null) as number | null;
  const observatory = unwrap(phase2Results[10], null) as Awaited<ReturnType<typeof checkObservatory>>;
  const emailAuth = unwrap(phase2Results[11], { spf: null, dmarc: null, dkim_selector: null, has_mx: false, mx_records: [], dkim_found: false } as any) as EmailAuthResult;
  const carbon = unwrap(phase2Results[12], null) as Awaited<ReturnType<typeof checkCarbon>>;
  const shodanResult = unwrap(phase2Results[13], null) as ShodanResult | null;
  const dnssecResult = unwrap(phase2Results[14], { enabled: false, valid: null, ds_records: [], dnskey_records: [], nsec_type: null, algorithm: null } as any) as DnssecResult;
  const breachResult = unwrap(phase2Results[15], { found: false, count: 0, total_pwned: 0, items: [] }) as BreachResult;
  const certTransparency = unwrap(phase2Results[16], { certificates: [], total_found: 0 } as any) as CertTransparencyResult;
  const securityTxt = unwrap(phase2Results[17], { exists: false, url: null, contact: null, encryption: null, policy: null, acknowledgements: null, preferred_languages: null, canonical: null, expires: null, hiring: null } as any) as SecurityTxtResult;
  const greenHosting = unwrap(phase2Results[18], { green: null, hosted_by: null, supporting_documents: [] } as any) as GreenHostingResult;
  const wellKnown = unwrap(phase2Results[19], { change_password: null, security_txt: false, openid_configuration: null, apple_app_site_association: false, assetlinks_json: false, humans_txt: false, dnt_policy: false, nodeinfo: null } as any) as WellKnownResult;
  const greynoiseResult = unwrap(phase2Results[20], null) as GreynoiseResult | null;

  // Build merged meta — only use HTTP meta if probe succeeded
  const meta: MetaResult = {
    ...(robotsSitemap ?? { robots_txt: null, robots_txt_exists: false, sitemap_detected: false, sitemap_url: null, sitemap_page_count: null }),
    og_title: httpProbeSucceeded ? (httpAnalysis?.meta?.og_title ?? null) : null,
    og_description: httpProbeSucceeded ? (httpAnalysis?.meta?.og_description ?? null) : null,
    og_image: httpProbeSucceeded ? (httpAnalysis?.meta?.og_image ?? null) : null,
    favicon_url: httpProbeSucceeded ? (httpAnalysis?.meta?.favicon_url ?? null) : null,
  };

  // ─── C2/C3: Enhanced status with DNS-based fallback ─────────────────
  // If HTTP probe says DOWN but DNS resolves, the site is up but blocking us
  const dnsResolves = dnsRecords.some((r) => r.type === "A" || r.type === "AAAA");
  const sslValid = sslResult && !sslResult.error && sslResult.grade !== null;
  let enhancedStatus = { ...statusResult };

  // If analyzeHttp got a successful response, the site is definitively UP
  if (httpProbeSucceeded && httpAnalysis) {
    const finalCode = httpAnalysis.redirects?.[httpAnalysis.redirects.length - 1]?.status_code;
    if (finalCode && finalCode >= 200 && finalCode < 400) {
      enhancedStatus = {
        ...statusResult,
        is_up: true,
        status_code: finalCode,
        status_label: "UP",
        http_blocked: false,
        error: null,
      };
    }
  } else if (!statusResult.is_up && dnsResolves) {
    // DNS resolves but HTTP failed — site exists, just blocking our probe
    enhancedStatus = {
      ...statusResult,
      is_up: true,
      status_label: "RESTRICTED",
      http_blocked: true,
      error: sslValid
        ? "Site is online (DNS resolves, SSL valid) but blocked our HTTP probe"
        : "Site is online (DNS resolves) but blocked our HTTP probe",
    };
  } else if (statusResult.http_blocked && dnsResolves) {
    // Got a 403/502/503 — site is running but rejecting us
    enhancedStatus = {
      ...statusResult,
      is_up: true,
      status_label: "RESTRICTED",
      error: `Site returned HTTP ${statusResult.status_code} — blocking automated requests`,
    };
  }

  // Parse robots.txt deeply
  const robotsParsed = parseRobotsDeep(meta.robots_txt, meta.robots_txt_exists);

  // Extract JSON-LD
  const jsonLd = extractJsonLd(html);

  // ─── Refined CF check with ipInfo now available ───────────────────
  // Re-check with ASN data; if the site is NOT behind CF, use sanitized headers
  // for hosting/tech/security. Re-run security audit and tech stack if headers changed.
  const siteIsCloudflareRefined = isActuallyCloudflare(dnsRecords, ipInfo);
  const effectiveHeaders = (rawHeadersOriginal && !siteIsCloudflareRefined)
    ? sanitizeCfHeaders(rawHeadersOriginal)
    : rawHeadersOriginal;

  // Detect HTTP protocols (use effective headers to avoid CF alt-svc pollution)
  const httpProtocols = detectHttpProtocols(effectiveHeaders);

  // Re-run security audit + tech stack with cleaned headers if we sanitized
  let finalSecurityAudit = httpAnalysis?.headers?.security_audit ?? [];
  let finalSecurityGrade = httpAnalysis?.headers?.security_grade ?? "F";
  let finalTechStack = httpAnalysis?.tech_stack ?? [];

  // If HTTP was blocked, we have no real headers — don't score security or tech
  if (!httpProbeSucceeded) {
    finalSecurityAudit = [];
    finalSecurityGrade = "N/A";
    finalTechStack = [];
  } else if (effectiveHeaders && !siteIsCloudflareRefined && rawHeadersOriginal) {
    const { audit: cleanAudit, grade: cleanGrade } = auditSecurityHeaders(effectiveHeaders);
    finalSecurityAudit = cleanAudit;
    finalSecurityGrade = cleanGrade;
    finalTechStack = detectTechStack(effectiveHeaders, html);
  }

  // New computed checks — use effective (sanitized) headers
  const hosting = detectHosting(ipInfo, effectiveHeaders);

  // WordPress deep analysis
  const wpDetails = httpProbeSucceeded ? analyzeWordPress(html, effectiveHeaders ?? {}, dnsRecords) : null;
  
  // ISP fallback for hosting provider: if no provider detected but ISP is a known hosting company, use it
  if (!hosting.provider && ipInfo?.isp) {
    // Only use ISP as provider if it looks like a hosting/tech company (not a generic ISP)
    const hostingIsps = [
      { pattern: /github/i, name: "GitHub" },
      { pattern: /gitlab/i, name: "GitLab" },
      { pattern: /automattic/i, name: "Automattic (WordPress)" },
      { pattern: /shopify/i, name: "Shopify" },
      { pattern: /squarespace/i, name: "Squarespace" },
      { pattern: /wix/i, name: "Wix" },
      { pattern: /heroku|salesforce/i, name: "Heroku (Salesforce)" },
      { pattern: /rackspace/i, name: "Rackspace" },
      { pattern: /oracle.*cloud/i, name: "Oracle Cloud" },
      { pattern: /alibaba/i, name: "Alibaba Cloud" },
      { pattern: /tencent/i, name: "Tencent Cloud" },
      { pattern: /vultr/i, name: "Vultr" },
      { pattern: /linode/i, name: "Linode" },
      { pattern: /scaleway/i, name: "Scaleway" },
      { pattern: /dreamhost/i, name: "DreamHost" },
      { pattern: /bluehost/i, name: "Bluehost" },
      { pattern: /hostgator/i, name: "HostGator" },
      { pattern: /siteground/i, name: "SiteGround" },
      { pattern: /ionos/i, name: "IONOS" },
      { pattern: /netlify/i, name: "Netlify" },
      { pattern: /vercel/i, name: "Vercel" },
      { pattern: /fly\.io/i, name: "Fly.io" },
      { pattern: /render/i, name: "Render" },
      { pattern: /railway/i, name: "Railway" },
      { pattern: /notion/i, name: "Notion Labs" },
      { pattern: /stripe/i, name: "Stripe" },
      { pattern: /twitter|x corp/i, name: "X (Twitter)" },
      { pattern: /meta platform|facebook/i, name: "Meta Platforms" },
      { pattern: /apple/i, name: "Apple" },
      { pattern: /discord/i, name: "Discord" },
    ];
    for (const { pattern, name } of hostingIsps) {
      if (pattern.test(ipInfo.isp) || (ipInfo.org && pattern.test(ipInfo.org))) {
        hosting.provider = name;
        break;
      }
    }
  }
  
  const socialMeta = extractSocialMeta(html);
  const legal = detectLegalPages(html, domain);
  const cookieSecurity = auditCookies(effectiveHeaders);
  const compression = detectCompression(effectiveHeaders);
  const aiReadiness = calculateAiReadiness(llmsTxt, robotsParsed, jsonLd, html, socialMeta);
  const structuredDataValidation = validateStructuredData(jsonLd);

  // New feature modules — all synchronous, HTML-only
  const accessibilityResult = httpProbeSucceeded ? analyzeAccessibility(html) : null;
  const thirdPartyScriptsResult = httpProbeSucceeded ? analyzeThirdPartyScripts(html, domain) : null;
  const cookieConsentResult = httpProbeSucceeded
    ? analyzeCookieConsent(html, effectiveHeaders ?? {}, domain)
    : null;

  // Health score — use re-computed security grade
  // If HTTP was blocked, pass null for secGrade so we don't penalize for missing headers
  const listedCount = blocklists.filter((bl) => bl.listed).length;
  const domainIsSubdomain = isSubdomain(domain);
  const healthScore = calculateHealthScore({
    ssl: sslResult,
    secGrade: httpProbeSucceeded ? finalSecurityGrade : null,
    dnssec: dnssecResult,
    headers: httpProbeSucceeded ? effectiveHeaders : null,
    spf: emailAuth.spf.found,
    dmarcPolicy: emailAuth.dmarc.policy,
    dkim: emailAuth.dkim_selectors_found.length > 0,
    blocklistListedCount: listedCount,
    perfScore: pageSpeedResult?.score ?? null,
    legalPagesCount: legal.pages_found.length,
    ogScore: httpProbeSucceeded ? socialMeta.score : 0,
    statusCode: enhancedStatus?.status_code ?? null,
    finalUrl: httpAnalysis?.final_url ?? null,
    httpBlocked: !httpProbeSucceeded,
    isSubdomain: domainIsSubdomain,
  });

  // ─── Contextual Domain Score ──────────────────────────────────────
  const domainScore = calculateDomainScore({
    ssl: sslResult,
    securityGrade: httpProbeSucceeded ? finalSecurityGrade : null,
    securityAudit: finalSecurityAudit,
    dnssec: dnssecResult,
    blocklists,
    emailAuth,
    performance: pageSpeedResult,
    compression,
    httpProtocols,
    hosting,
    dnsRecords,
    rdap: rdapResult,
    socialMeta,
    jsonLd: jsonLd,
    meta,
    legal,
    wayback,
    certTransparency,
    greynoise: greynoiseResult,
    techStack: httpProbeSucceeded ? (finalTechStack.length > 0 ? finalTechStack : (httpAnalysis?.tech_stack ?? null)) : null,
    headers: httpProbeSucceeded ? effectiveHeaders : null,
    domain,
    html,
    httpBlocked: !httpProbeSucceeded,
    accessibility: accessibilityResult,
    thirdPartyScripts: thirdPartyScriptsResult,
    cookieConsent: cookieConsentResult,
  });

  const result = {
    domain,
    analyzed_at: new Date().toISOString(),
    cached: false,
    http_probe_blocked: !httpProbeSucceeded,
    is_subdomain: domainIsSubdomain,

    // Existing checks
    dns: { records: dnsRecords },
    rdap: rdapResult,
    status: enhancedStatus,
    redirects: httpProbeSucceeded ? (httpAnalysis?.redirects ?? []) : [],
    headers: httpProbeSucceeded && httpAnalysis ? {
      raw: effectiveHeaders ?? {},
      security_audit: finalSecurityAudit,
      security_grade: finalSecurityGrade,
    } : null,
    tech_stack: httpProbeSucceeded ? (finalTechStack.length > 0 ? finalTechStack : (httpAnalysis?.tech_stack ?? null)) : null,
    meta,
    ip_info: ipInfo,
    blocklists,
    ssl: sslResult,
    performance: pageSpeedResult,
    llms_txt: llmsTxt,
    wayback,
    tranco_rank: tranco,
    observatory,
    email_auth: emailAuth,
    carbon,
    robots_parsed: robotsParsed,
    json_ld: jsonLd,
    http_protocols: httpProtocols,
    screenshot_url: getScreenshotUrl(domain),

    // New checks
    shodan: shodanResult,
    dnssec: dnssecResult,
    hosting,
    social_meta: socialMeta,
    legal,
    cookie_security: cookieSecurity,
    compression,
    ai_readiness: aiReadiness,
    health_score: healthScore,
    wordpress: wpDetails,
    breaches: breachResult,
    cert_transparency: certTransparency,
    security_txt: securityTxt,
    green_hosting: greenHosting,
    well_known: wellKnown,
    caa_analysis: analyzeCaaRecords(dnsRecords),
    greynoise: greynoiseResult,
    domain_score: domainScore,
    structured_data: structuredDataValidation,
    accessibility: accessibilityResult,
    third_party_scripts: thirdPartyScriptsResult,
    cookie_consent: cookieConsentResult,
  };

  // ─── Historical Score Logging ───────────────────────────────────────
  // Store every computed score for trend analysis (store now, UI later)
  if (domainScore) {
    try {
      await env.DB.prepare(
        `INSERT INTO domain_scores (domain, composite_score, security_score, performance_score, reliability_score, trust_score, visibility_score, archetype, archetype_confidence, scored_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        domain,
        domainScore.composite,
        domainScore.axes.security.score,
        domainScore.axes.performance.score,
        domainScore.axes.reliability.score,
        domainScore.axes.trust.score,
        domainScore.axes.visibility.score,
        domainScore.archetype.detected,
        domainScore.archetype.confidence,
        new Date().toISOString(),
      ).run();
    } catch {
      // Table may not exist yet — auto-create on first failure
      try {
        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS domain_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            composite_score INTEGER NOT NULL,
            security_score INTEGER NOT NULL,
            performance_score INTEGER NOT NULL,
            reliability_score INTEGER NOT NULL,
            trust_score INTEGER NOT NULL,
            visibility_score INTEGER NOT NULL,
            archetype TEXT NOT NULL,
            archetype_confidence REAL NOT NULL,
            scored_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(domain, scored_at)
          )`
        ).run();
        await env.DB.prepare(
          `CREATE INDEX IF NOT EXISTS idx_domain_scores_domain ON domain_scores(domain)`
        ).run();
        await env.DB.prepare(
          `CREATE INDEX IF NOT EXISTS idx_domain_scores_scored_at ON domain_scores(scored_at)`
        ).run();
        // Retry the insert
        await env.DB.prepare(
          `INSERT INTO domain_scores (domain, composite_score, security_score, performance_score, reliability_score, trust_score, visibility_score, archetype, archetype_confidence, scored_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          domain,
          domainScore.composite,
          domainScore.axes.security.score,
          domainScore.axes.performance.score,
          domainScore.axes.reliability.score,
          domainScore.axes.trust.score,
          domainScore.axes.visibility.score,
          domainScore.archetype.detected,
          domainScore.archetype.confidence,
          new Date().toISOString(),
        ).run();
      } catch { /* auto-migration + retry failed — non-critical */ }
    }
  }

  // Cache result
  try {
    await env.DB.prepare("INSERT INTO domain_cache (domain, cache_type, data_json, cached_at) VALUES (?, 'analysis', ?, ?)")
      .bind(domain, JSON.stringify(result), Date.now())
      .run();
  } catch { /* cache write failure is non-critical */ }

  // Insert recent lookup
  try {
    await env.DB.prepare("INSERT INTO domain_lookups (domain, results_json, analyzed_at) VALUES (?, ?, ?)")
      .bind(domain, JSON.stringify(result), Date.now())
      .run();
  } catch { /* ignore */ }

  // Probabilistic cache cleanup to prevent unbounded D1 growth
  maybePruneCache(env.DB);

  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
