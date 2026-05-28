// ─── Contextual Domain Scoring System ─────────────────────────────────
// Implements the 5-axis radar scoring with archetype-based contextual weighting.
// See workspace/yoke-research/scoring-system-design.md for full design doc.

import type {
  SslResult, DnssecResult, BlocklistResult, PerformanceResult,
  OgTwitterResult, LegalResult, CompressionResult, JsonLdItem,
  RobotsParsed, MetaResult, HttpAnalysis, SecurityHeaderCheck,
  EmailAuthResult, CertTransparencyResult, GreynoiseResult,
  HostingResult, TechItem, AccessibilityResult, ThirdPartyScriptsResult,
  CookieConsentResult, CacheAnalysis, WafDetection, TrustSignals,
  ShodanResult, CookieSecurityResult, SecurityTxtResult, WellKnownResult,
  RedirectHop, CruxResult,
} from "./types";
import type { NetworkHealth } from "./network-health";
import type { BreachResult } from "../breaches";
import {
  PERF_SCORE, LCP, CLS, TTFB, DOMAIN_AGE, DOMAIN_EXPIRY, NS_COUNT, A11Y_SCORE,
  SEVERITY_SCORES, resolveSeverity,
} from "../../config/scoring-thresholds";
import { scanForVulnerableLibraries } from "../../data/vulnerable-libraries";
import { analyzeNsDiversity } from "../../data/ns-providers";

// ─── Types ───────────────────────────────────────────────────────────

export type Axis = "security" | "performance" | "reliability" | "trust" | "visibility";
export type Severity = "critical" | "high" | "medium" | "low" | "info" | "good";
export type ArchetypeName = "commerce" | "content" | "application" | "corporate" | "infrastructure" | "institutional" | "general";

export interface Finding {
  signal: string;
  axis: Axis;
  severity: Severity;
  label: string;
  tradeoff: string | null;
  weight: number; // relative importance within axis (1-5)
  source?: string; // citation/rationale for the threshold
}

export interface ArchetypeResult {
  detected: ArchetypeName;
  confidence: number;
  secondary: ArchetypeName | null;
  signals: string[];
  platform: string | null; // managed platform if detected
  weights: Record<ArchetypeName, Record<Axis, number>>; // all archetype weight profiles for client-side recalc
}

export interface AxisScore {
  score: number | null;
  weight: number;
  findings: Finding[];
  not_measured?: boolean;
}

export interface DomainScoreResult {
  composite: number;
  grade: string;
  axes: Record<Axis, AxisScore>;
  archetype: ArchetypeResult;
}

// ─── Severity → Score mapping ────────────────────────────────────────

const SEVERITY_SCORE = SEVERITY_SCORES;

// ─── Exported Scoring Helpers ────────────────────────────────────────
// Pure functions extracted for testability. Used by calculateDomainScore below.

export function computeAxisScore(findings: Finding[]): number {
  if (findings.length === 0) return 65; // measured axis with no findings defaults to 65
  let weightedSum = 0;
  let totalWeight = 0;
  for (const f of findings) {
    weightedSum += SEVERITY_SCORE[f.severity] * f.weight;
    totalWeight += f.weight;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 65;
}

export function computeComposite(axisScores: Record<Axis, number>, archetype: ArchetypeName): number {
  let composite = 0;
  for (const axis of Object.keys(AXIS_WEIGHTS) as Axis[]) {
    composite += axisScores[axis] * AXIS_WEIGHTS[axis];
  }
  return Math.round(composite);
}

export function gradeFromComposite(score: number): string {
  return score >= 95 ? "A+" : score >= 90 ? "A" : score >= 85 ? "B+" : score >= 80 ? "B" : score >= 75 ? "C+" : score >= 65 ? "C" : score >= 50 ? "D" : "F";
}

export function contextualSeverity(baseSeverity: Severity, archetype: ArchetypeName, overrides: Partial<Record<ArchetypeName, Severity>>): Severity {
  return overrides[archetype] ?? baseSeverity;
}

// ─── Fixed Axis Weights ──────────────────────────────────────────────
// Single weight set for all archetypes. Security weighted highest;
// Trust de-emphasized until axis has more diverse signals;
// visibility and performance boosted for better discrimination.

export const AXIS_WEIGHTS: Record<Axis, number> = {
  security: 0.28,
  reliability: 0.25,
  trust: 0.12,
  performance: 0.20,
  visibility: 0.15,
};

// Legacy export — kept for API compatibility; every archetype returns the same weights.
export const ARCHETYPE_WEIGHTS: Record<ArchetypeName, Record<Axis, number>> = {
  commerce:       AXIS_WEIGHTS,
  content:        AXIS_WEIGHTS,
  application:    AXIS_WEIGHTS,
  corporate:      AXIS_WEIGHTS,
  infrastructure: AXIS_WEIGHTS,
  institutional:  AXIS_WEIGHTS,
  general:        AXIS_WEIGHTS,
};

// ─── Archetype Detection ─────────────────────────────────────────────

export function detectArchetype(opts: {
  techStack: TechItem[] | null;
  headers: Record<string, string> | null;
  jsonLd: JsonLdItem[] | null;
  domain: string;
  html: string;
  hosting: HostingResult | null;
}): ArchetypeResult {
  const scores: Record<ArchetypeName, { score: number; signals: string[] }> = {
    commerce: { score: 0, signals: [] },
    content: { score: 0, signals: [] },
    application: { score: 0, signals: [] },
    corporate: { score: 0, signals: [] },
    infrastructure: { score: 0, signals: [] },
    institutional: { score: 0, signals: [] },
    general: { score: 0, signals: [] },
  };

  const tech = opts.techStack ?? [];
  const headers = opts.headers ?? {};
  const jsonLd = opts.jsonLd ?? [];
  const domain = opts.domain.toLowerCase();
  const html = opts.html.toLowerCase();

  // Commerce signals
  const commerceTech = ["shopify", "woocommerce", "magento", "bigcommerce", "prestashop", "opencart", "saleor"];
  for (const t of tech) {
    if (commerceTech.some(c => t.name.toLowerCase().includes(c))) {
      scores.commerce.score += 0.4;
      scores.commerce.signals.push(`${t.name} detected`);
    }
  }
  if (jsonLd.some(j => j.type === "Product" || j.type === "Offer")) {
    scores.commerce.score += 0.3;
    scores.commerce.signals.push("Product schema found");
  }
  if (headers["x-shopify-stage"] || headers["x-woo-version"]) {
    scores.commerce.score += 0.3;
    scores.commerce.signals.push("Commerce platform headers");
  }
  if (html.includes("/cart") || html.includes("/checkout") || html.includes("add-to-cart")) {
    scores.commerce.score += 0.2;
    scores.commerce.signals.push("Cart/checkout paths detected");
  }

  // Content signals
  const contentTech = ["wordpress", "ghost", "hugo", "jekyll", "gatsby", "eleventy", "pelican", "hexo", "drupal", "joomla", "squarespace"];
  for (const t of tech) {
    if (contentTech.some(c => t.name.toLowerCase().includes(c))) {
      scores.content.score += 0.35;
      scores.content.signals.push(`${t.name} (CMS)`);
    }
  }
  if (jsonLd.some(j => ["Article", "BlogPosting", "NewsArticle", "WebPage"].includes(j.type))) {
    scores.content.score += 0.3;
    scores.content.signals.push("Article/Blog schema found");
  }
  if (html.includes('type="application/rss+xml"') || html.includes("/feed") || html.includes("/rss")) {
    scores.content.score += 0.2;
    scores.content.signals.push("RSS feed detected");
  }

  // Application signals
  const appTech = ["react", "vue", "angular", "svelte", "next.js", "nuxt", "remix"];
  for (const t of tech) {
    if (appTech.some(c => t.name.toLowerCase().includes(c))) {
      scores.application.score += 0.2;
      scores.application.signals.push(`${t.name} (SPA framework)`);
    }
  }
  if (html.includes('id="root"') || html.includes('id="app"') || html.includes('id="__next"')) {
    scores.application.score += 0.15;
    scores.application.signals.push("SPA root element");
  }
  if (headers["x-powered-by"]?.includes("Express") || headers["x-api-version"]) {
    scores.application.score += 0.2;
    scores.application.signals.push("API/app server headers");
  }
  if (html.includes("/login") || html.includes("/signin") || html.includes("/auth") || html.includes("/oauth")) {
    scores.application.score += 0.2;
    scores.application.signals.push("Auth endpoints detected");
  }

  // Corporate signals
  if (jsonLd.some(j => j.type === "Organization" || j.type === "Corporation")) {
    scores.corporate.score += 0.3;
    scores.corporate.signals.push("Organization schema found");
  }
  if (html.includes("/careers") || html.includes("/jobs") || html.includes("/about-us") || html.includes("/investor")) {
    scores.corporate.score += 0.25;
    scores.corporate.signals.push("Corporate pages detected");
  }
  if (html.includes("/press") || html.includes("/newsroom") || html.includes("/media-kit")) {
    scores.corporate.score += 0.15;
    scores.corporate.signals.push("Press/media pages");
  }

  // Infrastructure signals
  if (!html || html.length < 500) {
    scores.infrastructure.score += 0.3;
    scores.infrastructure.signals.push("Minimal/no HTML (API-only)");
  }
  if (headers["content-type"]?.includes("application/json") && !html.includes("<html")) {
    scores.infrastructure.score += 0.3;
    scores.infrastructure.signals.push("JSON-only response");
  }
  if (html.includes("/docs") && html.includes("/api") && html.includes("sdk")) {
    scores.infrastructure.score += 0.2;
    scores.infrastructure.signals.push("Developer documentation");
  }

  // Institutional signals
  if (/\.(gov|edu|mil)$/i.test(domain)) {
    scores.institutional.score += 0.7;
    scores.institutional.signals.push(`.${domain.split(".").pop()} TLD`);
  }
  if (headers["x-frame-options"] === "DENY" && headers["x-xss-protection"]) {
    scores.institutional.score += 0.1;
    scores.institutional.signals.push("Strict security headers");
  }

  // Detect managed platform
  let platform: string | null = null;
  const platformChecks: [RegExp, string][] = [
    [/shopify/i, "Shopify"], [/wix/i, "Wix"], [/squarespace/i, "Squarespace"],
    [/wordpress\.com/i, "WordPress.com"], [/vercel/i, "Vercel"],
    [/netlify/i, "Netlify"], [/cloudflare pages/i, "Cloudflare Pages"],
  ];
  const hostProvider = opts.hosting?.provider ?? "";
  const cdn = opts.hosting?.cdn ?? "";
  for (const [re, name] of platformChecks) {
    if (re.test(hostProvider) || re.test(cdn) || tech.some(t => re.test(t.name))) {
      platform = name;
      break;
    }
  }

  // Find top archetype
  const ranked = (Object.entries(scores) as [ArchetypeName, { score: number; signals: string[] }][])
    .filter(([k]) => k !== "general")
    .sort((a, b) => b[1].score - a[1].score);

  const top = ranked[0];
  const second = ranked[1];

  if (!top || top[1].score < 0.3) {
    return { detected: "general", confidence: 1.0, secondary: null, signals: ["No strong archetype signals"], platform, weights: ARCHETYPE_WEIGHTS };
  }

  const confidence = Math.min(1.0, top[1].score);
  const secondary = (second && second[1].score > 0.25 && top[1].score - second[1].score < 0.15) ? second[0] : null;

  return { detected: top[0], confidence, secondary, signals: top[1].signals, platform, weights: ARCHETYPE_WEIGHTS };
}

// ─── Scoring Engine ──────────────────────────────────────────────────

export function calculateDomainScore(opts: {
  ssl: SslResult | null;
  securityGrade: string | null;
  securityAudit: SecurityHeaderCheck[];
  dnssec: DnssecResult | null;
  blocklists: BlocklistResult[];
  emailAuth: EmailAuthResult | null;
  performance: PerformanceResult | null;
  performanceDesktop: PerformanceResult | null;
  crux: CruxResult | null;
  compression: CompressionResult | null;
  httpProtocols: { http2: boolean; http3: boolean } | null;
  hosting: HostingResult | null;
  dnsRecords: Array<{ type: string; data: string; ttl: number }>;
  rdap: { domain_age_days: number | null; days_until_expiry: number | null } | null;
  socialMeta: OgTwitterResult | null;
  jsonLd: JsonLdItem[] | null;
  meta: MetaResult | null;
  legal: LegalResult | null;
  wayback: { total_snapshots: number | null } | null;
  certTransparency: CertTransparencyResult | null;
  greynoise: GreynoiseResult | null;
  techStack: TechItem[] | null;
  headers: Record<string, string> | null;
  domain: string;
  html: string;
  httpBlocked: boolean;
  accessibility: AccessibilityResult | null;
  thirdPartyScripts: ThirdPartyScriptsResult | null;
  cookieConsent: CookieConsentResult | null;
  cacheAnalysis: CacheAnalysis | null;
  waf: WafDetection | null;
  trustSignals: TrustSignals | null;
  networkHealth: NetworkHealth | null;
  breaches: BreachResult | null;
  trancoRank: number | null;
  socialAccounts: { accounts: Array<{ platform: string; url: string; found_via: string }> } | null;
  // Phase 1 new signals
  shodan: ShodanResult | null;
  cookieSecurity: CookieSecurityResult | null;
  securityTxt: SecurityTxtResult | null;
  wellKnown: WellKnownResult | null;
  redirects: RedirectHop[];
  statusResult: { is_up: boolean; status_code: number | null; http_blocked?: boolean; status_label?: string } | null;
  robotsParsed: RobotsParsed | null;
}): DomainScoreResult {
  // Step 1: Detect archetype
  const archetype = detectArchetype({
    techStack: opts.techStack,
    headers: opts.headers,
    jsonLd: opts.jsonLd,
    domain: opts.domain,
    html: opts.html,
    hosting: opts.hosting,
  });

  const arch = archetype.detected;
  const findings: Finding[] = [];

  // ─── Security Axis Findings ──────────────────────────────────────

  // SSL grade
  const sslGrade = opts.ssl?.grade;
  const sslError = opts.ssl?.error;
  if (sslGrade) {
    if (sslGrade === "Valid") {
      // Fallback confirmed HTTPS works but SSL Labs didn't provide a letter grade
      findings.push({ signal: "ssl_grade", axis: "security", severity: "good", label: "SSL certificate valid (detailed grade unavailable)", tradeoff: null, weight: 3 });
    } else if (sslGrade.startsWith("A")) {
      findings.push({ signal: "ssl_grade", axis: "security", severity: "good", label: `SSL grade ${sslGrade}`, tradeoff: null, weight: 3 });
    } else if (sslGrade.startsWith("B")) {
      findings.push({ signal: "ssl_grade", axis: "security", severity: contextualSeverity("low", arch, { commerce: "medium", institutional: "medium" }), label: `SSL grade ${sslGrade} — room for improvement`, tradeoff: null, weight: 3 });
    } else if (sslGrade.startsWith("C")) {
      findings.push({ signal: "ssl_grade", axis: "security", severity: contextualSeverity("medium", arch, { commerce: "high", institutional: "high" }), label: `SSL grade ${sslGrade} — weak configuration`, tradeoff: "Tightening SSL config may drop support for older clients.", weight: 3 });
    } else {
      findings.push({ signal: "ssl_grade", axis: "security", severity: contextualSeverity("high", arch, { commerce: "critical", institutional: "critical" }), label: `SSL grade ${sslGrade} — significant weaknesses`, tradeoff: null, weight: 3 });
    }
  } else if (sslError && !opts.httpBlocked) {
    // SSL Labs couldn't assess but the site was successfully fetched over HTTPS — don't penalize
    findings.push({ signal: "ssl_grade", axis: "security", severity: "info", label: "SSL present (grade assessment unavailable)", tradeoff: null, weight: 3 });
  } else if (!opts.httpBlocked) {
    findings.push({ signal: "ssl_missing", axis: "security", severity: contextualSeverity("high", arch, { content: "medium" }), label: "No SSL certificate detected", tradeoff: null, weight: 3 });
  }

  // HSTS
  const hasHsts = !!opts.headers?.["strict-transport-security"];
  if (!opts.httpBlocked) {
    if (hasHsts) {
      findings.push({ signal: "hsts", axis: "security", severity: "good", label: "HSTS enabled", tradeoff: null, weight: 4 });
    } else {
      findings.push({
        signal: "hsts_missing", axis: "security",
        severity: contextualSeverity("medium", arch, { commerce: "critical", application: "high", content: "low", corporate: "medium" }),
        label: arch === "commerce" ? "No HSTS — payment flows vulnerable to downgrade attacks" : "No HSTS header",
        tradeoff: arch === "content" ? "Adding HSTS is low-effort. But if you serve mixed content, HSTS will break it." : null,
        weight: 4,
      });
    }
  }

  // CSP
  const hasCsp = opts.securityAudit.some(a => a.header.toLowerCase().includes("content-security-policy") && a.status === "pass");
  if (!opts.httpBlocked) {
    if (hasCsp) {
      findings.push({ signal: "csp", axis: "security", severity: "good", label: "Content Security Policy present", tradeoff: null, weight: 3 });
    } else {
      findings.push({
        signal: "csp_missing", axis: "security",
        severity: contextualSeverity("medium", arch, { application: "high", content: "medium", corporate: "low" }),
        label: arch === "application" ? "No CSP — XSS risk for interactive app" : "No Content Security Policy",
        tradeoff: arch === "application" ? "CSP is hard to retrofit. Start with report-only mode." : null,
        weight: 3,
      });
    }
  }

  // X-Frame-Options
  const hasXfo = opts.securityAudit.some(a => a.header.toLowerCase().includes("x-frame-options") && a.status === "pass");
  if (!opts.httpBlocked) {
    findings.push({
      signal: "xfo", axis: "security",
      severity: hasXfo ? "good" : contextualSeverity("low", arch, { commerce: "medium", application: "medium" }),
      label: hasXfo ? "X-Frame-Options set" : "No X-Frame-Options header",
      tradeoff: null, weight: 2,
    });
  }

  // X-Content-Type-Options
  const hasXcto = opts.securityAudit.some(a => a.header.toLowerCase().includes("x-content-type-options") && a.status === "pass");
  if (!opts.httpBlocked) {
    findings.push({
      signal: "xcto", axis: "security",
      severity: hasXcto ? "good" : "low",
      label: hasXcto ? "X-Content-Type-Options set" : "No X-Content-Type-Options",
      tradeoff: null, weight: 1,
    });
  }

  // DNSSEC — bonus when present, minimal penalty when absent for most archetypes
  if (opts.dnssec) {
    findings.push({
      signal: "dnssec", axis: "security",
      severity: opts.dnssec.enabled
        ? "good"
        : contextualSeverity("info", arch, {
            institutional: "medium",
            infrastructure: "medium",
            commerce: "low",
            corporate: "low",
            application: "info",
            content: "info",
            general: "info",
          }),
      label: opts.dnssec.enabled ? "DNSSEC enabled" : "DNSSEC not enabled",
      tradeoff: opts.dnssec.enabled ? null : "DNSSEC adds DNS-level authenticity but can complicate DNS management. Most sites work fine without it.",
      weight: opts.dnssec.enabled ? 2 : 1, // Higher weight when present (reward), lower when absent (don't penalize)
    });
  }

  // Blocklist status
  const listedCount = (opts.blocklists ?? []).filter(b => b.listed).length;
  if (listedCount > 0) {
    findings.push({
      signal: "blocklist_listed", axis: "security",
      severity: listedCount >= 3 ? "critical" : listedCount >= 2 ? "high" : "medium",
      label: `Listed on ${listedCount} blocklist${listedCount > 1 ? "s" : ""}`,
      tradeoff: null, weight: 3,
    });
  }

  // Email auth (SPF + DKIM + DMARC)
  if (opts.emailAuth) {
    const hasSpf = opts.emailAuth.spf.found;
    const hasDmarc = opts.emailAuth.dmarc.found;
    const hasDkim = opts.emailAuth.dkim_selectors_found.length > 0;
    const dmarcPolicy = opts.emailAuth.dmarc.policy;
    const emailComplete = hasSpf && hasDmarc && hasDkim;

    if (emailComplete && dmarcPolicy === "reject") {
      findings.push({ signal: "email_auth", axis: "security", severity: "good", label: "Full email auth (SPF+DKIM+DMARC reject)", tradeoff: null, weight: 3 });
    } else if (emailComplete) {
      findings.push({ signal: "email_auth", axis: "security", severity: "info", label: `Email auth present (DMARC: ${dmarcPolicy || "none"})`, tradeoff: null, weight: 3 });
    } else {
      // SPF and DMARC are deterministic lookups; DKIM uses arbitrary selectors
      // that can't always be discovered externally — treat them differently
      const missing = [!hasSpf && "SPF", !hasDmarc && "DMARC"].filter(Boolean);
      if (missing.length > 0) {
        findings.push({
          signal: "email_auth_incomplete", axis: "security",
          severity: contextualSeverity("medium", arch, { corporate: "high" }),
          label: `Missing email auth: ${missing.join(", ")}`,
          tradeoff: null, weight: 3,
        });
      }
      if (!hasDkim && (hasSpf || hasDmarc)) {
        // DKIM absence is too noisy — external detection is limited; skip
      }
    }
  }

  // WAF detection
  if (opts.waf?.detected) {
    if (opts.waf.confidence === "high") {
      findings.push({ signal: "waf_detected", axis: "security", severity: "good", label: `WAF detected: ${opts.waf.provider}`, tradeoff: null, weight: 2 });
    } else if (opts.waf.confidence === "medium") {
      findings.push({ signal: "waf_detected", axis: "security", severity: "good", label: `WAF likely: ${opts.waf.provider}`, tradeoff: null, weight: 2 });
    } else {
      findings.push({ signal: "waf_detected", axis: "security", severity: "good", label: `WAF possible: ${opts.waf.provider}`, tradeoff: null, weight: 1 });
    }
  }

  // CSP header — already scored via securityAudit ("csp" signal above); skip to avoid double-count

  // HSTS preload
  if (opts.headers && !opts.httpBlocked) {
    const hsts = opts.headers["strict-transport-security"] ?? "";
    if (/preload/i.test(hsts) && /max-age\s*=\s*(\d{8,})/i.test(hsts) && /includesubdomains/i.test(hsts)) {
      findings.push({ signal: "hsts_preload", axis: "security", severity: "good", label: "HSTS preload eligible", tradeoff: null, weight: 1 });
    }
  }

  // CAA records
  if (opts.dnsRecords.some(r => r.type === "CAA")) {
    findings.push({ signal: "caa_records", axis: "security", severity: "good", label: "CAA records restrict certificate issuance", tradeoff: null, weight: 1 });
  }

  // Certificate Transparency
  if (opts.certTransparency && !opts.certTransparency.error) {
    const ct = opts.certTransparency;
    // Wildcard certificates — increased attack surface
    if (ct.has_wildcard) {
      findings.push({
        signal: "cert_wildcard", axis: "security",
        severity: contextualSeverity("info", arch, { institutional: "low", commerce: "low" }),
        label: "Wildcard certificate in use",
        tradeoff: "Wildcards simplify cert management but increase blast radius if the key is compromised.",
        weight: 1,
      });
    }
    // Certificate volume — removed: 306/306 identical, zero discrimination
  }

  // ─── NEW: Shodan Open Ports (attack surface) ─────────────────────
  if (opts.shodan) {
    const dangerousPorts = [3306, 5432, 6379, 27017, 9200, 11211, 5984, 1433, 3389];
    const exposedDangerous = opts.shodan.ports.filter(p => dangerousPorts.includes(p));
    const nonStandard = opts.shodan.ports.filter(p => ![80, 443, 22, 25, 53, 143, 993, 587, 465].includes(p));
    if (exposedDangerous.length > 0) {
      findings.push({
        signal: "open_ports", axis: "security",
        severity: "high",
        label: `Dangerous port${exposedDangerous.length > 1 ? "s" : ""} exposed: ${exposedDangerous.join(", ")}`,
        tradeoff: null, weight: 3,
      });
    }
    // Non-standard port count removed — complex infrastructure legitimately
    // runs many ports; count alone isn't a security signal
  }

  // ─── NEW: Shodan Known Vulnerabilities ───────────────────────────
  if (opts.shodan) {
    if (opts.shodan.vulns.length > 0) {
      findings.push({
        signal: "known_vulnerabilities", axis: "security",
        severity: opts.shodan.vulns.length >= 5 ? "critical" : "high",
        label: `${opts.shodan.vulns.length} known CVE${opts.shodan.vulns.length > 1 ? "s" : ""} detected (Shodan)`,
        tradeoff: "CVEs are based on detected service versions and may include patched vulnerabilities.",
        weight: 5,
      });
    }
    // no_known_vulnerabilities removed — zero discrimination (328/328 = good)
  }

  // ─── NEW: Cookie Security ────────────────────────────────────────
  if (opts.cookieSecurity && !opts.httpBlocked) {
    const issues = opts.cookieSecurity.issues;
    const cookieCount = opts.cookieSecurity.cookies.length;
    if (cookieCount > 0) {
      if (issues.length === 0) {
        findings.push({ signal: "cookie_security", axis: "security", severity: "good", label: "All cookies have Secure/HttpOnly/SameSite flags", tradeoff: null, weight: 3 });
      } else if (issues.length >= 3) {
        findings.push({ signal: "cookie_security", axis: "security", severity: "medium", label: `${issues.length} cookie security issues (missing Secure/HttpOnly/SameSite)`, tradeoff: null, weight: 3 });
      } else {
        findings.push({ signal: "cookie_security", axis: "security", severity: "low", label: `${issues.length} cookie security issue${issues.length > 1 ? "s" : ""}`, tradeoff: null, weight: 3 });
      }
    }
  }

  // ─── NEW: Server Version Disclosure ──────────────────────────────
  if (opts.headers && !opts.httpBlocked) {
    const serverHeader = opts.headers["server"] ?? "";
    const poweredBy = opts.headers["x-powered-by"] ?? "";
    const versionPattern = /\/[\d.]+/;
    const serverLeaks = versionPattern.test(serverHeader);
    const poweredByLeaks = versionPattern.test(poweredBy);
    if (serverLeaks || poweredByLeaks) {
      const leaked = [serverLeaks && serverHeader, poweredByLeaks && poweredBy].filter(Boolean).join(", ");
      findings.push({
        signal: "server_version_disclosure", axis: "security",
        severity: poweredByLeaks ? "medium" : "low",
        label: `Server version disclosed: ${leaked}`,
        tradeoff: "Version info helps attackers target known vulnerabilities.",
        weight: poweredByLeaks ? 2 : 1,
      });
    }
  }

  // ─── NEW: Referrer-Policy ────────────────────────────────────────
  if (opts.headers && !opts.httpBlocked) {
    const referrerPolicy = (opts.headers["referrer-policy"] ?? "").toLowerCase();
    const goodPolicies = ["no-referrer", "strict-origin-when-cross-origin", "same-origin", "strict-origin"];
    if (goodPolicies.includes(referrerPolicy)) {
      findings.push({ signal: "referrer_policy", axis: "security", severity: "good", label: `Referrer-Policy: ${referrerPolicy}`, tradeoff: null, weight: 1 });
    } else if (referrerPolicy === "unsafe-url") {
      findings.push({ signal: "referrer_policy", axis: "security", severity: "medium", label: "Referrer-Policy: unsafe-url leaks full URLs cross-origin", tradeoff: null, weight: 2 });
    } else if (!referrerPolicy) {
      findings.push({ signal: "referrer_policy_missing", axis: "security", severity: "low", label: "No Referrer-Policy header", tradeoff: null, weight: 2 });
    }
  }

  // ─── NEW: Permissions-Policy ─────────────────────────────────────
  if (opts.headers && !opts.httpBlocked) {
    const permPolicy = opts.headers["permissions-policy"] ?? opts.headers["feature-policy"] ?? "";
    if (permPolicy) {
      findings.push({ signal: "permissions_policy", axis: "security", severity: "good", label: "Permissions-Policy header set", tradeoff: null, weight: 1 });
    } else {
      findings.push({ signal: "permissions_policy_missing", axis: "security", severity: "low", label: "No Permissions-Policy header", tradeoff: null, weight: 2 });
    }
  }

  // ─── NEW: HTTP→HTTPS Redirect ────────────────────────────────────
  if (opts.redirects.length > 0 && !opts.httpBlocked) {
    const firstUrl = opts.redirects[0]?.url ?? "";
    const lastUrl = opts.redirects[opts.redirects.length - 1]?.url ?? "";
    const startsHttp = firstUrl.startsWith("http://");
    const endsHttps = lastUrl.startsWith("https://");
    if (startsHttp && endsHttps) {
      findings.push({ signal: "http_to_https_redirect", axis: "security", severity: "good", label: "HTTP→HTTPS redirect in place", tradeoff: null, weight: 3 });
    } else if (opts.ssl?.grade && !startsHttp) {
      // Site has SSL but we can't confirm redirect (probe may have started on HTTPS)
      // No finding — don't penalize when we can't test
    } else if (opts.ssl?.grade && startsHttp && !endsHttps) {
      findings.push({
        signal: "no_http_to_https_redirect", axis: "security",
        severity: contextualSeverity("low", arch, { commerce: "medium", application: "medium" }),
        label: "No HTTP→HTTPS redirect detected",
        tradeoff: null, weight: 2,
      });
    }
  }

  // ─── Phase 2: Mixed Content Detection ───────────────────────────
  if (opts.html && !opts.httpBlocked && opts.ssl?.grade) {
    // Only relevant for HTTPS sites — check for http:// resources
    const httpResourcePattern = /(?:src|href)\s*=\s*["']http:\/\/(?!schema\.org|www\.w3\.org|xmlns\.com)[^"']+/gi;
    const httpResources = opts.html.match(httpResourcePattern) ?? [];
    if (httpResources.length > 0) {
      const activePattern = /<(?:script|iframe)[^>]+src\s*=\s*["']http:\/\/(?!schema\.org|www\.w3\.org)[^"']+/gi;
      const hasActive = activePattern.test(opts.html);
      if (hasActive) {
        findings.push({
          signal: "mixed_content", axis: "security",
          severity: contextualSeverity("medium", arch, { commerce: "high", application: "high" }),
          label: "Active mixed content — scripts or iframes loaded over HTTP",
          tradeoff: null, weight: 3,
        });
      } else {
        findings.push({
          signal: "mixed_content", axis: "security",
          severity: "low",
          label: `Passive mixed content — ${httpResources.length} resource(s) loaded over HTTP`,
          tradeoff: null, weight: 2,
        });
      }
    }
  }

  // ─── Phase 2: Subresource Integrity ──────────────────────────────
  if (opts.html && !opts.httpBlocked) {
    const scriptSrcPattern = /<script[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    const domainLowerSri = opts.domain.toLowerCase();
    let thirdPartyTotal = 0;
    let thirdPartyWithSri = 0;
    let sriMatch: RegExpExecArray | null;
    while ((sriMatch = scriptSrcPattern.exec(opts.html)) !== null) {
      const src = sriMatch[1];
      try {
        const srcHost = new URL(src, `https://${opts.domain}`).hostname.toLowerCase();
        if (srcHost !== domainLowerSri && !srcHost.endsWith(`.${domainLowerSri}`)) {
          thirdPartyTotal++;
          if (/integrity\s*=\s*["']sha/i.test(sriMatch[0])) {
            thirdPartyWithSri++;
          }
        }
      } catch { /* skip malformed URLs */ }
    }
    if (thirdPartyTotal >= 3) {
      if (thirdPartyWithSri === thirdPartyTotal) {
        findings.push({ signal: "subresource_integrity", axis: "security", severity: "good", label: `All ${thirdPartyTotal} third-party scripts have SRI`, tradeoff: null, weight: 2 });
      } else if (thirdPartyWithSri === 0) {
        findings.push({
          signal: "subresource_integrity_missing", axis: "security",
          severity: contextualSeverity("info", arch, { commerce: "low", application: "low" }),
          label: `${thirdPartyTotal} third-party scripts without SRI`,
          tradeoff: "SRI ensures CDN-hosted scripts haven't been tampered with.",
          weight: 1,
        });
      } else {
        findings.push({ signal: "subresource_integrity_partial", axis: "security", severity: "info", label: `${thirdPartyWithSri}/${thirdPartyTotal} third-party scripts have SRI`, tradeoff: null, weight: 1 });
      }
    }
  }

  // ─── Phase 2: Form Action Security ──────────────────────────────
  if (opts.html && !opts.httpBlocked) {
    const formActionPattern = /<form[^>]+action\s*=\s*["']http:\/\/[^"']+["']/gi;
    const insecureForms = opts.html.match(formActionPattern) ?? [];
    if (insecureForms.length > 0) {
      findings.push({
        signal: "form_action_security", axis: "security",
        severity: contextualSeverity("medium", arch, { commerce: "high", application: "high" }),
        label: `${insecureForms.length} form(s) post to HTTP — data sent in plaintext`,
        tradeoff: null, weight: 3,
      });
    }
  }

  // CSP report-only removed — only 6 domains, zero discrimination

  // ─── Phase 3: MTA-STS (email transport security) ────────────────
  if (opts.emailAuth?.mta_sts) {
    const mta = opts.emailAuth.mta_sts;
    if (mta.policy_found && mta.mode === "enforce") {
      findings.push({ signal: "mta_sts", axis: "security", severity: "good", label: "MTA-STS enforced — email transport protected from downgrade attacks", tradeoff: null, weight: 1 });
    } else if (mta.policy_found && mta.mode === "testing") {
      findings.push({ signal: "mta_sts", axis: "security", severity: "info", label: "MTA-STS in testing mode", tradeoff: null, weight: 1 });
    }
  }

  // ─── Security Headers Completeness (meta-signal) ────────────────
  if (!opts.httpBlocked && opts.headers) {
    const secHeaders = [
      "strict-transport-security",
      "content-security-policy",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
    ];
    const deployedCount = secHeaders.filter(h => !!opts.headers![h]).length;
    const sev: Severity = deployedCount >= 6 ? "good" : deployedCount >= 4 ? "info" : deployedCount >= 2 ? "low" : "medium";
    findings.push({
      signal: "security_headers_completeness", axis: "security",
      severity: sev,
      label: `${deployedCount}/6 security headers deployed`,
      tradeoff: null, weight: 2,
    });
  }

  // ─── CSP Quality Gradation ──────────────────────────────────────
  if (!opts.httpBlocked && opts.headers) {
    const cspHeader = opts.headers["content-security-policy"] ?? "";
    if (cspHeader) {
      const hasUnsafeInline = /unsafe-inline/i.test(cspHeader);
      const hasUnsafeEval = /unsafe-eval/i.test(cspHeader);
      const hasWildcard = /(?:^|[\s;])(?:default-src|script-src)\s+[^;]*\*/i.test(cspHeader);
      const hasDefaultSrc = /default-src/i.test(cspHeader);

      if (hasUnsafeInline || hasUnsafeEval || hasWildcard) {
        findings.push({
          signal: "csp_quality", axis: "security",
          severity: "low",
          label: `CSP present but permissive (${[hasUnsafeInline && "unsafe-inline", hasUnsafeEval && "unsafe-eval", hasWildcard && "wildcard"].filter(Boolean).join(", ")})`,
          tradeoff: "Tightening CSP may break inline scripts or third-party integrations.",
          weight: 2,
        });
      } else if (hasDefaultSrc) {
        findings.push({
          signal: "csp_quality", axis: "security",
          severity: "good",
          label: "CSP is restrictive (no unsafe-* or wildcards)",
          tradeoff: null, weight: 2,
        });
      } else {
        findings.push({
          signal: "csp_quality", axis: "security",
          severity: "info",
          label: "CSP present but missing default-src directive",
          tradeoff: null, weight: 2,
        });
      }
    }
    // No CSP = skip (handled by csp_missing above)
  }

  // ─── Vulnerable JavaScript Libraries ────────────────────────────
  if (opts.html && !opts.httpBlocked) {
    const vulnResults = scanForVulnerableLibraries(opts.html);
    if (vulnResults.length > 0) {
      const hasHighSev = vulnResults.some(v => v.severity === "high" || v.severity === "critical");
      const labels = vulnResults.slice(0, 3).map(v =>
        `${v.library} ${v.version}${v.eol ? " (EOL)" : ""}${v.cves.length ? ` — ${v.cves[0]}` : ""}`
      );
      const extra = vulnResults.length > 3 ? ` (+${vulnResults.length - 3} more)` : "";
      findings.push({
        signal: "vulnerable_js_libraries", axis: "security",
        severity: vulnResults.length >= 3 ? "high" : hasHighSev ? "medium" : "medium",
        label: `Vulnerable JS: ${labels.join("; ")}${extra}`,
        tradeoff: "Upgrading libraries may require code changes for breaking API differences.",
        weight: 3,
      });
    } else {
      findings.push({
        signal: "vulnerable_js_libraries", axis: "security",
        severity: "good",
        label: "No known vulnerable JavaScript libraries detected",
        tradeoff: null, weight: 1,
      });
    }
  }

  // ─── TLS Protocol Version ──────────────────────────────────────
  if (opts.ssl && opts.ssl.protocols && opts.ssl.protocols.length > 0) {
    const protocols = opts.ssl.protocols.map(p => p.toLowerCase());
    const hasTls13 = protocols.some(p => p.includes("1.3"));
    const hasTls12 = protocols.some(p => p.includes("1.2"));
    const hasOldTls = protocols.some(p => p.includes("1.0") || p.includes("1.1") || p.includes("ssl"));

    if (hasOldTls) {
      findings.push({ signal: "tls_version", axis: "security", severity: "high", label: "Legacy TLS (1.0/1.1) still supported — vulnerable to downgrade attacks", tradeoff: "Disabling old TLS may drop support for very old clients.", weight: 3 });
    } else if (hasTls13 && !hasTls12) {
      findings.push({ signal: "tls_version", axis: "security", severity: "good", label: "TLS 1.3 only — best available encryption", tradeoff: null, weight: 2 });
    } else if (hasTls13) {
      findings.push({ signal: "tls_version", axis: "security", severity: "good", label: "TLS 1.3 + 1.2 supported", tradeoff: null, weight: 2 });
    } else if (hasTls12) {
      findings.push({ signal: "tls_version", axis: "security", severity: "info", label: "TLS 1.2 only (no TLS 1.3)", tradeoff: null, weight: 1 });
    }
  }

  // ─── HSTS Max-Age Strength ──────────────────────────────────────
  if (opts.headers && !opts.httpBlocked) {
    const hstsHeader = opts.headers["strict-transport-security"] ?? "";
    const maxAgeMatch = hstsHeader.match(/max-age\s*=\s*(\d+)/i);
    if (maxAgeMatch) {
      const maxAge = parseInt(maxAgeMatch[1], 10);
      if (maxAge >= 31536000) { // 1 year
        findings.push({ signal: "hsts_max_age", axis: "security", severity: "good", label: `HSTS max-age ≥1 year (${Math.floor(maxAge / 86400)}d)`, tradeoff: null, weight: 1 });
      } else if (maxAge >= 15768000) { // ~6 months
        findings.push({ signal: "hsts_max_age", axis: "security", severity: "info", label: `HSTS max-age ~6 months`, tradeoff: null, weight: 1 });
      } else if (maxAge >= 86400) { // 1 day
        findings.push({ signal: "hsts_max_age", axis: "security", severity: "low", label: `HSTS max-age too short (${Math.floor(maxAge / 86400)}d)`, tradeoff: null, weight: 1 });
      } else {
        findings.push({ signal: "hsts_max_age", axis: "security", severity: "medium", label: `HSTS max-age extremely short (${maxAge}s)`, tradeoff: null, weight: 2 });
      }
    }
  }

  // ─── Certificate Expiry Proximity ───────────────────────────────
  if (opts.ssl?.valid_to) {
    try {
      const expiryDate = new Date(opts.ssl.valid_to);
      const now = new Date();
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry < 1) {
        findings.push({ signal: "cert_expiry_proximity", axis: "security", severity: "critical", label: "SSL certificate expired or expiring today", tradeoff: null, weight: 4 });
      } else if (daysUntilExpiry < 7) {
        findings.push({ signal: "cert_expiry_proximity", axis: "security", severity: "high", label: `SSL certificate expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? "s" : ""}`, tradeoff: null, weight: 3 });
      } else if (daysUntilExpiry < 30) {
        findings.push({ signal: "cert_expiry_proximity", axis: "security", severity: "low", label: `SSL certificate expires in ${daysUntilExpiry} days`, tradeoff: null, weight: 2 });
      } else if (daysUntilExpiry < 90) {
        findings.push({ signal: "cert_expiry_proximity", axis: "security", severity: "info", label: `SSL certificate expires in ${daysUntilExpiry} days`, tradeoff: null, weight: 1 });
      } else {
        findings.push({ signal: "cert_expiry_proximity", axis: "security", severity: "good", label: `SSL certificate valid for ${daysUntilExpiry}+ days`, tradeoff: null, weight: 1 });
      }
    } catch { /* invalid date — skip */ }
  }

  // ─── Cross-Origin Isolation Headers ─────────────────────────────
  if (opts.headers && !opts.httpBlocked) {
    const hasCoop = !!opts.headers["cross-origin-opener-policy"];
    const hasCoep = !!opts.headers["cross-origin-embedder-policy"];
    const hasCorp = !!opts.headers["cross-origin-resource-policy"];
    const coiCount = [hasCoop, hasCoep, hasCorp].filter(Boolean).length;
    if (coiCount === 3) {
      findings.push({ signal: "cross_origin_isolation", axis: "security", severity: "good", label: "Full cross-origin isolation (COOP+COEP+CORP)", tradeoff: null, weight: 1 });
    } else if (coiCount >= 1) {
      findings.push({ signal: "cross_origin_isolation", axis: "security", severity: "info", label: `Partial cross-origin isolation (${coiCount}/3 headers)`, tradeoff: null, weight: 1 });
    }
    // None = skip (too rare to penalize)
  }

  // Trust meta-signals removed — trust_strong/trust_moderate were double-counting
  // underlying signals already scored individually, inflating Trust axis by ~15 points.
  if (opts.trustSignals) {
    // DMARC enforcement — bidirectional: reward reject, penalize weak/absent
    const dmarcRejecting = opts.trustSignals.signals.some(s => s.name === "DMARC Enforcement" && s.present && s.value?.includes("reject"));
    if (dmarcRejecting) {
      findings.push({ signal: "dmarc_reject", axis: "trust", severity: "good", label: "DMARC policy=reject prevents email spoofing", tradeoff: null, weight: 2 });
    } else if (opts.emailAuth?.dmarc?.found) {
      const policy = opts.emailAuth.dmarc.policy;
      if (policy === "quarantine") {
        findings.push({ signal: "dmarc_reject", axis: "trust", severity: "info", label: "DMARC policy=quarantine — partial email protection", tradeoff: "Upgrade to p=reject for full spoofing prevention.", weight: 2 });
      } else {
        // p=none or unrecognized
        findings.push({ signal: "dmarc_reject", axis: "trust", severity: "low", label: "DMARC policy=none — monitoring only, no protection", tradeoff: "Move to quarantine/reject once reports look clean.", weight: 2 });
      }
    } else {
      // No DMARC at all
      findings.push({ signal: "dmarc_reject", axis: "trust", severity: "medium", label: "No DMARC — domain vulnerable to email spoofing", tradeoff: null, weight: 2 });
    }

    // Operational transparency bonus
    const opsSignals = opts.trustSignals.signals.filter(s => s.category === "operational" && s.present);
    if (opsSignals.length >= 2) {
      findings.push({ signal: "ops_transparency", axis: "trust", severity: "good", label: `${opsSignals.length} operational transparency tools (status page, monitoring, etc.)`, tradeoff: null, weight: 2 });
    }
  }

  // ─── Performance Axis Findings ───────────────────────────────────

  const perf = opts.performance;           // PSI mobile (always present)
  const perfDesktop = opts.performanceDesktop;  // PSI desktop (new)
  const crux = opts.crux;                  // CrUX field data (new)

  // Determine the primary performance score source
  // Priority: CrUX field data > blended lab > mobile-only lab
  const hasCrux = crux && crux.has_data;
  const hasMobile = perf && perf.score != null;
  const hasDesktop = perfDesktop && perfDesktop.score != null;

  if (hasCrux) {
    // ── CrUX field data available — use real user metrics ──
    findings.push({ signal: "crux_field_data", axis: "performance", severity: "good", label: "Real-user field data available (Chrome UX Report)", tradeoff: null, weight: 1 });

    // Derive a synthetic performance score from CrUX p75 values using Google's thresholds
    // LCP: good ≤2500ms, poor >4000ms
    // FCP: good ≤1800ms, poor >3000ms
    // CLS: good ≤0.1, poor >0.25
    // INP: good ≤200ms, poor >500ms
    // TTFB: good ≤800ms, poor >1800ms
    const cruxScores: number[] = [];
    if (crux.lcp_p75 != null) cruxScores.push(crux.lcp_p75 <= 2500 ? 95 : crux.lcp_p75 <= 4000 ? 70 : 30);
    if (crux.fcp_p75 != null) cruxScores.push(crux.fcp_p75 <= 1800 ? 95 : crux.fcp_p75 <= 3000 ? 70 : 30);
    if (crux.cls_p75 != null) cruxScores.push(crux.cls_p75 <= 0.1 ? 95 : crux.cls_p75 <= 0.25 ? 70 : 30);
    if (crux.inp_p75 != null) cruxScores.push(crux.inp_p75 <= 200 ? 95 : crux.inp_p75 <= 500 ? 70 : 30);
    if (crux.ttfb_p75 != null) cruxScores.push(crux.ttfb_p75 <= 800 ? 95 : crux.ttfb_p75 <= 1800 ? 70 : 30);

    if (cruxScores.length > 0) {
      const avgScore = Math.round(cruxScores.reduce((a, b) => a + b, 0) / cruxScores.length);
      const ps = resolveSeverity(PERF_SCORE, avgScore);
      const psSev = avgScore >= 80 ? ps.severity : contextualSeverity(ps.severity, arch, avgScore >= 50 ? { content: "high" } : {});
      findings.push({ signal: PERF_SCORE.signal, axis: "performance", severity: psSev, label: `Performance score ${avgScore}/100 (field data)`, tradeoff: null, weight: PERF_SCORE.weight, source: "Chrome UX Report (real users)" });
    }

    // Individual CrUX metrics
    if (crux.lcp_p75 != null) {
      const lcpSec = crux.lcp_p75 / 1000;
      const lcp = resolveSeverity(LCP, lcpSec);
      findings.push({ signal: LCP.signal, axis: "performance", severity: lcp.severity, label: `LCP: ${lcpSec.toFixed(1)}s (p75 field)`, tradeoff: null, weight: LCP.weight, source: "CrUX" });
    }
    if (crux.cls_p75 != null) {
      const cls = resolveSeverity(CLS, crux.cls_p75);
      findings.push({ signal: CLS.signal, axis: "performance", severity: cls.severity, label: `CLS: ${crux.cls_p75.toFixed(3)} (p75 field)`, tradeoff: null, weight: CLS.weight, source: "CrUX" });
    }
    if (crux.ttfb_p75 != null) {
      const ttfb = resolveSeverity(TTFB, crux.ttfb_p75);
      findings.push({ signal: TTFB.signal, axis: "performance", severity: ttfb.severity, label: `TTFB: ${Math.round(crux.ttfb_p75)}ms (p75 field)`, tradeoff: null, weight: TTFB.weight, source: "CrUX" });
    }
    if (crux.fcp_p75 != null) {
      const fcpSec = crux.fcp_p75 / 1000;
      const fcpSev: Severity = fcpSec < 1.8 ? "good" : fcpSec < 3.0 ? "low" : "medium";
      findings.push({ signal: "fcp", axis: "performance", severity: fcpSev, label: `FCP: ${fcpSec.toFixed(1)}s (p75 field)`, tradeoff: null, weight: 2, source: "CrUX" });
    }
    if (crux.inp_p75 != null) {
      // INP (Interaction to Next Paint) — Core Web Vital, only from CrUX
      const inpSev: Severity = crux.inp_p75 <= 200 ? "good" : crux.inp_p75 <= 500 ? "low" : "medium";
      findings.push({ signal: "inp", axis: "performance", severity: inpSev, label: `INP: ${Math.round(crux.inp_p75)}ms (p75 field)`, tradeoff: null, weight: 3, source: "CrUX — Interaction to Next Paint" });
    }
  } else if (hasMobile || hasDesktop) {
    // ── No CrUX — use lab data ──
    // Blend desktop (60%) + mobile (40%) if both available, otherwise use whichever exists
    let blendedScore: number;
    let sourceLabel: string;
    if (hasMobile && hasDesktop) {
      blendedScore = Math.round(perfDesktop!.score! * 0.6 + perf!.score! * 0.4);
      sourceLabel = "Lighthouse lab (desktop 60% + mobile 40%)";
    } else if (hasDesktop) {
      blendedScore = perfDesktop!.score!;
      sourceLabel = "Lighthouse lab (desktop)";
    } else {
      blendedScore = perf!.score!;
      sourceLabel = "Lighthouse lab (mobile)";
    }

    const ps = resolveSeverity(PERF_SCORE, blendedScore);
    const psSev = blendedScore >= 80 ? ps.severity : contextualSeverity(ps.severity, arch, blendedScore >= 50 ? { content: "high" } : {});
    findings.push({ signal: PERF_SCORE.signal, axis: "performance", severity: psSev, label: `Performance score ${blendedScore}/100`, tradeoff: null, weight: PERF_SCORE.weight, source: sourceLabel });

    // Use desktop metrics as primary when available (closer to real usage), fallback to mobile
    const primaryPerf = hasDesktop ? perfDesktop! : perf!;

    // LCP
    if (primaryPerf.lcp != null) {
      const lcpSec = primaryPerf.lcp / 1000;
      const lcp = resolveSeverity(LCP, lcpSec);
      findings.push({ signal: LCP.signal, axis: "performance", severity: lcp.severity, label: `LCP: ${lcpSec.toFixed(1)}s`, tradeoff: null, weight: LCP.weight, source: LCP.source });
    }

    // CLS
    if (primaryPerf.cls != null) {
      const cls = resolveSeverity(CLS, primaryPerf.cls);
      findings.push({ signal: CLS.signal, axis: "performance", severity: cls.severity, label: `CLS: ${primaryPerf.cls.toFixed(3)}`, tradeoff: null, weight: CLS.weight, source: CLS.source });
    }

    // TTFB
    if (primaryPerf.ttfb != null) {
      const ttfb = resolveSeverity(TTFB, primaryPerf.ttfb);
      findings.push({ signal: TTFB.signal, axis: "performance", severity: ttfb.severity, label: `TTFB: ${Math.round(primaryPerf.ttfb)}ms`, tradeoff: null, weight: TTFB.weight, source: TTFB.source });
    }

    // TBT (Total Blocking Time) — JS execution blocking metric (lab only)
    if (primaryPerf.tbt != null) {
      const tbtMs = primaryPerf.tbt;
      const tbtSev: Severity = tbtMs < 200 ? "good" : tbtMs < 600 ? "low" : "medium";
      findings.push({
        signal: "tbt", axis: "performance",
        severity: tbtSev,
        label: `TBT: ${Math.round(tbtMs)}ms${tbtMs >= 600 ? " — excessive JS blocking" : ""}`,
        tradeoff: null, weight: 2,
      });
    }

    // FCP (First Contentful Paint) — initial rendering speed
    if (primaryPerf.fcp != null) {
      const fcpSec = primaryPerf.fcp / 1000;
      const fcpSev: Severity = fcpSec < 1.8 ? "good" : fcpSec < 3.0 ? "low" : "medium";
      findings.push({
        signal: "fcp", axis: "performance",
        severity: fcpSev,
        label: `FCP: ${fcpSec.toFixed(1)}s`,
        tradeoff: null, weight: 2,
      });
    }
  } else if (perf && perf.error) {
    // PageSpeed unavailable — don't penalize, but acknowledge the gap
    // This prevents score inflation when PageSpeed data is missing
    findings.push({ signal: "pagespeed_unavailable", axis: "performance", severity: "low", label: "PageSpeed Insights unavailable", tradeoff: null, weight: 2 });
  }

  // Compression — removed: 275/275 = good, zero discrimination
  // Keep no_compression penalty only
  if (opts.compression) {
    if (!opts.compression.encoding && !opts.httpBlocked) {
      findings.push({ signal: "no_compression", axis: "performance", severity: "medium", label: "No compression detected", tradeoff: null, weight: 2 });
    }
  }

  // Cache headers
  if (opts.cacheAnalysis && !opts.httpBlocked) {
    const cv = opts.cacheAnalysis.verdict;
    if (cv === "excellent" || cv === "good") {
      findings.push({ signal: "cache_headers", axis: "performance", severity: "good", label: opts.cacheAnalysis.verdict_label, tradeoff: null, weight: 3 });
    } else if (cv === "fair") {
      findings.push({ signal: "cache_headers", axis: "performance", severity: "info", label: opts.cacheAnalysis.verdict_label, tradeoff: null, weight: 3 });
    } else if (cv === "poor") {
      findings.push({ signal: "cache_headers", axis: "performance", severity: contextualSeverity("low", arch, { commerce: "medium", content: "medium" }), label: opts.cacheAnalysis.verdict_label, tradeoff: "Aggressive caching may serve stale content to users.", weight: 3 });
    } else if (cv === "none") {
      findings.push({ signal: "cache_headers", axis: "performance", severity: contextualSeverity("low", arch, { commerce: "medium", content: "medium" }), label: "No cache headers — browsers use heuristic caching", tradeoff: null, weight: 3 });
    }
  }

  // HTTP/2+
  if (opts.httpProtocols) {
    if (opts.httpProtocols.http3) {
      findings.push({ signal: "http3", axis: "performance", severity: "good", label: "HTTP/3 supported", tradeoff: null, weight: 2 });
    } else if (opts.httpProtocols.http2) {
      findings.push({ signal: "http2", axis: "performance", severity: "info", label: "HTTP/2 supported", tradeoff: null, weight: 2 });
    } else {
      findings.push({ signal: "http1_only", axis: "performance", severity: "medium", label: "HTTP/1.1 only", tradeoff: null, weight: 2 });
    }
  }

  // CDN
  if (opts.hosting?.cdn) {
    findings.push({ signal: "cdn", axis: "performance", severity: "good", label: `CDN: ${opts.hosting.cdn}`, tradeoff: null, weight: 2 });
  }

  // ─── NEW: Redirect Chain Length ──────────────────────────────────
  if (opts.redirects.length > 0) {
    const hops = opts.redirects.length;
    if (hops >= 4) {
      findings.push({
        signal: "redirect_chain_length", axis: "performance",
        severity: "medium",
        label: `${hops} redirect hops — excessive latency`,
        tradeoff: null, weight: 2,
      });
    } else if (hops >= 2) {
      findings.push({
        signal: "redirect_chain_length", axis: "performance",
        severity: "info",
        label: `${hops} redirect hops`,
        tradeoff: null, weight: 1,
      });
    }
  }

  // ─── Reliability Axis Findings ───────────────────────────────────

  const dns = opts.dnsRecords;

  // NS redundancy
  const nsCount = dns.filter(r => r.type === "NS").length;
  findings.push({
    signal: "ns_redundancy", axis: "reliability",
    severity: nsCount >= 4 ? "good" : nsCount >= 2 ? "info" : "medium",
    label: `${nsCount} nameserver${nsCount !== 1 ? "s" : ""}`,
    tradeoff: null, weight: 4,
  });

  // MX records
  const mxCount = dns.filter(r => r.type === "MX").length;
  if (mxCount > 0) {
    findings.push({
      signal: "mx_redundancy", axis: "reliability",
      severity: mxCount >= 2 ? "good" : "info",
      label: `${mxCount} MX record${mxCount !== 1 ? "s" : ""}`,
      tradeoff: null, weight: 2,
    });
  }

  // IPv6
  const hasIpv6 = dns.some(r => r.type === "AAAA");
  findings.push({
    signal: "ipv6", axis: "reliability",
    severity: hasIpv6 ? "good" : "low",
    label: hasIpv6 ? "IPv6 supported" : "No IPv6 (AAAA) records",
    tradeoff: null, weight: 3,
  });

  // Multiple A records (load balancing)
  const aCount = dns.filter(r => r.type === "A").length;
  if (aCount >= 2) {
    findings.push({ signal: "lb", axis: "reliability", severity: "good", label: `${aCount} A records (load balanced)`, tradeoff: null, weight: 1 });
  }

  // CAA records
  const hasCaa = dns.some(r => r.type === "CAA");
  findings.push({
    signal: "caa", axis: "reliability",
    severity: hasCaa ? "good" : "info",
    label: hasCaa ? "CAA records present" : "No CAA records",
    tradeoff: null, weight: 1,
  });

  // DNS TTL health — very low TTLs may indicate instability or aggressive failover
  const aRecords = dns.filter(r => r.type === "A" || r.type === "AAAA");
  if (aRecords.length > 0) {
    const minTtl = Math.min(...aRecords.map(r => r.ttl));
    if (minTtl < 60) {
      findings.push({
        signal: "low_ttl", axis: "reliability",
        severity: "info",
        label: `Very low DNS TTL (${minTtl}s) — may indicate instability or aggressive failover`,
        tradeoff: "Low TTLs enable fast failover but increase DNS query volume and latency.",
        weight: 1,
      });
    }
    // stable_ttl removed — only 24 domains, good-only, no discrimination
  }

  // soa_present removed — 361/361 = good, every domain has SOA, zero discrimination

  // ─── TCP Connection Time ────────────────────────────────────────
  if (opts.networkHealth?.connection_timing) {
    const tcpMs = opts.networkHealth.connection_timing.tcp_ms;
    if (tcpMs < 100) {
      findings.push({ signal: "tcp_connection_time", axis: "reliability", severity: "good", label: `TCP connect: ${Math.round(tcpMs)}ms`, tradeoff: null, weight: 2 });
    } else if (tcpMs < 300) {
      findings.push({ signal: "tcp_connection_time", axis: "reliability", severity: "info", label: `TCP connect: ${Math.round(tcpMs)}ms`, tradeoff: null, weight: 2 });
    } else if (tcpMs < 1000) {
      findings.push({ signal: "tcp_connection_time", axis: "reliability", severity: "low", label: `TCP connect: ${Math.round(tcpMs)}ms — above average`, tradeoff: "Connection timing depends on server location relative to probe.", weight: 2 });
    } else {
      findings.push({ signal: "tcp_connection_time", axis: "reliability", severity: "medium", label: `TCP connect: ${Math.round(tcpMs)}ms — very slow`, tradeoff: null, weight: 2 });
    }
  }

  // ─── DNS Resolution Time ────────────────────────────────────────
  if (opts.networkHealth?.connection_timing) {
    const dnsMs = opts.networkHealth.connection_timing.dns_ms;
    if (dnsMs < 50) {
      findings.push({ signal: "dns_resolution_time", axis: "reliability", severity: "good", label: `DNS resolution: ${Math.round(dnsMs)}ms`, tradeoff: null, weight: 2 });
    } else if (dnsMs < 150) {
      findings.push({ signal: "dns_resolution_time", axis: "reliability", severity: "info", label: `DNS resolution: ${Math.round(dnsMs)}ms`, tradeoff: null, weight: 2 });
    } else if (dnsMs < 500) {
      findings.push({ signal: "dns_resolution_time", axis: "reliability", severity: "low", label: `DNS resolution: ${Math.round(dnsMs)}ms — slow`, tradeoff: null, weight: 2 });
    } else {
      findings.push({ signal: "dns_resolution_time", axis: "reliability", severity: "medium", label: `DNS resolution: ${Math.round(dnsMs)}ms — very slow`, tradeoff: null, weight: 2 });
    }
  }

  // ─── NS Provider Diversity ──────────────────────────────────────
  {
    const nsRecords = dns.filter(r => r.type === "NS").map(r => r.data);
    if (nsRecords.length >= 2) {
      const nsDiversity = analyzeNsDiversity(nsRecords);
      if (nsDiversity.isMultiProvider) {
        findings.push({
          signal: "ns_provider_diversity", axis: "reliability",
          severity: "good",
          label: `Multi-provider DNS (${nsDiversity.providers.join(", ")})`,
          tradeoff: null, weight: 1,
        });
      } else if (nsDiversity.providers.length === 1) {
        findings.push({
          signal: "ns_provider_diversity", axis: "reliability",
          severity: "info",
          label: `Single DNS provider: ${nsDiversity.providers[0]}`,
          tradeoff: "Multi-provider DNS improves resilience against provider outages.",
          weight: 1,
        });
      }
      // Unrecognized providers = skip
    }
  }

  // ─── NEW: Site Unreachable ───────────────────────────────────────
  // DNS resolves but no HTTP server responds — fundamentally broken
  const dnsResolves = dns.some(r => r.type === "A" || r.type === "AAAA");
  if (opts.statusResult) {
    if (!opts.statusResult.is_up && dnsResolves && !opts.statusResult.http_blocked) {
      findings.push({
        signal: "site_unreachable", axis: "reliability",
        severity: "high",
        label: "Site unreachable — DNS resolves but no HTTP response",
        tradeoff: null, weight: 5,
      });
      // Also tank Visibility — an unreachable site has zero web visibility
      findings.push({
        signal: "site_unreachable_visibility", axis: "visibility",
        severity: "critical",
        label: "Site unreachable — zero web visibility",
        tradeoff: null, weight: 5,
      });
      // Also tank Performance — cannot measure performance of an unreachable site
      findings.push({
        signal: "site_unreachable_performance", axis: "performance",
        severity: "critical",
        label: "Site unreachable — cannot measure performance",
        tradeoff: null, weight: 5,
      });
    }
  }

  // ─── HTTP Blocked (RESTRICTED) — analysis is incomplete ──────────
  // The site is up but blocked our probe, so we can't assess headers, content, etc.
  if (opts.statusResult && opts.statusResult.http_blocked) {
    findings.push({
      signal: "http_blocked_reliability", axis: "reliability",
      severity: "medium",
      label: "HTTP probe blocked — analysis is limited",
      tradeoff: "Site may be blocking automated requests. Scoring is based on DNS/WHOIS/SSL data only.",
      weight: 3,
    });
    // Can't trust performance data if we couldn't fetch the page
    if (!opts.pagespeed) {
      findings.push({
        signal: "http_blocked_performance", axis: "performance",
        severity: "medium",
        label: "Cannot measure performance — HTTP blocked",
        tradeoff: null, weight: 4,
      });
    }
    // Security headers are unknown
    findings.push({
      signal: "http_blocked_security", axis: "security",
      severity: "medium",
      label: "Security headers unknown — HTTP blocked",
      tradeoff: "Cannot audit CSP, HSTS, or other headers without HTTP access.",
      weight: 3,
    });
  }

  // ─── NEW: HTTP Error Response ────────────────────────────────────
  // Server responds but with error codes
  if (opts.statusResult && opts.statusResult.status_code != null && opts.statusResult.status_code >= 400) {
    const code = opts.statusResult.status_code;
    const isWafBlock = (code === 403 || code === 429) && opts.waf?.detected;
    if (!isWafBlock) {
      if (code >= 500) {
        findings.push({
          signal: "http_error_response", axis: "reliability",
          severity: "high",
          label: `Server error (HTTP ${code})`,
          tradeoff: null, weight: 4,
        });
      } else {
        findings.push({
          signal: "http_error_response", axis: "reliability",
          severity: "medium",
          label: `Client error response (HTTP ${code})`,
          tradeoff: "Some sites return 4xx to automated probes while working fine in browsers.",
          weight: 3,
        });
      }
    }
  }

  // ─── Trust Axis Findings ─────────────────────────────────────────

  // Domain age (trust signal — graduated thresholds, 10yr+ for "good")
  // Palo Alto: ≤32d = NRD; CF Email: 7d malicious, 30-45d suspicious; NextDNS: 30d block
  const ageDays = opts.rdap?.domain_age_days;
  if (ageDays != null) {
    const severity = ageDays > 365 * 10 ? "good"
      : ageDays > 365 * 5 ? "info"
      : ageDays > 365 * 3 ? "low"
      : ageDays > 365 ? "low"
      : ageDays > 90 ? "medium"
      : ageDays > 30 ? "high"
      : "critical";
    const label = ageDays > 365 * 10 ? `Established domain (${Math.floor(ageDays / 365)}+ years)`
      : ageDays > 365 * 5 ? `Mature domain (${Math.floor(ageDays / 365)}+ years)`
      : ageDays > 365 * 3 ? `Domain age: ${Math.floor(ageDays / 365)}+ years`
      : ageDays > 365 ? `Domain age: ${Math.floor(ageDays / 365)}+ years`
      : ageDays > 90 ? `Young domain (${ageDays} days)`
      : ageDays > 30 ? `Recently registered (${ageDays} days)`
      : `Newly registered domain (${ageDays} days) — high risk NRD`;
    findings.push({
      signal: "domain_age_trust", axis: "trust",
      severity, label, tradeoff: null, weight: 3,
    });
  }

  // Registration length remaining — 1 year is normal/neutral, only reward long or flag near-expiry
  const expiryDays = opts.rdap?.days_until_expiry;
  if (expiryDays != null) {
    const years = Math.floor(expiryDays / 365);
    findings.push({
      signal: "registration_length", axis: "trust",
      severity: expiryDays > 730 ? "good" : expiryDays > 30 ? "info" : expiryDays > 7 ? "low" : "medium",
      label: expiryDays > 730 ? `Registration good for ${years}+ years` : expiryDays > 30 ? `Expires in ${expiryDays} days` : `Expiring soon (${expiryDays} days)`,
      tradeoff: null, weight: 2,
    });
  }

  // Blocklist clean (also trust) — "not blocklisted" is neutral, not positive
  findings.push({
    signal: "blocklist_trust", axis: "trust",
    severity: listedCount === 0 ? "info" : listedCount >= 2 ? "critical" : "high",
    label: listedCount === 0 ? "Clean blocklist record" : `On ${listedCount} blocklist(s)`,
    tradeoff: null, weight: listedCount === 0 ? 2 : 3,
  });

  // GreyNoise
  if (opts.greynoise) {
    if (opts.greynoise.noise) {
      findings.push({ signal: "greynoise_noise", axis: "trust", severity: "medium", label: "IP flagged as internet noise by GreyNoise", tradeoff: null, weight: 2 });
    } else if (opts.greynoise.riot) {
      findings.push({ signal: "greynoise_riot", axis: "trust", severity: "good", label: "IP is a known service (GreyNoise RIOT)", tradeoff: null, weight: 2 });
    }
  }

  // Data breaches (HIBP) — major trust signal
  if (opts.breaches && opts.breaches.found && !opts.breaches.check_failed) {
    const bc = opts.breaches.count;
    const totalPwned = opts.breaches.total_pwned;
    const hasVerified = opts.breaches.items.some(b => b.is_verified);

    if (totalPwned > 10_000_000) {
      findings.push({
        signal: "breaches", axis: "trust",
        severity: "high",
        label: `${bc} data breach${bc !== 1 ? "es" : ""} (${(totalPwned / 1_000_000).toFixed(0)}M+ accounts)`,
        tradeoff: "Historical breaches reflect past security incidents, not necessarily current posture.",
        weight: 4,
      });
    } else if (totalPwned > 1_000_000 || (bc >= 3 && hasVerified)) {
      findings.push({
        signal: "breaches", axis: "trust",
        severity: "medium",
        label: `${bc} data breach${bc !== 1 ? "es" : ""} (${totalPwned.toLocaleString()} accounts)`,
        tradeoff: "Historical breaches reflect past security incidents, not necessarily current posture.",
        weight: 3,
      });
    } else if (bc >= 1 && hasVerified) {
      findings.push({
        signal: "breaches", axis: "trust",
        severity: "low",
        label: `${bc} verified data breach${bc !== 1 ? "es" : ""}`,
        tradeoff: "Historical breaches reflect past security incidents, not necessarily current posture.",
        weight: 2,
      });
    } else if (bc >= 1) {
      findings.push({
        signal: "breaches", axis: "trust",
        severity: "info",
        label: `${bc} unverified data breach report${bc !== 1 ? "s" : ""}`,
        tradeoff: null,
        weight: 1,
      });
    }
  }

  // Tranco web ranking — popularity/reputation signal
  if (opts.trancoRank != null) {
    if (opts.trancoRank <= 1000) {
      findings.push({ signal: "tranco_rank", axis: "trust", severity: "good", label: `Tranco top 1K (#${opts.trancoRank.toLocaleString()})`, tradeoff: null, weight: 3 });
    } else if (opts.trancoRank <= 10000) {
      findings.push({ signal: "tranco_rank", axis: "trust", severity: "good", label: `Tranco top 10K (#${opts.trancoRank.toLocaleString()})`, tradeoff: null, weight: 2 });
    } else if (opts.trancoRank <= 100000) {
      findings.push({ signal: "tranco_rank", axis: "trust", severity: "info", label: `Tranco top 100K (#${opts.trancoRank.toLocaleString()})`, tradeoff: null, weight: 1 });
    }
    // Unranked = no finding (neutral, no penalty)
  } else {
    // No Tranco rank — neutral, no penalty (most legitimate domains aren't top 1M)
  }

  // Email auth completeness (trust signal — bidirectional: penalize incomplete, reward complete)
  if (opts.emailAuth) {
    const hasSpf = opts.emailAuth.spf.found;
    const hasDmarc = opts.emailAuth.dmarc.found;
    const hasDkim = opts.emailAuth.dkim_selectors_found.length > 0;
    const complete = hasSpf && hasDmarc && hasDkim;
    if (complete) {
      findings.push({
        signal: "email_trust", axis: "trust",
        severity: "good",
        label: "Complete email authentication",
        tradeoff: null, weight: 3,
      });
    } else if (!hasSpf && !hasDmarc && !hasDkim) {
      findings.push({
        signal: "email_trust", axis: "trust",
        severity: "high",
        label: "No email authentication (missing SPF, DKIM, DMARC)",
        tradeoff: null, weight: 3,
      });
    } else {
      const missing: string[] = [];
      if (!hasSpf) missing.push("SPF");
      if (!hasDkim) missing.push("DKIM");
      if (!hasDmarc) missing.push("DMARC");
      findings.push({
        signal: "email_trust", axis: "trust",
        severity: "medium",
        label: `Incomplete email auth (missing ${missing.join(", ")})`,
        tradeoff: null, weight: 2,
      });
    }
  }

  // ─── NEW: security.txt Trust Signal ──────────────────────────────
  if (opts.securityTxt) {
    if (opts.securityTxt.found && opts.securityTxt.has_bug_bounty) {
      findings.push({ signal: "security_txt", axis: "trust", severity: "good", label: `security.txt with bug bounty${opts.securityTxt.bug_bounty_platform ? ` (${opts.securityTxt.bug_bounty_platform})` : ""}`, tradeoff: null, weight: 2 });
    } else if (opts.securityTxt.found) {
      findings.push({ signal: "security_txt", axis: "trust", severity: "good", label: "security.txt present (responsible disclosure)", tradeoff: null, weight: 1 });
    }
    // Absent = no finding (don't penalize for absence of nice-to-have)
  }

  // ─── Phase 3: BIMI Record (email brand identity) ────────────────
  if (opts.emailAuth?.bimi?.found) {
    findings.push({ signal: "bimi_record", axis: "trust", severity: "good", label: "BIMI record present — email brand verification", tradeoff: null, weight: 1 });
  }

  // dmarc_policy_strength removed — now handled by bidirectional dmarc_reject signal above

  // ─── Phase 3: ads.txt (publisher transparency) ──────────────────
  if (opts.wellKnown && arch === "content") {
    const hasAdsTxt = opts.wellKnown.endpoints.some(e => e.path.includes("ads.txt") && e.found);
    if (hasAdsTxt) {
      findings.push({ signal: "ads_txt", axis: "trust", severity: "good", label: "ads.txt present — authorized ad sellers declared", tradeoff: null, weight: 1 });
    }
  }

  // wayback removed — weight=0 dead code, no scoring impact

  // ─── EV/OV Certificate Detection (Trust) ────────────────────────
  if (opts.ssl?.subject) {
    const sslSubject = opts.ssl.subject;
    const hasOrg = /,?\s*O\s*=/.test(sslSubject);
    const isEV = hasOrg && (/SERIALNUMBER\s*=/.test(sslSubject) || /2\.5\.4\.15/.test(sslSubject) || /1\.3\.6\.1\.4\.1\.311\.60\.2\.1/.test(sslSubject));
    const orgMatch = sslSubject.match(/,?\s*O\s*=\s*([^,]+)/);
    const orgName = orgMatch ? orgMatch[1].replace(/\\\\/g, "").trim() : null;
    if (isEV && orgName) {
      findings.push({ signal: "cert_validation_type", axis: "trust", severity: "good", label: `Extended Validation (EV) certificate — ${orgName}`, tradeoff: null, weight: 3 });
    } else if (hasOrg && orgName) {
      findings.push({ signal: "cert_validation_type", axis: "trust", severity: "good", label: `Organization Validated (OV) certificate — ${orgName}`, tradeoff: null, weight: 2 });
    } else {
      findings.push({ signal: "cert_validation_type", axis: "trust", severity: "info", label: "Domain Validated (DV) certificate only", tradeoff: null, weight: 1 });
    }
  }

  // ─── Organizational Identity (Trust) ────────────────────────────
  if (opts.legal && !opts.httpBlocked) {
    const pages = opts.legal.pages_found ?? [];
    const hasPrivacy = pages.some((p: any) => /privacy/i.test(p.name ?? p));
    const hasTerms = pages.some((p: any) => /terms|tos|conditions/i.test(p.name ?? p));
    const hasAbout = pages.some((p: any) => /about|company|team/i.test(p.name ?? p));
    const orgCount = [hasPrivacy, hasTerms, hasAbout].filter(Boolean).length;
    if (orgCount >= 3) {
      findings.push({ signal: "organizational_identity", axis: "trust", severity: "good", label: "Privacy policy, terms, and about page found", tradeoff: null, weight: 2 });
    } else if (orgCount >= 1) {
      findings.push({ signal: "organizational_identity", axis: "trust", severity: "info", label: `${orgCount}/3 organizational pages found`, tradeoff: null, weight: 2 });
    } else {
      findings.push({ signal: "organizational_identity", axis: "trust", severity: "low", label: "No organizational identity pages (privacy, terms, about)", tradeoff: null, weight: 2 });
    }
  }

  // ─── Cookie Consent Bidirectional (Trust) ───────────────────────
  if (opts.cookieConsent && !opts.httpBlocked) {
    if (!opts.cookieConsent.cmp_detected && opts.cookieSecurity && opts.cookieSecurity.cookies.length > 0) {
      // Has cookies but no consent management = mild trust concern
      findings.push({
        signal: "cookie_consent_missing", axis: "trust",
        severity: "low",
        label: `${opts.cookieSecurity.cookies.length} cookies set without consent management`,
        tradeoff: null, weight: 2,
      });
    }
    // CMP detected is already scored as cookie_consent_cmp above
  }

  // ─── Visibility Axis Findings ────────────────────────────────────

  // Domain popularity (Tranco rank) — direct visibility measure
  if (opts.trancoRank != null) {
    if (opts.trancoRank <= 1000) {
      findings.push({ signal: "domain_popularity", axis: "visibility", severity: "good", label: `Tranco top 1K (#${opts.trancoRank.toLocaleString()}) — elite web presence`, tradeoff: null, weight: 3 });
    } else if (opts.trancoRank <= 10000) {
      findings.push({ signal: "domain_popularity", axis: "visibility", severity: "good", label: `Tranco top 10K (#${opts.trancoRank.toLocaleString()}) — high traffic`, tradeoff: null, weight: 2 });
    } else if (opts.trancoRank <= 100000) {
      findings.push({ signal: "domain_popularity", axis: "visibility", severity: "info", label: `Tranco top 100K (#${opts.trancoRank.toLocaleString()})`, tradeoff: null, weight: 2 });
    } else {
      findings.push({ signal: "domain_popularity", axis: "visibility", severity: "low", label: `Tranco rank #${opts.trancoRank.toLocaleString()} — low traffic`, tradeoff: null, weight: 1 });
    }
  } else {
    findings.push({ signal: "domain_popularity", axis: "visibility", severity: "medium", label: "Not ranked in Tranco top 1M — minimal measured traffic", tradeoff: null, weight: 2 });
  }

  // Structured data
  const jsonLdTypes = (opts.jsonLd ?? []).map(j => j.type);
  if (jsonLdTypes.length > 0) {
    findings.push({ signal: "structured_data", axis: "visibility", severity: "good", label: `Structured data: ${jsonLdTypes.slice(0, 3).join(", ")}`, tradeoff: null, weight: 2 });
  } else if (!opts.httpBlocked) {
    findings.push({
      signal: "no_structured_data", axis: "visibility",
      severity: contextualSeverity("low", arch, { content: "medium", commerce: "medium", infrastructure: "info" }),
      label: "No structured data (JSON-LD) found",
      tradeoff: null, weight: 2,
    });
  }

  // Social meta (OG + Twitter)
  if (opts.socialMeta && !opts.httpBlocked) {
    const score = opts.socialMeta.score;
    findings.push({
      signal: "social_meta", axis: "visibility",
      severity: score >= 80 ? "good" : score >= 50 ? "info" : score >= 30 ? "low" : "medium",
      label: score >= 80 ? "Complete social meta (OG + Twitter)" : `Social meta score: ${score}/100`,
      tradeoff: null, weight: 3,
    });
  }

  // Robots.txt
  if (opts.meta) {
    findings.push({
      signal: "robots_txt", axis: "visibility",
      severity: opts.meta.robots_txt_exists ? "good" : "low",
      label: opts.meta.robots_txt_exists ? "robots.txt present" : "No robots.txt",
      tradeoff: null, weight: 2,
    });
  }

  // Sitemap
  if (opts.meta) {
    findings.push({
      signal: "sitemap", axis: "visibility",
      severity: opts.meta.sitemap_detected ? "good" : contextualSeverity("low", arch, { content: "medium" }),
      label: opts.meta.sitemap_detected ? "Sitemap detected" : "No sitemap found",
      tradeoff: null, weight: 2,
    });
  }

  // Legal pages
  if (opts.legal && !opts.httpBlocked) {
    const pageCount = opts.legal.pages_found.length;
    findings.push({
      signal: "legal_pages", axis: "visibility",
      severity: pageCount >= 2 ? "good" : pageCount >= 1 ? "info" : "low",
      label: pageCount >= 2 ? `Legal pages found (${pageCount})` : pageCount === 1 ? "1 legal page found" : "No legal pages detected",
      tradeoff: null, weight: 1,
    });
  }

  // Social account presence — visibility signal
  if (opts.socialAccounts) {
    const accts = opts.socialAccounts.accounts;
    const verifiedCount = accts.filter(a => a.found_via === "rel-me").length;
    const linkedCount = accts.filter(a => a.found_via === "homepage").length;
    const totalCount = accts.length;

    if (verifiedCount >= 2) {
      findings.push({ signal: "social_accounts", axis: "visibility", severity: "good", label: `${verifiedCount} verified social accounts (rel=me)`, tradeoff: null, weight: 3 });
    } else if (verifiedCount >= 1 || linkedCount >= 2) {
      findings.push({ signal: "social_accounts", axis: "visibility", severity: "good", label: `${totalCount} social account${totalCount !== 1 ? "s" : ""} detected`, tradeoff: null, weight: 2 });
    } else if (totalCount >= 1) {
      findings.push({ signal: "social_accounts", axis: "visibility", severity: "info", label: `${totalCount} social account${totalCount !== 1 ? "s" : ""} detected`, tradeoff: null, weight: 1 });
    }
    // social_not_verified removed — 341/341 = info, 93% of domains, zero discrimination
    if (!opts.httpBlocked && totalCount === 0) {
      // No social presence — mild visibility concern for content/corporate sites
      findings.push({
        signal: "no_social_accounts", axis: "visibility",
        severity: contextualSeverity("info", arch, { content: "low", corporate: "low" }),
        label: "No social accounts detected",
        tradeoff: null, weight: 1,
      });
    }
  }

  // ─── NEW: Restrictive robots.txt ─────────────────────────────────
  if (opts.robotsParsed && opts.robotsParsed.is_restrictive) {
    findings.push({
      signal: "restrictive_robots", axis: "visibility",
      severity: contextualSeverity("medium", arch, { infrastructure: "info", application: "info" }),
      label: "robots.txt blocks all crawlers — site won't appear in search results",
      tradeoff: "May be intentional for private/internal sites.",
      weight: 2,
    });
  }

  // ─── NEW: PWA Ready ──────────────────────────────────────────────
  if (opts.wellKnown?.pwa_ready) {
    findings.push({
      signal: "pwa_ready", axis: "visibility",
      severity: "good",
      label: "Progressive Web App ready (manifest + service worker)",
      tradeoff: null,
      weight: (arch === "application" || arch === "commerce") ? 2 : 1,
    });
  }

  // ─── Phase 2: Canonical URL ──────────────────────────────────────
  if (opts.html && !opts.httpBlocked) {
    const canonicalMatch = opts.html.match(/<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["']/i)
      ?? opts.html.match(/<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']canonical["']/i);
    if (canonicalMatch) {
      const canonicalUrl = canonicalMatch[1];
      try {
        const canonicalHost = new URL(canonicalUrl).hostname.toLowerCase();
        const domainLowerCan = opts.domain.toLowerCase();
        if (canonicalHost === domainLowerCan || canonicalHost.endsWith(`.${domainLowerCan}`) || domainLowerCan.endsWith(`.${canonicalHost}`)) {
          findings.push({ signal: "canonical_url", axis: "visibility", severity: "good", label: "Canonical URL set correctly", tradeoff: null, weight: 2 });
        } else {
          findings.push({ signal: "canonical_url", axis: "visibility", severity: "info", label: `Canonical URL points to different domain (${canonicalHost})`, tradeoff: "May be intentional for cross-domain canonical consolidation.", weight: 1 });
        }
      } catch {
        findings.push({ signal: "canonical_url", axis: "visibility", severity: "info", label: "Canonical URL present but malformed", tradeoff: null, weight: 1 });
      }
    } else {
      findings.push({
        signal: "canonical_url_missing", axis: "visibility",
        severity: contextualSeverity("info", arch, { content: "low", corporate: "low" }),
        label: "No canonical URL — risk of duplicate content in search results",
        tradeoff: null, weight: 1,
      });
    }
  }

  // ─── Phase 3: Mobile App Links ───────────────────────────────────
  if (opts.wellKnown?.has_mobile_apps) {
    findings.push({ signal: "mobile_app_links", axis: "visibility", severity: "good", label: "Mobile app deep links configured", tradeoff: null, weight: 1 });
  }

  // ─── Phase 3: RSS/Atom Feed ──────────────────────────────────────
  if (opts.html && !opts.httpBlocked) {
    const hasRss = /type\s*=\s*["']application\/(rss|atom)\+xml["']/i.test(opts.html);
    if (hasRss) {
      findings.push({
        signal: "rss_feed", axis: "visibility",
        severity: "good",
        label: "RSS/Atom feed available",
        tradeoff: null,
        weight: (arch === "content") ? 2 : 1,
      });
    }
  }

  // ─── Phase 3: Hreflang (international targeting) ─────────────────
  if (opts.html && !opts.httpBlocked) {
    const hasHreflang = /hreflang\s*=\s*["'][^"']+["']/i.test(opts.html);
    if (hasHreflang) {
      findings.push({ signal: "hreflang", axis: "visibility", severity: "good", label: "Hreflang tags present — international targeting configured", tradeoff: null, weight: 1 });
    }
  }

  // ─── Phase 3: Favicon ────────────────────────────────────────────
  if (opts.meta && !opts.httpBlocked) {
    if (!opts.meta.favicon_url) {
      if (arch === "content" || arch === "corporate") {
        findings.push({ signal: "favicon_missing", axis: "visibility", severity: "low", label: "No favicon detected", tradeoff: null, weight: 1 });
      }
    }
  }

  // ─── Phase 3: Title Tag ──────────────────────────────────────────
  if (opts.html && !opts.httpBlocked) {
    const titleMatch = opts.html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const titleText = titleMatch ? titleMatch[1].trim() : "";
    if (!titleText) {
      findings.push({ signal: "title_tag_missing", axis: "visibility", severity: "low", label: "Missing page title", tradeoff: null, weight: 1 });
    } else if (titleText.length < 5 || /^(untitled|home|welcome|index)$/i.test(titleText)) {
      findings.push({ signal: "title_tag_generic", axis: "visibility", severity: "info", label: `Generic page title: "${titleText}"`, tradeoff: null, weight: 1 });
    }
  }

  // ─── Phase 3: Meta Description ───────────────────────────────────
  if (opts.html && !opts.httpBlocked) {
    const hasMetaDesc = /name\s*=\s*["']description["']/i.test(opts.html);
    const hasOgDesc = !!opts.socialMeta?.og?.description;
    if (!hasMetaDesc && !hasOgDesc) {
      findings.push({
        signal: "meta_description_missing", axis: "visibility",
        severity: contextualSeverity("info", arch, { content: "low" }),
        label: "No meta description — search engines will generate their own snippet",
        tradeoff: null, weight: 1,
      });
    }
  }

  // ─── Mobile Friendly ───────────────────────────────────────────
  if (opts.html && !opts.httpBlocked) {
    const viewportMatch = opts.html.match(/<meta[^>]+name\s*=\s*["']viewport["'][^>]+content\s*=\s*["']([^"']+)["']/i)
      ?? opts.html.match(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+name\s*=\s*["']viewport["']/i);
    if (viewportMatch) {
      const viewportContent = viewportMatch[1].toLowerCase();
      if (viewportContent.includes("width=device-width")) {
        findings.push({ signal: "mobile_friendly", axis: "visibility", severity: "good", label: "Mobile-friendly viewport configured", tradeoff: null, weight: 2 });
      } else {
        findings.push({ signal: "mobile_friendly", axis: "visibility", severity: "low", label: "Viewport set but not responsive (missing width=device-width)", tradeoff: null, weight: 2 });
      }
    } else {
      findings.push({
        signal: "mobile_friendly", axis: "visibility",
        severity: contextualSeverity("medium", arch, { infrastructure: "info", application: "low" }),
        label: "No viewport meta tag — not mobile-friendly",
        tradeoff: null, weight: 2,
      });
    }
  }

  // ─── OG Tag Completeness ───────────────────────────────────────
  if (opts.socialMeta && !opts.httpBlocked) {
    const og = opts.socialMeta.og;
    const ogChecks = [og?.title, og?.description, og?.image, og?.url, og?.type];
    const ogPresent = ogChecks.filter(Boolean).length;
    const hasTwitterCard = !!opts.socialMeta.twitter?.card;
    if (ogPresent >= 5) {
      findings.push({
        signal: "og_completeness", axis: "visibility",
        severity: "good",
        label: `Complete OG tags (${ogPresent}/5)${hasTwitterCard ? " + Twitter Card" : ""}`,
        tradeoff: null, weight: 2,
      });
    } else if (ogPresent >= 3) {
      findings.push({ signal: "og_completeness", axis: "visibility", severity: "info", label: `${ogPresent}/5 OG tags present`, tradeoff: null, weight: 2 });
    } else if (ogPresent >= 1) {
      findings.push({ signal: "og_completeness", axis: "visibility", severity: "low", label: `Only ${ogPresent}/5 OG tags — social sharing will look incomplete`, tradeoff: null, weight: 2 });
    } else {
      findings.push({
        signal: "og_completeness", axis: "visibility",
        severity: contextualSeverity("medium", arch, { infrastructure: "info" }),
        label: "No Open Graph tags — social sharing will use browser defaults",
        tradeoff: null, weight: 2,
      });
    }
  }
  if (opts.accessibility) {
    const a11yScore = opts.accessibility.score;
    if (a11yScore >= 80) {
      findings.push({ signal: "accessibility", axis: "visibility", severity: "good", label: `Accessibility score ${a11yScore}/100`, tradeoff: null, weight: 1 });
    } else if (a11yScore >= 50) {
      findings.push({
        signal: "accessibility", axis: "visibility",
        severity: contextualSeverity("low", arch, { institutional: "medium", corporate: "medium" }),
        label: `Accessibility score ${a11yScore}/100 — improvements needed`,
        tradeoff: null, weight: 1,
      });
    } else {
      findings.push({
        signal: "accessibility", axis: "visibility",
        severity: contextualSeverity("medium", arch, { institutional: "high", corporate: "medium" }),
        label: `Low accessibility score ${a11yScore}/100`,
        tradeoff: null, weight: 1,
      });
    }
  }

  // ─── Third-Party Scripts → Performance Axis ────────────────────
  if (opts.thirdPartyScripts) {
    const tps = opts.thirdPartyScripts;
    // Render-blocking scripts impact
    if (tps.render_blocking > 0) {
      findings.push({
        signal: "render_blocking_scripts", axis: "performance",
        severity: tps.render_blocking > 5 ? "high" : tps.render_blocking > 2 ? "medium" : "low",
        label: `${tps.render_blocking} render-blocking script${tps.render_blocking !== 1 ? "s" : ""}`,
        tradeoff: "Adding async/defer may cause timing issues for scripts that depend on load order.",
        weight: 3,
      });
    } else if (tps.third_party > 0) {
      findings.push({ signal: "render_blocking_scripts", axis: "performance", severity: "good", label: "No render-blocking third-party scripts", tradeoff: null, weight: 3 });
    }

    // High third-party script count impacts performance
    if (tps.third_party > 15) {
      findings.push({
        signal: "third_party_count", axis: "performance",
        severity: "high",
        label: `${tps.third_party} third-party scripts — significant performance overhead`,
        tradeoff: null, weight: 2,
      });
    } else if (tps.third_party > 8) {
      findings.push({
        signal: "third_party_count", axis: "performance",
        severity: "medium",
        label: `${tps.third_party} third-party scripts loaded`,
        tradeoff: null, weight: 2,
      });
    }

    // Privacy concerns → Security axis
    if (tps.privacy_concerns.length > 0) {
      findings.push({
        signal: "script_privacy", axis: "security",
        severity: contextualSeverity("medium", arch, { commerce: "high", institutional: "high" }),
        label: `${tps.privacy_concerns.length} privacy concern(s) from third-party scripts`,
        tradeoff: null, weight: 3,
      });
    }
  }

  // ─── Cookie Consent → Security/Trust Axes ─────────────────────
  if (opts.cookieConsent) {
    const cc = opts.cookieConsent;

    // CMP presence — important for trust
    if (cc.cmp_detected) {
      findings.push({
        signal: "cookie_consent_cmp", axis: "trust",
        severity: cc.cmp_detected.confidence >= 0.5 ? "good" : "info",
        label: `Consent platform: ${cc.cmp_detected.name}`,
        tradeoff: null, weight: 2,
      });
    }

    // Pre-consent tracking cookies — security concern
    if (cc.pre_consent_cookies > 0) {
      findings.push({
        signal: "pre_consent_cookies", axis: "security",
        severity: contextualSeverity("medium", arch, { commerce: "high", institutional: "critical" }),
        label: `${cc.pre_consent_cookies} potential tracking cookie(s) set before consent`,
        tradeoff: null, weight: 3,
      });
    }

    // Compliance flags count → trust
    if (cc.compliance_flags.length > 0) {
      findings.push({
        signal: "cookie_compliance", axis: "trust",
        severity: cc.compliance_flags.length >= 3 ? "medium" : "low",
        label: `${cc.compliance_flags.length} cookie compliance flag(s)`,
        tradeoff: null, weight: 2,
      });
    }
  }

  // ─── Network Health ──────────────────────────────────────────────
  if (opts.networkHealth) {
    const nh = opts.networkHealth;

    // DNS inconsistency
    if (nh.dns_propagation && !nh.dns_propagation.consistent) {
      findings.push({
        signal: "dns_inconsistent", axis: "reliability",
        severity: contextualSeverity("low", arch, { commerce: "medium", application: "medium" }),
        label: "DNS records inconsistent across resolvers",
        tradeoff: "DNS propagation may still be in progress, or you're using geo-DNS.",
        weight: 3,
      });
    } else if (nh.dns_propagation?.consistent) {
      findings.push({
        signal: "dns_consistent", axis: "reliability",
        severity: "good", label: "DNS records consistent across all resolvers",
        tradeoff: null, weight: 1,
      });
    }

    // BGP stability — demote to info if the site is actually reachable,
    // since BGP churn on a responding site is traffic engineering, not instability
    if (nh.ripe_routing?.routing_stability === "unstable") {
      const siteIsUp = opts.statusResult?.is_up === true;
      findings.push({
        signal: "bgp_unstable", axis: "reliability",
        severity: siteIsUp ? "info" : contextualSeverity("medium", arch, { commerce: "high", institutional: "high" }),
        label: siteIsUp
          ? `BGP route churn (${nh.ripe_routing.bgp_updates_24h} updates in 24h — site responding normally)`
          : `BGP route unstable (${nh.ripe_routing.bgp_updates_24h} updates in 24h)`,
        tradeoff: null, weight: siteIsUp ? 1 : 3,
      });
    }
    // bgp_stable removed — only 3 domains ever, unreliable data asymmetry

    // Route visibility
    if (nh.ripe_routing?.visibility) {
      const vis = nh.ripe_routing.visibility.percentage;
      if (vis < 70) {
        findings.push({
          signal: "low_visibility", axis: "reliability",
          severity: contextualSeverity("low", arch, { commerce: "medium" }),
          label: `Low route visibility (${vis}% of peers)`,
          tradeoff: null, weight: 2,
        });
      }
    }

    // Slow connection
    if (nh.connection_timing && nh.connection_timing.total_ms > 500) {
      findings.push({
        signal: "slow_connection", axis: "performance",
        severity: "info",
        label: `Slow connection setup (${Math.round(nh.connection_timing.total_ms)}ms total)`,
        tradeoff: "Connection timing depends on server location relative to the probe.",
        weight: 2,
      });
    }
  }

  // ─── Compute Axis Scores ─────────────────────────────────────────

  const axes: Axis[] = ["security", "performance", "reliability", "trust", "visibility"];
  const axisScores: Record<Axis, AxisScore> = {} as Record<Axis, AxisScore>;

  for (const axis of axes) {
    const axisFindings = findings.filter(f => f.axis === axis);
    if (axisFindings.length === 0) {
      // Unmeasured axis gets score 50 (not null) — lack of data is not a pass
      axisScores[axis] = { score: 50, weight: AXIS_WEIGHTS[axis], findings: [], not_measured: true };
      continue;
    }
    let score = computeAxisScore(axisFindings);

    // Confidence dampening: blend sparse axes toward default to prevent
    // high-confidence scores from limited data
    const MIN_FINDINGS: Partial<Record<Axis, number>> = { security: 6, visibility: 4, performance: 4 };
    const minRequired = MIN_FINDINGS[axis];
    if (minRequired && axisFindings.length < minRequired) {
      const confidence = axisFindings.length / minRequired;
      score = Math.round(confidence * score + (1 - confidence) * 65);
    }

    axisScores[axis] = { score, weight: AXIS_WEIGHTS[axis], findings: axisFindings };
  }

  // ─── Compute Composite Score ─────────────────────────────────────
  // Include all axes (unmeasured default to 50, not skipped)

  let composite = 0;
  for (const axis of axes) {
    composite += (axisScores[axis].score ?? 50) * AXIS_WEIGHTS[axis];
  }
  composite = Math.round(composite);

  // ─── Floor Penalty ───────────────────────────────────────────────
  // Prevent domains with one catastrophically bad axis from still scoring well overall
  const measuredScores = axes
    .filter(a => !axisScores[a].not_measured)
    .map(a => axisScores[a].score!);
  if (measuredScores.length > 0) {
    const minScore = Math.min(...measuredScores);
    if (minScore < 30) {
      composite = Math.min(composite, 55);
    } else if (minScore < 50) {
      composite = Math.min(composite, 72);
    } else if (minScore < 60) {
      // Drag: proportional pull-down for moderately weak axes
      const drag = Math.round((60 - minScore) * 0.4);
      composite = Math.max(0, composite - drag);
    }
  }

  let grade = gradeFromComposite(composite);

  // ─── Breach grade cap ────────────────────────────────────────────
  // Domains with catastrophic data breaches should not earn top grades
  // regardless of composite score — it's a credibility issue.
  if (opts.breaches && opts.breaches.found && !opts.breaches.check_failed) {
    const totalPwned = opts.breaches.total_pwned;
    if (totalPwned > 500_000_000 && (grade === "A" || grade === "B+" || grade === "B")) {
      grade = "B";
    } else if (totalPwned > 100_000_000 && (grade === "A" || grade === "B+")) {
      grade = "B";
    }
  }

  return { composite, grade, axes: axisScores, archetype };
}
