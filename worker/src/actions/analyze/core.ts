// ─── Core Domain Analysis Pipeline ──────────────────────────────────
// Single source of truth for all analysis logic.
// Both the JSON endpoint and the SSE streaming endpoint use this.

import { type Env, normalizeDomain, maybePruneCache, backgroundWork } from "../../helpers";
import { getAnalysisCacheTtlMs } from "../../config/cache";
import { analyzeWordPress } from "../wordpress";
import { checkBreaches, type BreachResult } from "../breaches";
import { logApiError, pruneApiErrors } from "../../api-errors";

import type {
  DnsRecord, HttpAnalysis, MetaResult, IpInfo, BlocklistResult, SslResult,
  PerformanceResult, RdapResult, LlmsTxtResult, ShodanResult, DnssecResult,
  HostingResult, CookieSecurityResult,
  CompressionResult, CertTransparencyResult, SecurityTxtResult, GreenHostingResult,
  WellKnownResult, GreynoiseResult, EmailAuthResult, CacheAnalysis,
  WafDetection, TrustSignals,
} from "./types";

import { checkDns, isSubdomain, checkRdap, dohQuery } from "./dns";
import { auditSecurityHeaders, detectTechStack, analyzeHttp, checkRobotsSitemap } from "./http";
import { checkIpInfo, checkBlocklists, checkSsl, checkStatus, checkShodan, checkDnssec } from "./network";
import { checkPageSpeed, detectCompression, checkCarbon } from "./performance";
import { checkCacheHeaders } from "./cache";
import { checkWaf } from "./waf";
import { checkTrustSignals } from "./trust";
import { isActuallyCloudflare, sanitizeCfHeaders, detectHosting, auditCookies } from "./security";
import {
  checkLlmsTxt, checkWayback, checkTranco, checkObservatory,
  checkEmailAuth, parseRobotsDeep, detectHttpProtocols, probeHttpProtocols, extractJsonLd,
  extractSocialMeta, detectLegalPages, calculateAiReadiness,
  checkAnsRecords,
} from "./content";
import { calculateHealthScore, getScreenshotUrl } from "./scoring";
import { calculateDomainScore } from "./contextual-scoring";
import { checkDnsPropagation, checkRipeRouting, checkOutagePages, checkConnectionTiming, type NetworkHealth } from "./network-health";
import { validateStructuredData } from "./structured-data";
import { analyzeAccessibility } from "./accessibility";
import { analyzeThirdPartyScripts } from "./third-party-scripts";
import { analyzeCookieConsent } from "./cookie-consent";
import {
  checkCertTransparency, checkSecurityTxt, checkGreenHosting,
  checkWellKnownEndpoints, analyzeCaaRecords, checkGreynoise,
} from "./tier1";

// ─── Types ───────────────────────────────────────────────────────────

/** Callbacks for streaming progress. All optional — non-streaming callers pass nothing. */
export interface AnalysisCallbacks {
  onPhase?: (phase: string, status: string, label: string, total?: number) => Promise<void>;
  onResult?: (key: string, value: unknown, completed?: number, total?: number, label?: string) => Promise<void>;
}

/** Shape of the status sub-object in results. */
interface StatusShape {
  is_up: boolean;
  status_code: number | null;
  response_time_ms: number | null;
  error: string | null;
  status_label: string;
  http_blocked?: boolean;
}

/** The full analysis result object. */
export interface AnalysisResult {
  domain: string;
  analyzed_at: string;
  cached: boolean;
  not_registered?: boolean;
  http_probe_blocked: boolean;
  is_subdomain: boolean;
  dns: { records: DnsRecord[] };
  rdap: RdapResult | null;
  status: {
    is_up: boolean;
    status_code: number | null;
    response_time_ms: number | null;
    error: string | null;
    status_label: string;
    http_blocked?: boolean;
  };
  redirects: Array<{ url: string; status_code: number; server: string | null; response_time_ms: number }>;
  headers: {
    raw: Record<string, string>;
    security_audit: Array<{ header: string; status: string; value: string | null; recommendation: string | null }>;
    security_grade: string;
  } | null;
  tech_stack: Array<{ category: string; name: string; version: string | null; confidence: string }> | null;
  meta: MetaResult;
  ip_info: IpInfo | null;
  blocklists: BlocklistResult[];
  ssl: SslResult | null;
  performance: PerformanceResult;
  llms_txt: LlmsTxtResult;
  wayback: unknown;
  tranco_rank: number | null;
  observatory: unknown;
  email_auth: EmailAuthResult;
  carbon: unknown;
  robots_parsed: unknown;
  json_ld: unknown[];
  http_protocols: { http2: boolean; http3: boolean; alt_svc?: string | null };
  screenshot_url: string;
  shodan: ShodanResult | null;
  dnssec: DnssecResult;
  hosting: HostingResult;
  social_meta: unknown;
  legal: unknown;
  cookie_security: CookieSecurityResult | null;
  compression: CompressionResult | null;
  cache_analysis: CacheAnalysis | null;
  waf: WafDetection | null;
  trust_signals: TrustSignals | null;
  ai_readiness: unknown;
  health_score: unknown;
  wordpress: unknown;
  breaches: BreachResult;
  cert_transparency: CertTransparencyResult;
  security_txt: SecurityTxtResult;
  green_hosting: GreenHostingResult;
  well_known: WellKnownResult;
  caa_analysis: unknown;
  greynoise: GreynoiseResult | null;
  domain_score: unknown;
  structured_data: unknown;
  accessibility: unknown;
  third_party_scripts: unknown;
  cookie_consent: unknown;
  [key: string]: unknown;
}

/** Cache lookup result. */
export interface CacheHit {
  kind: "cached";
  data: AnalysisResult;
}

/** NXDOMAIN result. */
export interface NxdomainResult {
  kind: "nxdomain";
  data: AnalysisResult;
}

/** Full analysis result. */
export interface AnalysisComplete {
  kind: "complete";
  data: AnalysisResult;
}

export type CoreResult = CacheHit | NxdomainResult | AnalysisComplete;

// ─── Not-registered template ─────────────────────────────────────────

function makeNxdomainResult(domain: string): AnalysisResult {
  return {
    domain,
    analyzed_at: new Date().toISOString(),
    cached: false,
    not_registered: true,
    http_probe_blocked: true,
    is_subdomain: false,
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
    performance: DEFAULT_PERFORMANCE,
    llms_txt: DEFAULT_LLMS_TXT,
    wayback: null,
    tranco_rank: null,
    observatory: null,
    email_auth: DEFAULT_EMAIL_AUTH,
    carbon: null,
    robots_parsed: null,
    json_ld: [],
    http_protocols: { http2: false, http3: false },
    screenshot_url: "",
    shodan: null,
    dnssec: DEFAULT_DNSSEC,
    hosting: { provider: null, cdn: null, waf: null } as HostingResult,
    social_meta: null,
    legal: null,
    cookie_security: null,
    compression: null,
    cache_analysis: null,
    waf: null,
    trust_signals: null,
    ai_readiness: null,
    health_score: { score: 0, max_score: 71, grade: "N/A", breakdown: {} },
    wordpress: null,
    breaches: DEFAULT_BREACH,
    cert_transparency: DEFAULT_CERT_TRANSPARENCY,
    security_txt: DEFAULT_SECURITY_TXT,
    green_hosting: DEFAULT_GREEN_HOSTING,
    well_known: DEFAULT_WELL_KNOWN,
    caa_analysis: null,
    greynoise: null,
    domain_score: null,
    structured_data: null,
    accessibility: null,
    third_party_scripts: null,
    cookie_consent: null,
  };
}

// ─── ISP → Hosting provider mapping ─────────────────────────────────

const HOSTING_ISPS = [
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
] as const;

// ─── Default fallback values for Phase 2 checks ─────────────────────

const DEFAULT_PERFORMANCE: PerformanceResult = { score: null, fcp: null, lcp: null, tbt: null, cls: null, si: null, ttfb: null, strategy: "mobile", error: null, screenshot: null };
const DEFAULT_STATUS: StatusShape = { is_up: false, status_code: null, response_time_ms: null, error: "Phase 2 promise rejected", status_label: "error", http_blocked: false };
const DEFAULT_LLMS_TXT: LlmsTxtResult = { found: false, content: null, full_found: false, full_content: null };
const DEFAULT_EMAIL_AUTH: EmailAuthResult = { spf: { found: false, record: null, mechanisms: [], all_qualifier: null }, dmarc: { found: false, record: null, policy: null, subdomain_policy: null, rua: null, ruf: null }, dkim_selectors_found: [], bimi: { found: false, record: null, logo_url: null, authority_url: null }, mta_sts: { dns_found: false, policy_found: false, mode: null }, tls_rpt: { found: false, record: null, rua: null } };
const DEFAULT_DNSSEC: DnssecResult = { enabled: false, has_dnskey: false, has_ds: false, validated: false };
const DEFAULT_BREACH: BreachResult = { found: false, count: 0, total_pwned: 0, items: [] };
const DEFAULT_CERT_TRANSPARENCY: CertTransparencyResult = { subdomains: [], total_certs: 0, has_wildcard: false, issuers: [], error: null };
const DEFAULT_SECURITY_TXT: SecurityTxtResult = { found: false, contact: [], encryption: null, acknowledgments: null, policy: null, hiring: null, canonical: null, preferred_languages: null, expires: null, is_expired: false, has_bug_bounty: false, bug_bounty_platform: null, raw: null };
const DEFAULT_GREEN_HOSTING: GreenHostingResult = { green: false, hosted_by: null, hosted_by_website: null, error: null };
const DEFAULT_WELL_KNOWN: WellKnownResult = { endpoints: [], pwa_ready: false, has_mobile_apps: false, ads_partner_count: null };

// ─── Core Analysis Pipeline ─────────────────────────────────────────

/**
 * Run the full domain analysis pipeline.
 *
 * @param domain   - Raw domain string (will be normalized)
 * @param env      - Cloudflare Worker environment bindings
 * @param skipCache - Force fresh analysis
 * @param callbacks - Optional streaming callbacks for progress reporting
 * @returns CoreResult with `kind` indicating cache hit, NXDOMAIN, or full analysis
 */
export async function runAnalysis(
  domain: string,
  env: Env,
  skipCache: boolean,
  callbacks?: AnalysisCallbacks,
): Promise<CoreResult> {
  domain = normalizeDomain(domain);
  if (!domain || !domain.includes(".")) {
    throw new Error("Invalid domain");
  }

  // Derive instance hostname for self-analysis bypass (CF Workers can't fetch themselves)
  let instanceHost: string | undefined;
  try { instanceHost = env.BASE_URL ? new URL(env.BASE_URL).hostname : undefined; } catch { /* ignore */ }

  const onPhase = callbacks?.onPhase ?? (async () => {});
  const onResult = callbacks?.onResult ?? (async () => {});

  // ── Cache check ──────────────────────────────────────────────────
  if (!skipCache) {
    try {
      const cached = await env.DB.prepare(
        "SELECT data_json, cached_at FROM domain_cache WHERE domain = ? AND cache_type = 'analysis' ORDER BY cached_at DESC LIMIT 1"
      ).bind(domain).first<{ data_json: string; cached_at: number }>();
      if (cached && Date.now() - cached.cached_at < getAnalysisCacheTtlMs(env)) {
        const parsed = JSON.parse(cached.data_json);
        return { kind: "cached", data: { ...parsed, cached: true } };
      }
    } catch { /* cache miss */ }
  }

  // ── Phase 0: Quick NXDOMAIN check ────────────────────────────────
  try {
    const quickData = await dohQuery(domain, "A");
    if (quickData && quickData.Status === 3) {
      const nxResult = makeNxdomainResult(domain);
      try {
        await env.DB.prepare(
          "INSERT OR REPLACE INTO domain_cache (domain, cache_type, data_json, cached_at) VALUES (?, 'analysis', ?, ?)"
        ).bind(domain, JSON.stringify(nxResult), Date.now()).run();
      } catch { /* ignore */ }
      return { kind: "nxdomain", data: nxResult };
    }
  } catch { /* DNS check failed, proceed with full analysis */ }

  // ── Phase 1: DNS + HTTP ──────────────────────────────────────────
  await onPhase("dns", "running", "Resolving DNS…");

  let dnsRecords: DnsRecord[];
  let httpAnalysis: HttpAnalysis | null;
  {
    const [dnsResult, httpResult] = await Promise.allSettled([
      checkDns(domain),
      analyzeHttp(domain, instanceHost),
    ]);
    dnsRecords = dnsResult.status === "fulfilled" ? dnsResult.value : [];
    httpAnalysis = httpResult.status === "fulfilled" ? httpResult.value : null;
  }

  const httpStatusCode = httpAnalysis?.status_code ?? 0;
  const httpProbeSucceeded = httpStatusCode >= 200 && httpStatusCode < 400;
  const html = httpProbeSucceeded ? (httpAnalysis?.html ?? "") : "";
  const rawHeadersOriginal = httpProbeSucceeded ? (httpAnalysis?.headers?.raw ?? null) : null;

  // Stream Phase 1 results
  await onResult("dns", { records: dnsRecords });
  if (httpAnalysis) {
    await onResult("redirects", httpProbeSucceeded ? (httpAnalysis.redirects ?? []) : []);
    if (httpProbeSucceeded && httpAnalysis.headers) {
      await onResult("headers", {
        raw: httpAnalysis.headers.raw ?? {},
        security_audit: httpAnalysis.headers.security_audit ?? [],
        security_grade: httpAnalysis.headers.security_grade ?? "F",
      });
    }
    if (httpProbeSucceeded && httpAnalysis.tech_stack) {
      await onResult("tech_stack", httpAnalysis.tech_stack);
    }
    if (httpProbeSucceeded && httpAnalysis.meta) {
      await onResult("meta_partial", httpAnalysis.meta);
    }
  }

  // ── Phase 2: All parallel checks ─────────────────────────────────
  const ip = dnsRecords.find((r) => r.type === "A")?.data;
  const domainIsSubdomain = isSubdomain(domain);

  type Phase2Check = { key: string; promise: Promise<unknown>; label: string };
  const checks: Phase2Check[] = [
    { key: "rdap", promise: checkRdap(domain, env), label: "WHOIS / RDAP" },
    { key: "_robots_sitemap", promise: checkRobotsSitemap(domain, instanceHost), label: "Robots & Sitemap" },
    { key: "ip_info", promise: checkIpInfo(domain, dnsRecords), label: "IP Geolocation" },
    { key: "blocklists", promise: checkBlocklists(dnsRecords), label: "Blocklist Check" },
    { key: "ssl", promise: checkSsl(domain), label: "SSL / TLS" },
    { key: "performance", promise: checkPageSpeed(domain, httpAnalysis?.response_time_ms ?? null, env.DB, env.GOOGLE_PAGESPEED_API_KEY), label: "Google PageSpeed" },
    { key: "_status", promise: checkStatus(domain), label: "HTTP Status" },
    { key: "llms_txt", promise: checkLlmsTxt(domain, instanceHost), label: "LLMs.txt" },
    { key: "wayback", promise: checkWayback(domain), label: "Wayback Machine" },
    { key: "tranco_rank", promise: checkTranco(domain), label: "Tranco Ranking" },
    { key: "observatory", promise: checkObservatory(domain), label: "Observatory" },
    { key: "email_auth", promise: checkEmailAuth(domain, dnsRecords), label: "Email Auth" },
    { key: "carbon", promise: checkCarbon(domain), label: "Carbon Footprint" },
    { key: "shodan", promise: ip ? checkShodan(ip) : Promise.resolve(null), label: "Shodan" },
    { key: "dnssec", promise: checkDnssec(domain), label: "DNSSEC" },
    { key: "breaches", promise: checkBreaches(domain, env.DB), label: "Data Breaches" },
    { key: "cert_transparency", promise: checkCertTransparency(domain), label: "Cert Transparency" },
    { key: "security_txt", promise: checkSecurityTxt(domain, instanceHost), label: "Security.txt" },
    { key: "green_hosting", promise: checkGreenHosting(domain), label: "Green Hosting" },
    { key: "well_known", promise: checkWellKnownEndpoints(domain), label: "Well-Known" },
    { key: "greynoise", promise: ip ? checkGreynoise(ip) : Promise.resolve(null), label: "GreyNoise" },
    { key: "ans", promise: checkAnsRecords(domain), label: "ANS / DNS-AID" },
    { key: "dns_propagation", promise: checkDnsPropagation(domain), label: "DNS Propagation" },
    { key: "ripe_routing", promise: ip ? checkRipeRouting(ip) : Promise.resolve(null), label: "RIPE Routing" },
    { key: "outage_links", promise: checkOutagePages(domain), label: "Outage Pages" },
    { key: "connection_timing", promise: checkConnectionTiming(domain, env), label: "Connection Timing" },
  ];

  await onPhase("phase2", "running", `Running ${checks.length} checks…`, checks.length);

  // Collect results as they arrive, streaming each via onResult
  const results: Record<string, unknown> = {};
  let completed = 0;

  const wrappedPromises = checks.map(({ key, promise, label }) =>
    promise.then(
      (value) => {
        results[key] = value;
        completed++;
        const sendPromise = onResult(key, value, completed, checks.length, label);

        // When _status arrives, compute and send early enhanced status
        if (key === "_status") {
          const sr = value as StatusShape | null;
          const statusVal: StatusShape = sr ?? { is_up: false, status_code: null, response_time_ms: null, error: "Check failed", status_label: "DOWN", http_blocked: false };
          const dnsOk = dnsRecords.some((r) => r.type === "A" || r.type === "AAAA");
          let earlyStatus: StatusShape = { ...statusVal };
          if (httpProbeSucceeded && httpAnalysis) {
            const fc = httpAnalysis.redirects?.[httpAnalysis.redirects.length - 1]?.status_code;
            if (fc && fc >= 200 && fc < 400) {
              earlyStatus = { ...statusVal, is_up: true, status_code: fc, status_label: "UP", http_blocked: false, error: null };
            }
          } else if (!statusVal.is_up && dnsOk) {
            earlyStatus = { ...statusVal, is_up: true, status_label: "RESTRICTED", http_blocked: true, error: "Site is online (DNS resolves) but blocked our HTTP probe" };
          } else if (statusVal.http_blocked && dnsOk) {
            earlyStatus = { ...statusVal, is_up: true, status_label: "RESTRICTED", error: `Site returned HTTP ${statusVal.status_code} — blocking automated requests` };
          }
          return sendPromise.then(() => onResult("status", earlyStatus));
        }
        return sendPromise;
      },
      (err) => {
        results[key] = null;
        completed++;
        // Log API error for observability
        logApiError(env.STATS_DB, { api: key.replace(/^_/, ""), status: 0, message: String(err).slice(0, 200), domain });
        return onResult(key, null, completed, checks.length, label);
      },
    )
  );

  await Promise.allSettled(wrappedPromises);

  // Probabilistic prune of old error rows (~5% of requests) — non-blocking
  if (Math.random() < 0.05) backgroundWork(env, pruneApiErrors(env.STATS_DB));

  // ── Assemble final result ────────────────────────────────────────

  const rdapResult = (results.rdap ?? null) as RdapResult | null;
  const robotsSitemap = (results._robots_sitemap ?? { robots_txt: null, robots_txt_exists: false, sitemap_detected: false, sitemap_url: null, sitemap_page_count: null }) as Pick<MetaResult, "robots_txt" | "robots_txt_exists" | "sitemap_detected" | "sitemap_url" | "sitemap_page_count">;
  const ipInfo = (results.ip_info ?? null) as IpInfo | null;
  const blocklists = (results.blocklists ?? []) as BlocklistResult[];
  const sslResult = (results.ssl ?? null) as SslResult | null;
  const pageSpeedResult = (results.performance ?? DEFAULT_PERFORMANCE) as PerformanceResult;
  const statusResult = (results._status ?? DEFAULT_STATUS) as StatusShape;
  const llmsTxt = (results.llms_txt ?? DEFAULT_LLMS_TXT) as LlmsTxtResult;
  const wayback = (results.wayback ?? null) as { first_snapshot: string | null; last_snapshot: string | null; total_snapshots: number | null; archive_url: string } | null;
  const tranco = (results.tranco_rank ?? null) as number | null;
  const observatory = results.observatory ?? null;
  const emailAuth = (results.email_auth ?? DEFAULT_EMAIL_AUTH) as EmailAuthResult;
  const carbon = results.carbon ?? null;
  const shodanResult = (results.shodan ?? null) as ShodanResult | null;
  const dnssecResult = (results.dnssec ?? DEFAULT_DNSSEC) as DnssecResult;
  const breachResult = (results.breaches ?? DEFAULT_BREACH) as BreachResult;
  const certTransparency = (results.cert_transparency ?? DEFAULT_CERT_TRANSPARENCY) as CertTransparencyResult;
  const securityTxt = (results.security_txt ?? DEFAULT_SECURITY_TXT) as SecurityTxtResult;
  const greenHosting = (results.green_hosting ?? DEFAULT_GREEN_HOSTING) as GreenHostingResult;
  const wellKnown = (results.well_known ?? DEFAULT_WELL_KNOWN) as WellKnownResult;
  const greynoiseResult = (results.greynoise ?? null) as GreynoiseResult | null;
  const ansResult = results.ans ?? null;
  const dnsPropagation = (results.dns_propagation ?? null) as import("./network-health").DnsPropagation | null;
  const ripeRouting = (results.ripe_routing ?? null) as import("./network-health").RipeRouting | null;
  const outageLinks = (results.outage_links ?? null) as import("./network-health").OutageLinks | null;
  const connectionTimingResult = (results.connection_timing ?? null) as import("./network-health").ConnectionTiming | null;

  // Build merged meta
  const meta: MetaResult = {
    ...(robotsSitemap ?? { robots_txt: null, robots_txt_exists: false, sitemap_detected: false, sitemap_url: null, sitemap_page_count: null }),
    og_title: httpProbeSucceeded ? (httpAnalysis?.meta?.og_title ?? null) : null,
    og_description: httpProbeSucceeded ? (httpAnalysis?.meta?.og_description ?? null) : null,
    og_image: httpProbeSucceeded ? (httpAnalysis?.meta?.og_image ?? null) : null,
    favicon_url: httpProbeSucceeded ? (httpAnalysis?.meta?.favicon_url ?? null) : null,
  };

  // Enhanced status with DNS-based fallback
  const dnsResolves = dnsRecords.some((r) => r.type === "A" || r.type === "AAAA");
  const sslValid = sslResult && !sslResult.error && sslResult.grade !== null;
  let enhancedStatus: StatusShape = { ...statusResult };
  if (httpProbeSucceeded && httpAnalysis) {
    const finalCode = httpAnalysis.redirects?.[httpAnalysis.redirects.length - 1]?.status_code;
    if (finalCode && finalCode >= 200 && finalCode < 400) {
      enhancedStatus = { ...statusResult, is_up: true, status_code: finalCode, status_label: "UP", http_blocked: false, error: null };
    }
  } else if (!statusResult.is_up && dnsResolves) {
    enhancedStatus = {
      ...statusResult, is_up: true, status_label: "RESTRICTED", http_blocked: true,
      error: sslValid ? "Site is online (DNS resolves, SSL valid) but blocked our HTTP probe" : "Site is online (DNS resolves) but blocked our HTTP probe",
    };
  } else if (statusResult.http_blocked && dnsResolves) {
    enhancedStatus = {
      ...statusResult, is_up: true, status_label: "RESTRICTED",
      error: `Site returned HTTP ${statusResult.status_code} — blocking automated requests`,
    };
  }

  // Stream the final enhanced status
  await onResult("status", enhancedStatus);

  // Derived analysis (synchronous computations)
  const robotsParsed = parseRobotsDeep(meta.robots_txt, meta.robots_txt_exists);
  const jsonLd = extractJsonLd(html);

  const siteIsCloudflareRefined = isActuallyCloudflare(dnsRecords, ipInfo);
  const effectiveHeaders = (rawHeadersOriginal && !siteIsCloudflareRefined)
    ? sanitizeCfHeaders(rawHeadersOriginal) : rawHeadersOriginal;

  // Detect HTTP protocols — try Fly probe first, fall back to header detection
  let httpProtocols = detectHttpProtocols(effectiveHeaders);
  if (!httpProtocols.http2 && !httpProtocols.http3) {
    const probed = await probeHttpProtocols(domain);
    if (probed.http2 || probed.http3) httpProtocols = probed;
  }

  // Re-run security audit + tech stack with cleaned headers if we sanitized
  let finalSecurityAudit = httpAnalysis?.headers?.security_audit ?? [];
  let finalSecurityGrade = httpAnalysis?.headers?.security_grade ?? "F";
  let finalTechStack = httpAnalysis?.tech_stack ?? [];

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

  const hosting = detectHosting(ipInfo, effectiveHeaders);
  const wpDetails = httpProbeSucceeded ? analyzeWordPress(html, effectiveHeaders ?? {}, dnsRecords) : null;

  // ISP fallback for hosting provider
  if (!hosting.provider && ipInfo?.isp) {
    for (const { pattern, name } of HOSTING_ISPS) {
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
  const cacheAnalysis = checkCacheHeaders(effectiveHeaders);

  // WAF detection: gather set-cookie headers for cookie-based signals
  const setCookieRaw = effectiveHeaders?.["set-cookie"] ?? "";
  const setCookieHeaders = setCookieRaw ? setCookieRaw.split(/\n/) : [];
  const wafDetection = httpProbeSucceeded ? checkWaf(effectiveHeaders, html, setCookieHeaders) : null;

  const aiReadiness = calculateAiReadiness(llmsTxt, robotsParsed, jsonLd, html, socialMeta, ansResult as Awaited<ReturnType<typeof checkAnsRecords>> | null);
  const structuredDataValidation = validateStructuredData(jsonLd);

  const accessibilityResult = httpProbeSucceeded ? analyzeAccessibility(html) : null;
  const thirdPartyScriptsResult = httpProbeSucceeded ? analyzeThirdPartyScripts(html, domain) : null;
  const cookieConsentResult = httpProbeSucceeded ? analyzeCookieConsent(html, effectiveHeaders ?? {}, domain) : null;

  // Health score
  const listedCount = blocklists.filter((bl) => bl.listed).length;
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

  // Trust signal aggregation
  const caaAnalysis = analyzeCaaRecords(dnsRecords);
  const caaRecordsForTrust = (caaAnalysis as { records?: Array<{ tag: string; value: string }> } | null)?.records ?? null;
  const trustSignals = httpProbeSucceeded ? checkTrustSignals({
    headers: effectiveHeaders,
    securityTxt: securityTxt,
    emailAuth,
    dnssec: dnssecResult,
    ssl: sslResult,
    caaRecords: caaRecordsForTrust,
    wellKnown: wellKnown,
    waf: wafDetection,
    html,
    hosting,
  }) : null;

  // Network health aggregation
  const networkHealth: NetworkHealth | null = (dnsPropagation || ripeRouting || connectionTimingResult || outageLinks) ? {
    dns_propagation: dnsPropagation,
    ripe_routing: ripeRouting,
    connection_timing: connectionTimingResult,
    outage_links: outageLinks,
  } : null;

  // Contextual domain score
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
    jsonLd,
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
    cacheAnalysis,
    waf: wafDetection,
    trustSignals,
    networkHealth,
  });

  const result: AnalysisResult = {
    domain,
    analyzed_at: new Date().toISOString(),
    cached: false,
    http_probe_blocked: !httpProbeSucceeded,
    is_subdomain: domainIsSubdomain,
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
    shodan: shodanResult,
    dnssec: dnssecResult,
    hosting,
    social_meta: socialMeta,
    legal,
    cookie_security: cookieSecurity,
    compression,
    cache_analysis: cacheAnalysis,
    waf: wafDetection,
    trust_signals: trustSignals,
    ai_readiness: aiReadiness,
    health_score: healthScore,
    wordpress: wpDetails,
    breaches: breachResult,
    cert_transparency: certTransparency,
    security_txt: securityTxt,
    green_hosting: greenHosting,
    well_known: wellKnown,
    caa_analysis: caaAnalysis,
    greynoise: greynoiseResult,
    domain_score: domainScore,
    structured_data: structuredDataValidation,
    accessibility: accessibilityResult,
    third_party_scripts: thirdPartyScriptsResult,
    cookie_consent: cookieConsentResult,
    network_health: networkHealth,
  };

  // ── Post-analysis: score logging, caching, cleanup ───────────────
  // All post-analysis D1 writes are non-blocking background work.
  // They use ctx.waitUntil() so they continue after the response is sent.

  const resultJson = JSON.stringify(result);

  // Historical score logging (non-critical)
  if (domainScore) {
    backgroundWork(env, (async () => {
      try {
        await env.STATS_DB.prepare(
          `INSERT OR REPLACE INTO domain_scores (domain, composite_score, security_score, performance_score, reliability_score, trust_score, visibility_score, archetype, archetype_confidence, scored_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          domain, domainScore.composite, domainScore.axes.security.score,
          domainScore.axes.performance.score, domainScore.axes.reliability.score,
          domainScore.axes.trust.score, domainScore.axes.visibility.score,
          domainScore.archetype.detected, domainScore.archetype.confidence,
          new Date().toISOString(),
        ).run();
      } catch {
        try {
          await env.STATS_DB.prepare(
            `CREATE TABLE IF NOT EXISTS domain_scores (
              id INTEGER PRIMARY KEY AUTOINCREMENT, domain TEXT NOT NULL,
              composite_score INTEGER NOT NULL, security_score INTEGER NOT NULL,
              performance_score INTEGER NOT NULL, reliability_score INTEGER NOT NULL,
              trust_score INTEGER NOT NULL, visibility_score INTEGER NOT NULL,
              archetype TEXT NOT NULL, archetype_confidence REAL NOT NULL,
              scored_at TEXT NOT NULL DEFAULT (datetime('now')),
              UNIQUE(domain, scored_at)
            )`
          ).run();
          await env.STATS_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_domain_scores_domain ON domain_scores(domain)`).run();
          await env.STATS_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_domain_scores_scored_at ON domain_scores(scored_at)`).run();
          await env.STATS_DB.prepare(
            `INSERT OR REPLACE INTO domain_scores (domain, composite_score, security_score, performance_score, reliability_score, trust_score, visibility_score, archetype, archetype_confidence, scored_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            domain, domainScore.composite, domainScore.axes.security.score,
            domainScore.axes.performance.score, domainScore.axes.reliability.score,
            domainScore.axes.trust.score, domainScore.axes.visibility.score,
            domainScore.archetype.detected, domainScore.archetype.confidence,
            new Date().toISOString(),
          ).run();
        } catch { /* auto-migration + retry failed — non-critical */ }
      }
    })());
  }

  // Cache result + recent lookup (non-blocking)
  backgroundWork(env, (async () => {
    try {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO domain_cache (domain, cache_type, data_json, cached_at) VALUES (?, 'analysis', ?, ?)"
      ).bind(domain, resultJson, Date.now()).run();
    } catch { /* cache write failure is non-critical */ }

    try {
      await env.DB.prepare(
        "INSERT INTO domain_lookups (domain, results_json, analyzed_at) VALUES (?, ?, ?)"
      ).bind(domain, resultJson, Date.now()).run();
    } catch { /* ignore */ }

    // Probabilistic cache cleanup
    await maybePruneCache(env.DB);
  })());

  return { kind: "complete", data: result };
}
