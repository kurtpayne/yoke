// ─── Contextual Domain Scoring System ─────────────────────────────────
// Implements the 5-axis radar scoring with archetype-based contextual weighting.
// See workspace/yoke-research/scoring-system-design.md for full design doc.

import type {
  SslResult, DnssecResult, BlocklistResult, PerformanceResult,
  OgTwitterResult, LegalResult, CompressionResult, JsonLdItem,
  RobotsParsed, MetaResult, HttpAnalysis, SecurityHeaderCheck,
  EmailAuthResult, CertTransparencyResult, GreynoiseResult,
  HostingResult, TechItem, AccessibilityResult, ThirdPartyScriptsResult,
  CookieConsentResult,
} from "./types";
import {
  PERF_SCORE, LCP, CLS, TTFB, DOMAIN_AGE, DOMAIN_EXPIRY, NS_COUNT, A11Y_SCORE,
  SEVERITY_SCORES, resolveSeverity,
} from "../../config/scoring-thresholds";

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
  score: number;
  weight: number;
  findings: Finding[];
}

export interface DomainScoreResult {
  composite: number;
  grade: string;
  axes: Record<Axis, AxisScore>;
  archetype: ArchetypeResult;
}

// ─── Severity → Score mapping ────────────────────────────────────────

const SEVERITY_SCORE = SEVERITY_SCORES;

// ─── Archetype Weight Profiles ───────────────────────────────────────

const ARCHETYPE_WEIGHTS: Record<ArchetypeName, Record<Axis, number>> = {
  commerce:       { security: 0.35, performance: 0.25, reliability: 0.20, trust: 0.10, visibility: 0.10 },
  content:        { security: 0.15, performance: 0.25, reliability: 0.15, trust: 0.15, visibility: 0.30 },
  application:    { security: 0.30, performance: 0.25, reliability: 0.20, trust: 0.10, visibility: 0.15 },
  corporate:      { security: 0.20, performance: 0.15, reliability: 0.15, trust: 0.30, visibility: 0.20 },
  infrastructure: { security: 0.25, performance: 0.20, reliability: 0.30, trust: 0.10, visibility: 0.15 },
  institutional:  { security: 0.35, performance: 0.10, reliability: 0.25, trust: 0.20, visibility: 0.10 },
  general:        { security: 0.20, performance: 0.20, reliability: 0.20, trust: 0.20, visibility: 0.20 },
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

// ─── Contextual Severity Rules ───────────────────────────────────────

type SeverityMap = Partial<Record<ArchetypeName, Severity>>;

function contextualSeverity(baseSeverity: Severity, archetype: ArchetypeName, overrides: SeverityMap): Severity {
  return overrides[archetype] ?? baseSeverity;
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
      findings.push({ signal: "ssl_grade", axis: "security", severity: "good", label: "SSL certificate valid (detailed grade unavailable)", tradeoff: null, weight: 5 });
    } else if (sslGrade.startsWith("A")) {
      findings.push({ signal: "ssl_grade", axis: "security", severity: "good", label: `SSL grade ${sslGrade}`, tradeoff: null, weight: 5 });
    } else if (sslGrade.startsWith("B")) {
      findings.push({ signal: "ssl_grade", axis: "security", severity: contextualSeverity("low", arch, { commerce: "medium", institutional: "medium" }), label: `SSL grade ${sslGrade} — room for improvement`, tradeoff: null, weight: 5 });
    } else if (sslGrade.startsWith("C")) {
      findings.push({ signal: "ssl_grade", axis: "security", severity: contextualSeverity("medium", arch, { commerce: "high", institutional: "high" }), label: `SSL grade ${sslGrade} — weak configuration`, tradeoff: "Tightening SSL config may drop support for older clients.", weight: 5 });
    } else {
      findings.push({ signal: "ssl_grade", axis: "security", severity: contextualSeverity("high", arch, { commerce: "critical", institutional: "critical" }), label: `SSL grade ${sslGrade} — significant weaknesses`, tradeoff: null, weight: 5 });
    }
  } else if (sslError && !opts.httpBlocked) {
    // SSL Labs couldn't assess but the site was successfully fetched over HTTPS — don't penalize
    findings.push({ signal: "ssl_grade", axis: "security", severity: "info", label: "SSL present (grade assessment unavailable)", tradeoff: null, weight: 5 });
  } else if (!opts.httpBlocked) {
    findings.push({ signal: "ssl_missing", axis: "security", severity: contextualSeverity("high", arch, { content: "medium" }), label: "No SSL certificate detected", tradeoff: null, weight: 5 });
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

  // DNSSEC
  if (opts.dnssec) {
    findings.push({
      signal: "dnssec", axis: "security",
      severity: opts.dnssec.enabled ? "good" : contextualSeverity("low", arch, { institutional: "medium", commerce: "low" }),
      label: opts.dnssec.enabled ? "DNSSEC enabled" : "DNSSEC not enabled",
      tradeoff: null, weight: 2,
    });
  }

  // Blocklist status
  const listedCount = (opts.blocklists ?? []).filter(b => b.listed).length;
  if (listedCount === 0) {
    findings.push({ signal: "blocklist_clean", axis: "security", severity: "good", label: "Not on any blocklists", tradeoff: null, weight: 3 });
  } else {
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
      const missing = [!hasSpf && "SPF", !hasDkim && "DKIM", !hasDmarc && "DMARC"].filter(Boolean);
      findings.push({
        signal: "email_auth_incomplete", axis: "security",
        severity: contextualSeverity("medium", arch, { corporate: "high" }),
        label: `Missing email auth: ${missing.join(", ")}`,
        tradeoff: null, weight: 3,
      });
    }
  }

  // ─── Performance Axis Findings ───────────────────────────────────

  const perf = opts.performance;
  if (perf && perf.score != null) {
    // Overall performance score — thresholds from config/scoring-thresholds.ts
    const ps = resolveSeverity(PERF_SCORE, perf.score);
    const psSev = perf.score >= 80 ? ps.severity : contextualSeverity(ps.severity, arch, perf.score >= 50 ? { content: "high" } : {});
    findings.push({ signal: PERF_SCORE.signal, axis: "performance", severity: psSev, label: ps.label, tradeoff: null, weight: PERF_SCORE.weight, source: PERF_SCORE.source });

    // LCP
    if (perf.lcp != null) {
      const lcpSec = perf.lcp / 1000;
      const lcp = resolveSeverity(LCP, lcpSec);
      findings.push({ signal: LCP.signal, axis: "performance", severity: lcp.severity, label: `LCP: ${lcpSec.toFixed(1)}s`, tradeoff: null, weight: LCP.weight, source: LCP.source });
    }

    // CLS
    if (perf.cls != null) {
      const cls = resolveSeverity(CLS, perf.cls);
      findings.push({ signal: CLS.signal, axis: "performance", severity: cls.severity, label: `CLS: ${perf.cls.toFixed(3)}`, tradeoff: null, weight: CLS.weight, source: CLS.source });
    }

    // TTFB
    if (perf.ttfb != null) {
      const ttfb = resolveSeverity(TTFB, perf.ttfb);
      findings.push({ signal: TTFB.signal, axis: "performance", severity: ttfb.severity, label: `TTFB: ${Math.round(perf.ttfb)}ms`, tradeoff: null, weight: TTFB.weight, source: TTFB.source });
    }
  }

  // Compression
  if (opts.compression) {
    if (opts.compression.encoding) {
      findings.push({ signal: "compression", axis: "performance", severity: "good", label: `Compression: ${opts.compression.encoding}`, tradeoff: null, weight: 2 });
    } else if (!opts.httpBlocked) {
      findings.push({ signal: "no_compression", axis: "performance", severity: "medium", label: "No compression detected", tradeoff: null, weight: 2 });
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
    tradeoff: null, weight: 2,
  });

  // Multiple A records (load balancing)
  const aCount = dns.filter(r => r.type === "A").length;
  if (aCount >= 2) {
    findings.push({ signal: "lb", axis: "reliability", severity: "good", label: `${aCount} A records (load balanced)`, tradeoff: null, weight: 2 });
  }

  // CAA records
  const hasCaa = dns.some(r => r.type === "CAA");
  findings.push({
    signal: "caa", axis: "reliability",
    severity: hasCaa ? "good" : "info",
    label: hasCaa ? "CAA records present" : "No CAA records",
    tradeoff: null, weight: 1,
  });

  // ─── Trust Axis Findings ─────────────────────────────────────────

  // Domain age (trust signal — graduated NRD thresholds aligned with industry)
  // Palo Alto: ≤32d = NRD; CF Email: 7d malicious, 30-45d suspicious; NextDNS: 30d block
  const ageDays = opts.rdap?.domain_age_days;
  if (ageDays != null) {
    const severity = ageDays > 365 * 3 ? "good"
      : ageDays > 365 ? "info"
      : ageDays > 90 ? "low"
      : ageDays > 30 ? "medium"
      : ageDays > 7 ? "medium"
      : "high";
    const label = ageDays > 365 * 3 ? `Established domain (${Math.floor(ageDays / 365)}+ years)`
      : ageDays > 365 ? `Domain age: ${Math.floor(ageDays / 365)}+ years`
      : ageDays > 90 ? `Young domain (${ageDays} days)`
      : ageDays > 30 ? `Recently registered (${ageDays} days)`
      : ageDays > 7 ? `Newly registered domain (${ageDays} days) — within NRD window`
      : `Newly registered domain (${ageDays} days) — high risk NRD`;
    findings.push({
      signal: "domain_age_trust", axis: "trust",
      severity, label, tradeoff: null, weight: 4,
    });
  }

  // Registration length remaining
  const expiryDays = opts.rdap?.days_until_expiry;
  if (expiryDays != null) {
    findings.push({
      signal: "registration_length", axis: "trust",
      severity: expiryDays > 365 ? "good" : expiryDays > 90 ? "info" : expiryDays > 30 ? "low" : "medium",
      label: expiryDays > 365 ? `Registration good for ${Math.floor(expiryDays / 365)}+ years` : `Expires in ${expiryDays} days`,
      tradeoff: null, weight: 2,
    });
  }

  // Blocklist clean (also trust)
  findings.push({
    signal: "blocklist_trust", axis: "trust",
    severity: listedCount === 0 ? "good" : listedCount >= 2 ? "critical" : "high",
    label: listedCount === 0 ? "Clean blocklist record" : `On ${listedCount} blocklist(s)`,
    tradeoff: null, weight: 5,
  });

  // GreyNoise
  if (opts.greynoise) {
    if (opts.greynoise.noise) {
      findings.push({ signal: "greynoise_noise", axis: "trust", severity: "medium", label: "IP flagged as internet noise by GreyNoise", tradeoff: null, weight: 2 });
    } else if (opts.greynoise.riot) {
      findings.push({ signal: "greynoise_riot", axis: "trust", severity: "good", label: "IP is a known service (GreyNoise RIOT)", tradeoff: null, weight: 2 });
    }
  }

  // Email auth completeness (trust signal)
  if (opts.emailAuth) {
    const complete = opts.emailAuth.spf.found && opts.emailAuth.dmarc.found && opts.emailAuth.dkim_selectors_found.length > 0;
    findings.push({
      signal: "email_trust", axis: "trust",
      severity: complete ? "good" : "medium",
      label: complete ? "Complete email authentication" : "Incomplete email authentication",
      tradeoff: null, weight: 3,
    });
  }

  // Wayback Machine presence
  // Wayback Machine — informational only, not scored as a penalty.
  // Archive coverage is arbitrary and not operator-controlled; domain age already captures newness.
  if (opts.wayback) {
    const snapshots = opts.wayback.total_snapshots ?? 0;
    if (snapshots > 0) {
      findings.push({
        signal: "wayback", axis: "trust",
        severity: snapshots > 100 ? "good" : "info",
        label: `${snapshots.toLocaleString()} Wayback snapshots`,
        tradeoff: null, weight: 0,
      });
    }
  }

  // ─── Visibility Axis Findings ────────────────────────────────────

  // Structured data
  const jsonLdTypes = (opts.jsonLd ?? []).map(j => j.type);
  if (jsonLdTypes.length > 0) {
    findings.push({ signal: "structured_data", axis: "visibility", severity: "good", label: `Structured data: ${jsonLdTypes.slice(0, 3).join(", ")}`, tradeoff: null, weight: 4 });
  } else if (!opts.httpBlocked) {
    findings.push({
      signal: "no_structured_data", axis: "visibility",
      severity: contextualSeverity("medium", arch, { content: "high", corporate: "medium", infrastructure: "info" }),
      label: "No structured data (JSON-LD) found",
      tradeoff: null, weight: 4,
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

  // ─── Accessibility → Visibility Axis ───────────────────────────
  if (opts.accessibility) {
    const a11yScore = opts.accessibility.score;
    if (a11yScore >= 80) {
      findings.push({ signal: "accessibility", axis: "visibility", severity: "good", label: `Accessibility score ${a11yScore}/100`, tradeoff: null, weight: 3 });
    } else if (a11yScore >= 50) {
      findings.push({
        signal: "accessibility", axis: "visibility",
        severity: contextualSeverity("medium", arch, { institutional: "high", corporate: "high" }),
        label: `Accessibility score ${a11yScore}/100 — improvements needed`,
        tradeoff: null, weight: 3,
      });
    } else {
      findings.push({
        signal: "accessibility", axis: "visibility",
        severity: contextualSeverity("high", arch, { institutional: "critical", corporate: "high" }),
        label: `Low accessibility score ${a11yScore}/100`,
        tradeoff: null, weight: 3,
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
        tradeoff: null, weight: 2,
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

  // ─── Compute Axis Scores ─────────────────────────────────────────

  const axes: Axis[] = ["security", "performance", "reliability", "trust", "visibility"];
  const weights = ARCHETYPE_WEIGHTS[arch];
  const axisScores: Record<Axis, AxisScore> = {} as Record<Axis, AxisScore>;

  for (const axis of axes) {
    const axisFindings = findings.filter(f => f.axis === axis);
    if (axisFindings.length === 0) {
      axisScores[axis] = { score: 75, weight: weights[axis], findings: [] }; // default if no data
      continue;
    }

    let weightedSum = 0;
    let totalWeight = 0;
    for (const f of axisFindings) {
      weightedSum += SEVERITY_SCORE[f.severity] * f.weight;
      totalWeight += f.weight;
    }

    const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 75;
    axisScores[axis] = { score, weight: weights[axis], findings: axisFindings };
  }

  // ─── Compute Composite Score ─────────────────────────────────────

  let composite = 0;
  for (const axis of axes) {
    composite += axisScores[axis].score * axisScores[axis].weight;
  }
  composite = Math.round(composite);

  const grade = composite >= 85 ? "A" : composite >= 70 ? "B" : composite >= 55 ? "C" : composite >= 40 ? "D" : "F";

  return { composite, grade, axes: axisScores, archetype };
}
