import { useState, useCallback, useEffect } from "react";
import { Sparkles, CheckCircle2, XCircle, Loader2, Zap, Target, Copy, Check, ChevronDown, ChevronUp, ExternalLink, Eye, EyeOff, Key, RotateCcw, Settings, ArrowUp } from "lucide-react";
import type { AnalysisResult } from "../utils/types";
import type { ScoreFinding, Axis, Severity } from "../api";
import { findReferenceLink } from "./DomainSignals";

// ─── Types ──────────────────────────────────────────────────────────

interface CrossSignalInsight {
  insight: string;
  signals_cited: string[];
  severity: "info" | "low" | "medium" | "high";
  actionable: boolean;
}

interface AIAnalysisResult {
  summary: string;
  posture: string;
  key_findings: Array<{ category: string; finding: string; severity: string; action: string }>;
  cross_signal_insights: CrossSignalInsight[];
  attack_surface: string[];
  recommendations: Array<{ priority: number; action: string; impact: string; effort: string; tool?: string }>;
  _usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface AIAnalysisResponse {
  result: AIAnalysisResult;
  analyzed_at: string;
  domain: string;
  cached: boolean;
  error?: string;
}

interface RateLimitResponse {
  rate_limited: true;
  limit: number;
  used: number;
  reset: string;
  diy_prompt: string;
  model_suggestion: string;
  instructions: string;
}

// ─── Top Priorities Engine ──────────────────────────────────────────

interface ActionItem {
  title: string;
  reason: string;
  effort: string;
  axis: string;
  severity: "critical" | "high" | "medium" | "low";
  impact: number; // 0-100, used for sorting
}

type AxisName = "security" | "performance" | "reliability" | "trust" | "visibility";

function generateActionItems(data: AnalysisResult): ActionItem[] {
  const items: ActionItem[] = [];
  const axes = data.domain_score?.axes;

  // ─── Critical: Site down ──────────────────────────────────────────
  if (data.status && !data.status.is_up) {
    items.push({ title: "Site appears to be down", reason: "Users and search engines can't reach your site. Everything else is secondary until this is resolved.", effort: "Investigate immediately", axis: "reliability", severity: "critical", impact: 100 });
  }

  // ─── Critical: Blocklisted ────────────────────────────────────────
  if (data.blocklists) {
    const listed = data.blocklists.filter(b => b.listed);
    if (listed.length > 0) {
      items.push({ title: `Listed on ${listed.length} blocklist${listed.length > 1 ? "s" : ""}`, reason: "Blocklist presence can cause email rejection and browser warnings. Investigate and request delisting.", effort: "Varies — may take days", axis: "trust", severity: "critical", impact: 95 });
    }
  }

  // ─── Critical: SSL expired or expiring ────────────────────────────
  if (data.ssl) {
    if (data.ssl.valid_to) {
      const daysLeft = Math.floor((new Date(data.ssl.valid_to).getTime() - Date.now()) / 86400000);
      if (daysLeft < 0) {
        items.push({ title: "Renew expired SSL certificate", reason: "Browsers are showing security warnings to every visitor. Enable auto-renewal to prevent recurrence.", effort: "~15 min with your cert provider", axis: "security", severity: "critical", impact: 98 });
      } else if (daysLeft <= 14) {
        items.push({ title: `Renew SSL certificate — expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, reason: "An expired cert will trigger browser warnings and break trust. Check auto-renewal or renew manually.", effort: "~15 min", axis: "security", severity: "critical", impact: 92 });
      } else if (daysLeft <= 30) {
        items.push({ title: `SSL certificate expires in ${daysLeft} days`, reason: "Coming up soon — make sure auto-renewal is configured or renew manually.", effort: "~15 min", axis: "security", severity: "high", impact: 70 });
      }
    }
    if (data.ssl.grade === "T") {
      items.push({ title: "Fix SSL certificate trust chain", reason: "The certificate has trust issues — browsers may show warnings. Usually means a missing intermediate certificate.", effort: "~30 min — reconfigure cert chain", axis: "security", severity: "critical", impact: 90 });
    } else if (data.ssl.grade && !data.ssl.grade.startsWith("A") && data.ssl.grade !== "T") {
      items.push({ title: "Upgrade TLS configuration for grade A", reason: "Enable TLS 1.3 and modern cipher suites. Improves both security and performance (TLS 1.3 has faster handshakes).", effort: "Server config change, ~30 min", axis: "security", severity: "medium", impact: 40 });
    }
  }

  // ─── Critical: Domain expiring ────────────────────────────────────
  if (data.rdap?.days_until_expiry != null) {
    if (data.rdap.days_until_expiry <= 30) {
      items.push({ title: `Renew domain — expires in ${data.rdap.days_until_expiry} day${data.rdap.days_until_expiry === 1 ? "" : "s"}`, reason: "If the domain expires, someone else can register it. Enable auto-renewal with your registrar.", effort: "~5 min at your registrar", axis: "trust", severity: "critical", impact: 96 });
    } else if (data.rdap.days_until_expiry <= 90) {
      items.push({ title: `Domain registration expires in ${data.rdap.days_until_expiry} days`, reason: "Consider renewing early and enabling auto-renewal to avoid any risk of losing the domain.", effort: "~5 min", axis: "trust", severity: "high", impact: 55 });
    }
  }

  // ─── High: Email authentication gaps ──────────────────────────────
  if (data.email_auth) {
    const missingSpf = !data.email_auth.spf?.found;
    const missingDkim = data.email_auth.dkim_selectors_found?.length === 0;
    const missingDmarc = !data.email_auth.dmarc?.found;
    const dmarcNone = data.email_auth.dmarc?.found && data.email_auth.dmarc.policy === "none";

    if (missingSpf && missingDkim && missingDmarc) {
      items.push({ title: "Set up email authentication (SPF + DKIM + DMARC)", reason: "Without any email auth, anyone can send emails pretending to be your domain. This hurts deliverability and enables phishing.", effort: "~1 hour — DNS records + email provider config", axis: "security", severity: "high", impact: 75 });
    } else {
      if (missingDkim) {
        items.push({ title: "Add DKIM to email authentication", reason: "You have SPF" + (data.email_auth.dmarc?.found ? " and DMARC" : "") + " but without DKIM, emails can still be spoofed. Most email providers have a setup wizard.", effort: "~30 min with your email provider", axis: "security", severity: "high", impact: 60 });
      }
      if (missingDmarc) {
        items.push({ title: "Add a DMARC policy", reason: "DMARC tells receiving servers what to do with unauthenticated email from your domain. Start with p=none to monitor.", effort: "~15 min — one DNS TXT record", axis: "trust", severity: "high", impact: 55 });
      }
      if (missingSpf) {
        items.push({ title: "Add SPF record", reason: "SPF lists which servers can send email for your domain. Without it, spam filters are more likely to reject your mail.", effort: "~10 min — one DNS TXT record", axis: "security", severity: "high", impact: 50 });
      }
      if (dmarcNone) {
        items.push({ title: "Strengthen DMARC policy from \"none\" to \"quarantine\" or \"reject\"", reason: "DMARC p=none only monitors — it doesn't actually protect against spoofing. Upgrade once you've verified legitimate senders.", effort: "~5 min DNS change, but audit senders first", axis: "trust", severity: "medium", impact: 35 });
      }
    }
  }

  // ─── High: Missing critical security headers ──────────────────────
  if (data.headers) {
    const failedHeaders = data.headers.security_audit.filter(h => h.status === "fail").map(h => h.header.toLowerCase());
    if (failedHeaders.includes("strict-transport-security") && !failedHeaders.includes("content-security-policy")) {
      items.push({ title: "Enable HSTS (HTTP Strict Transport Security)", reason: "Forces browsers to use HTTPS. Without it, users can be downgraded to insecure HTTP via man-in-the-middle attacks.", effort: "One response header — ~10 min", axis: "security", severity: "high", impact: 55 });
    }
    if (failedHeaders.includes("content-security-policy")) {
      items.push({ title: "Add a Content Security Policy", reason: "CSP is the strongest defense against cross-site scripting (XSS). Start with report-only mode to avoid breaking anything.", effort: "Moderate — requires auditing your scripts and styles", axis: "security", severity: "medium", impact: 45 });
    }
    if (failedHeaders.includes("x-content-type-options")) {
      items.push({ title: "Add X-Content-Type-Options: nosniff", reason: "Prevents browsers from MIME-sniffing responses, blocking a class of attacks. Trivial to add, no risk of breakage.", effort: "One-line header — ~5 min", axis: "security", severity: "low", impact: 15 });
    }
  }

  // ─── High: Performance issues ─────────────────────────────────────
  if (data.performance) {
    if (data.performance.score != null && data.performance.score < 50) {
      items.push({ title: `Improve page performance (currently ${data.performance.score}/100)`, reason: "Below 50 means significant loading issues. Affects user experience, bounce rates, and search rankings.", effort: "Run Lighthouse for specific recommendations", axis: "performance", severity: "high", impact: 70 });
    } else if (data.performance.score != null && data.performance.score < 80) {
      items.push({ title: `Tune page performance (currently ${data.performance.score}/100)`, reason: "Moderate performance — optimizing images, scripts, and server response time would help.", effort: "Varies — check Lighthouse report", axis: "performance", severity: "medium", impact: 35 });
    }
    if (data.performance.lcp != null && data.performance.lcp > 4000) {
      const lcpSec = (data.performance.lcp / 1000).toFixed(1);
      items.push({ title: `Reduce Largest Contentful Paint (${lcpSec}s → under 2.5s)`, reason: "LCP above 4s means the main content takes too long to appear. Usually caused by large images, slow fonts, or server delay.", effort: "Image optimization + lazy loading — ~1-2 hours", axis: "performance", severity: "high", impact: 60 });
    }
  }

  // ─── Medium: Third-party script bloat ─────────────────────────────
  if (data.third_party_scripts && data.third_party_scripts.third_party > 30) {
    items.push({ title: `Reduce third-party scripts (${data.third_party_scripts.third_party} detected)`, reason: "Each external script adds latency, privacy risk, and potential breakage. Audit and remove unused ones, lazy-load the rest.", effort: "~2-3 hours to audit and optimize", axis: "performance", severity: "medium", impact: 40 });
  }

  // ─── Medium: No compression ───────────────────────────────────────
  if (data.compression && !data.compression.encoding && !data.compression.vary_accept_encoding) {
    items.push({ title: "Enable response compression (gzip or brotli)", reason: "Uncompressed responses waste bandwidth and slow page loads. Most servers and CDNs support this with a config toggle.", effort: "~15 min — server/CDN config", axis: "performance", severity: "medium", impact: 35 });
  }

  // ─── Medium: HTTP/1.1 only ────────────────────────────────────────
  if (data.http_protocols && !data.http_protocols.http2 && !data.http_protocols.http3) {
    items.push({ title: "Upgrade to HTTP/2 or HTTP/3", reason: "HTTP/1.1 can't multiplex requests — browsers open 6+ connections instead. HTTP/2 is a server config change with no code impact.", effort: "Server/CDN config — ~30 min", axis: "performance", severity: "medium", impact: 30 });
  }

  // ─── Medium: DNSSEC ───────────────────────────────────────────────
  if (data.dnssec && !data.dnssec.enabled) {
    items.push({ title: "Enable DNSSEC", reason: "Prevents DNS spoofing attacks that can redirect your users to malicious sites. Most registrars offer one-click setup.", effort: "~30 min through your registrar", axis: "security", severity: "low", impact: 25 });
  }

  // ─── Low: No IPv6 ─────────────────────────────────────────────────
  if (data.dns?.records) {
    const hasAAAA = data.dns.records.some(r => r.type === "AAAA");
    if (!hasAAAA) {
      items.push({ title: "Add IPv6 (AAAA) records", reason: "A growing share of mobile and international users connect over IPv6. Some networks are IPv6-only.", effort: "DNS config — ~15 min", axis: "reliability", severity: "low", impact: 15 });
    }
  }

  // ─── Low: No CAA records ──────────────────────────────────────────
  if (data.caa_analysis && (!data.caa_analysis.records || data.caa_analysis.records.length === 0)) {
    items.push({ title: "Add CAA DNS records", reason: "CAA restricts which Certificate Authorities can issue certs for your domain, preventing unauthorized issuance.", effort: "~10 min — DNS records", axis: "security", severity: "low", impact: 15 });
  }

  // ─── Medium: Pre-consent cookies ──────────────────────────────────
  if (data.cookie_consent && data.cookie_consent.pre_consent_cookies > 0) {
    items.push({ title: `Review ${data.cookie_consent.pre_consent_cookies} pre-consent tracking cookie${data.cookie_consent.pre_consent_cookies > 1 ? "s" : ""}`, reason: "Cookies set before user consent can violate GDPR/CCPA. Review your cookie implementation and consent flow.", effort: "~1-2 hours to audit", axis: "trust", severity: "medium", impact: 35 });
  }

  // ─── Visibility quick wins ────────────────────────────────────────
  if (data.json_ld && data.json_ld.length === 0) {
    items.push({ title: "Add structured data (JSON-LD)", reason: "Organization or WebSite schema helps search engines understand your site and enables rich results in search.", effort: "~15 min — copy-paste template", axis: "visibility", severity: "low", impact: 25 });
  }

  if (data.social_meta) {
    const sm = data.social_meta as { og_complete?: boolean; twitter_complete?: boolean; score?: number };
    if (sm.score != null && sm.score < 30) {
      items.push({ title: "Add Open Graph and Twitter Card meta tags", reason: "Without social meta, shared links won't show rich previews on social media — just a bare URL.", effort: "~10 min — a few <meta> tags", axis: "visibility", severity: "low", impact: 20 });
    }
  }

  // Social verification via rel="me"
  if (data.domain_score?.axes?.visibility?.findings) {
    const visFindings = data.domain_score.axes.visibility.findings as Array<{ signal?: string; severity?: string; label?: string }>;
    const notVerified = visFindings.find(f => f.signal === "social_not_verified");
    const socialInfo = visFindings.find(f => f.signal === "social_accounts" && f.severity === "info");
    if (notVerified) {
      items.push({ title: "Add rel=\"me\" links for social account verification", reason: "Your social accounts are detected but not verified. Adding <link rel=\"me\" href=\"...\"> tags to your HTML head takes 5 minutes and proves you own those profiles — turning yellow \"linked\" badges green.", effort: "~5 min — add link tags to <head>", axis: "visibility" as AxisName, severity: "low", impact: 15 });
    } else if (socialInfo) {
      items.push({ title: "Verify social accounts with rel=\"me\" links", reason: "Social accounts were found by username matching but aren't verified. Add <link rel=\"me\" href=\"...\"> tags to prove ownership and strengthen your identity signals.", effort: "~5 min — add link tags to <head>", axis: "visibility" as AxisName, severity: "low", impact: 12 });
    }
  }

  if (data.meta && !data.meta.sitemap_detected) {
    items.push({ title: "Add a sitemap.xml", reason: "Sitemaps help search engines discover and index all your pages. Most frameworks can auto-generate one.", effort: "~15 min", axis: "visibility", severity: "low", impact: 15 });
  }

  if (data.accessibility) {
    const score = (data.accessibility as { score?: number }).score;
    if (score != null && score < 50) {
      items.push({ title: `Improve accessibility (score: ${score}/100)`, reason: "Low accessibility limits your audience and may create legal exposure. Focus on alt text, contrast, and keyboard navigation.", effort: "Ongoing — start with automated fixes", axis: "visibility", severity: "high", impact: 55 });
    } else if (score != null && score < 70) {
      items.push({ title: `Improve accessibility (score: ${score}/100)`, reason: "Room for improvement on WCAG compliance. Common fixes: add alt text, improve contrast ratios, ensure keyboard navigation.", effort: "~2-4 hours for quick wins", axis: "visibility", severity: "medium", impact: 30 });
    }
  }

  // ─── Data breaches ────────────────────────────────────────────────
  if (data.breaches?.items && data.breaches.items.length > 0) {
    items.push({ title: `${data.breaches.items.length} known data breach${data.breaches.items.length > 1 ? "es" : ""} on record`, reason: "Past breaches affect user trust. Ensure affected users were notified and credentials were reset.", effort: "Review breach details in Security tab", axis: "trust", severity: "medium", impact: 30 });
  }

  // ─── Cross-axis insights (the differentiator) ─────────────────────
  if (axes) {
    const measured = (Object.entries(axes) as [AxisName, typeof axes[AxisName]][])
      .filter(([, v]) => !v.not_measured && v.score != null);

    if (measured.length >= 2) {
      const sorted = [...measured].sort((a, b) => (a[1].score ?? 0) - (b[1].score ?? 0));
      const weakest = sorted[0];
      const strongest = sorted[sorted.length - 1];

      const axisLabels: Record<AxisName, string> = {
        security: "Security", performance: "Performance", reliability: "Reliability",
        trust: "Trust", visibility: "Visibility",
      };
      const axisAdvice: Record<AxisName, string> = {
        security: "headers, email auth, and TLS configuration",
        performance: "page speed, compression, and script optimization",
        reliability: "DNS redundancy, IPv6, and uptime",
        trust: "email authentication, domain registration, and compliance",
        visibility: "structured data, social meta, and accessibility",
      };

      if (weakest[1].score != null && strongest[1].score != null && strongest[1].score - weakest[1].score >= 15) {
        items.push({
          title: `Biggest opportunity: ${axisLabels[weakest[0]]}`,
          reason: `${axisLabels[weakest[0]]} (${weakest[1].score}) is your lowest axis while ${axisLabels[strongest[0]]} (${strongest[1].score}) is strong. Focus on ${axisAdvice[weakest[0]]} for the most impact on your overall score.`,
          effort: "See recommendations above",
          axis: weakest[0],
          severity: "medium",
          impact: 80,
        });
      }

      const secScore = axes.security?.score ?? 0;
      const perfScore = axes.performance?.score ?? 0;
      if (secScore >= 85 && perfScore < 70 && weakest[0] !== "performance") {
        items.push({
          title: "Security is solid — performance is the bottleneck",
          reason: `Security scores well (${secScore}) but performance (${perfScore}) is holding back the overall grade. Optimization effort here has the best ROI.`,
          effort: "Focus on performance items above",
          axis: "performance",
          severity: "medium",
          impact: 65,
        });
      }

      if (axes.security?.score != null && axes.trust?.score != null) {
        const secFindings = axes.security.findings || [];
        const trustFindings = axes.trust.findings || [];
        const emailSecIssue = secFindings.some(f => f.severity !== "good" && (f.signal?.includes("email") || f.label?.toLowerCase().includes("dkim") || f.label?.toLowerCase().includes("spf")));
        const emailTrustIssue = trustFindings.some(f => f.severity !== "good" && (f.label?.toLowerCase().includes("email") || f.label?.toLowerCase().includes("authentication")));
        if (emailSecIssue && emailTrustIssue) {
          items.push({
            title: "Email auth impacts both security and trust scores",
            reason: "Incomplete email authentication is dragging down two axes at once. Completing SPF + DKIM + DMARC is the highest-leverage single fix.",
            effort: "~1 hour total",
            axis: "security",
            severity: "medium",
            impact: 72,
          });
        }
      }
    }

    const notMeasured = (Object.entries(axes) as [AxisName, typeof axes[AxisName]][])
      .filter(([, v]) => v.not_measured);
    if (notMeasured.length > 0) {
      const names = notMeasured.map(([k]) => k).join(", ");
      items.push({
        title: "Some checks couldn't complete",
        reason: `${names} could not be measured — results may be incomplete. This can happen when the site blocks automated requests.`,
        effort: "",
        axis: "info",
        severity: "low",
        impact: 10,
      });
    }
  }

  // ─── Sort by impact, dedup by axis-severity ───────────────────────
  items.sort((a, b) => b.impact - a.impact);

  if (items.length > 5) {
    const top5 = items.slice(0, 5);
    const hasCrossAxis = top5.some(i => i.title.startsWith("Biggest opportunity") || i.title.startsWith("Security is solid") || i.title.startsWith("Email auth impacts"));
    if (!hasCrossAxis) {
      const crossIdx = items.findIndex(i => i.title.startsWith("Biggest opportunity") || i.title.startsWith("Security is solid") || i.title.startsWith("Email auth impacts"));
      if (crossIdx >= 5) {
        const [crossItem] = items.splice(crossIdx, 1);
        items.splice(4, 0, crossItem);
      }
    }
  }

  return items;
}

// ─── Grade-Up Simulator Engine ──────────────────────────────────────

const GRADE_THRESHOLDS = [
  { grade: "A+", min: 95 },
  { grade: "A", min: 90 },
  { grade: "B+", min: 85 },
  { grade: "B", min: 80 },
  { grade: "C+", min: 75 },
  { grade: "C", min: 65 },
  { grade: "D", min: 50 },
  { grade: "F", min: 0 },
];

const SEVERITY_SCORES: Record<string, number> = {
  critical: 0, high: 15, medium: 40, low: 65, info: 82, good: 100,
};

const AXIS_WEIGHTS: Record<string, number> = {
  security: 0.28, reliability: 0.25, trust: 0.12, performance: 0.20, visibility: 0.15,
};

interface GradeUpItem {
  signal: string;
  label: string;
  axis: Axis;
  currentSeverity: Severity;
  weight: number;
  pointGain: number; // estimated composite score improvement
  effort: string;
  fixDescription: string;
  fixLink: { url: string; label: string } | null;
}

function getNextGrade(currentGrade: string): { grade: string; min: number } | null {
  const idx = GRADE_THRESHOLDS.findIndex(g => g.grade === currentGrade);
  if (idx <= 0) return null; // already A+ or unknown
  return GRADE_THRESHOLDS[idx - 1];
}

function computeAxisScore(findings: ScoreFinding[]): number {
  if (findings.length === 0) return 65;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const f of findings) {
    weightedSum += (SEVERITY_SCORES[f.severity] ?? 82) * f.weight;
    totalWeight += f.weight;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 65;
}

function generateGradeUpPlan(data: AnalysisResult): { items: GradeUpItem[]; currentScore: number; currentGrade: string; targetGrade: string; targetThreshold: number; pointsNeeded: number } | null {
  const score = data.domain_score;
  if (!score) return null;

  const currentScore = score.composite;
  const currentGrade = score.grade;
  const next = getNextGrade(currentGrade);
  if (!next) return null; // already A+

  const pointsNeeded = next.min - currentScore;
  if (pointsNeeded <= 0) return null;

  const items: GradeUpItem[] = [];

  // For each axis, find non-good findings and compute what fixing each one would do
  for (const [axisName, axisData] of Object.entries(score.axes) as [Axis, typeof score.axes[Axis]][]) {
    if (axisData.not_measured || !axisData.findings) continue;
    const axisWeight = AXIS_WEIGHTS[axisName] ?? 0.15;

    for (const finding of axisData.findings) {
      if (finding.severity === "good") continue;

      // Simulate fixing this finding: change its severity to "good" and recalculate
      const currentAxisScore = computeAxisScore(axisData.findings);
      const fixedFindings = axisData.findings.map(f =>
        f === finding ? { ...f, severity: "good" as Severity } : f
      );
      const newAxisScore = computeAxisScore(fixedFindings);
      const axisDelta = newAxisScore - currentAxisScore;
      const compositeDelta = Math.round(axisDelta * axisWeight * 10) / 10;

      if (compositeDelta < 0.1) continue; // negligible impact

      const effortMap: Record<string, string> = {
        // Security
        hsts: "~10 min — add one response header",
        csp: "~1-2 hours — requires auditing scripts/styles",
        x_content_type: "~5 min — one-line header",
        permissions_policy: "~10 min — add response header",
        referrer_policy: "~5 min — add response header",
        ssl_grade: "~30 min — server config",
        dnssec: "~30 min — registrar setting",
        caa: "~10 min — DNS records",
        email_spf: "~10 min — one DNS TXT record",
        email_dkim: "~30 min — email provider config",
        email_dmarc: "~15 min — one DNS TXT record",
        dmarc_policy: "~5 min — DNS change (after sender audit)",
        blocklist: "Varies — investigate and request delisting",
        cookie_secure: "~30 min — update cookie settings",
        security_txt: "~10 min — create /.well-known/security.txt",
        server_version: "~10 min — strip version from headers",
        // Performance
        perf_score: "Varies — run Lighthouse for details",
        lcp: "~1-2 hours — optimize images and loading",
        cls: "~1 hour — fix layout shifts",
        ttfb: "~30 min — server/CDN optimization",
        compression: "~15 min — server/CDN config",
        http2: "~30 min — server/CDN config",
        caching: "~30 min — configure cache headers",
        // Trust
        domain_age_trust: "Cannot be changed — age increases naturally",
        domain_expiry: "~5 min — renew at registrar",
        // Reliability
        ns_count: "~15 min — add nameservers at registrar",
        ipv6: "~15 min — add AAAA records",
        dns_consistency: "~30 min — verify DNS configuration",
        // Visibility
        structured_data: "~15 min — add JSON-LD to HTML",
        social_meta: "~10 min — add meta tags",
        social_verified: "~5 min — add rel=\"me\" links",
        social_not_verified: "~5 min — add rel=\"me\" links",
        accessibility: "~2-4 hours — fix WCAG issues",
        sitemap: "~15 min — generate sitemap.xml",
        robots_restrictive: "~10 min — update robots.txt",
      };

      const fixDescMap: Record<string, string> = {
        hsts: "Add Strict-Transport-Security header",
        csp: "Add Content-Security-Policy header",
        x_content_type: "Add X-Content-Type-Options: nosniff",
        permissions_policy: "Add Permissions-Policy header",
        referrer_policy: "Add Referrer-Policy header",
        ssl_grade: "Upgrade TLS configuration",
        dnssec: "Enable DNSSEC at your registrar",
        caa: "Add CAA DNS records",
        email_spf: "Add SPF DNS record",
        email_dkim: "Configure DKIM with email provider",
        email_dmarc: "Add DMARC DNS record",
        dmarc_policy: "Upgrade DMARC policy to quarantine/reject",
        blocklist: "Investigate and request blocklist delisting",
        cookie_secure: "Set Secure/HttpOnly/SameSite on cookies",
        security_txt: "Create security.txt file",
        server_version: "Remove server version from headers",
        perf_score: "Optimize page performance",
        lcp: "Reduce Largest Contentful Paint time",
        cls: "Fix Cumulative Layout Shift issues",
        ttfb: "Reduce Time to First Byte",
        compression: "Enable gzip/brotli compression",
        http2: "Upgrade to HTTP/2 or HTTP/3",
        caching: "Configure proper cache headers",
        domain_age_trust: "Domain age (increases naturally over time)",
        domain_expiry: "Extend domain registration",
        ns_count: "Add additional nameservers",
        ipv6: "Add IPv6 (AAAA) DNS records",
        dns_consistency: "Fix DNS propagation inconsistencies",
        structured_data: "Add JSON-LD structured data",
        social_meta: "Add Open Graph and Twitter Card meta tags",
        social_verified: "Add rel=\"me\" verification links",
        social_not_verified: "Verify social accounts with rel=\"me\"",
        accessibility: "Improve WCAG accessibility",
        sitemap: "Add sitemap.xml",
        robots_restrictive: "Review restrictive robots.txt rules",
      };

      // Try to match signal to known effort/fix
      const signalKey = finding.signal.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const effort = effortMap[signalKey] || "Varies";
      const fixDescription = fixDescMap[signalKey] || finding.label;

      items.push({
        signal: finding.signal,
        label: finding.label,
        axis: axisName,
        currentSeverity: finding.severity,
        weight: finding.weight,
        pointGain: compositeDelta,
        effort,
        fixDescription,
        fixLink: getFixLink(finding, data),
      });
    }
  }

  // Sort by biggest impact first
  items.sort((a, b) => b.pointGain - a.pointGain);

  return { items, currentScore, currentGrade, targetGrade: next.grade, targetThreshold: next.min, pointsNeeded };
}

// ─── Resources / How-to-Fix Links ───────────────────────────────────

function detectTechStack(data: AnalysisResult): { isWordPress: boolean; isCloudflare: boolean; cdn: string | null; server: string | null } {
  const isWordPress = !!data.wordpress?.detected;
  const isCloudflare = !!(data.hosting?.cdn?.toLowerCase().includes("cloudflare") || data.hosting?.provider?.toLowerCase().includes("cloudflare"));
  const cdn = data.hosting?.cdn || null;
  const server = data.hosting?.provider || null;
  return { isWordPress, isCloudflare, cdn, server };
}

function getFixLink(finding: ScoreFinding, data: AnalysisResult): { url: string; label: string } | null {
  const { isWordPress, isCloudflare } = detectTechStack(data);
  const sig = finding.signal.toLowerCase();

  // HSTS
  if (sig.includes("hsts") || sig === "strict-transport-security" || finding.label.toLowerCase().includes("hsts")) {
    if (isCloudflare) return { url: "https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/", label: "Cloudflare HSTS docs" };
    if (isWordPress) return { url: "https://developer.wordpress.org/advanced-administration/security/hsts/", label: "WordPress HSTS guide" };
    return { url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security", label: "MDN HSTS reference" };
  }

  // CSP
  if (sig.includes("csp") || sig.includes("content_security") || sig === "content-security-policy") {
    if (isCloudflare) return { url: "https://developers.cloudflare.com/workers/examples/security-headers/", label: "Cloudflare security headers" };
    return { url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP", label: "MDN CSP guide" };
  }

  // DMARC
  if (sig.includes("dmarc") || sig === "dmarc_policy") {
    return { url: "https://dmarc.org/overview/", label: "DMARC setup guide" };
  }

  // SPF
  if (sig.includes("spf") || sig === "email_spf") {
    return { url: "https://www.cloudflare.com/learning/dns/dns-records/dns-spf-record/", label: "SPF record guide" };
  }

  // DKIM
  if (sig.includes("dkim") || sig === "email_dkim") {
    return { url: "https://www.cloudflare.com/learning/dns/dns-records/dns-dkim-record/", label: "DKIM setup guide" };
  }

  // Structured data
  if (sig.includes("structured") || sig.includes("json_ld") || sig === "structured_data") {
    if (isWordPress) return { url: "https://yoast.com/structured-data-schema-ultimate-guide/", label: "Yoast structured data guide" };
    return { url: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data", label: "Google structured data guide" };
  }

  // Compression
  if (sig.includes("compression") || sig === "compression") {
    if (isCloudflare) return { url: "https://developers.cloudflare.com/speed/optimization/content/brotli/", label: "Cloudflare Brotli compression" };
    return { url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Compression", label: "MDN compression guide" };
  }

  // HTTP/2
  if (sig.includes("http2") || sig.includes("http_protocol") || sig === "http2") {
    if (isCloudflare) return { url: "https://developers.cloudflare.com/speed/optimization/protocol/http2/", label: "Cloudflare HTTP/2 docs" };
    return { url: "https://developer.mozilla.org/en-US/docs/Glossary/HTTP_2", label: "MDN HTTP/2 reference" };
  }

  // DNSSEC
  if (sig.includes("dnssec")) {
    if (isCloudflare) return { url: "https://developers.cloudflare.com/dns/dnssec/", label: "Cloudflare DNSSEC docs" };
    return { url: "https://www.icann.org/resources/pages/dnssec-what-is-it-why-is-it-important-2019-03-05-en", label: "DNSSEC overview" };
  }

  // CAA
  if (sig.includes("caa")) {
    return { url: "https://blog.qualys.com/product-tech/2017/03/13/caa-mandated-by-cabrowser-forum", label: "CAA records guide" };
  }

  // Accessibility
  if (sig.includes("accessibility") || sig.includes("a11y")) {
    return { url: "https://www.w3.org/WAI/tips/developing/", label: "W3C accessibility tips" };
  }

  // Security.txt
  if (sig.includes("security_txt")) {
    return { url: "https://securitytxt.org/", label: "security.txt generator" };
  }

  // Social meta
  if (sig.includes("social_meta") || sig.includes("og_") || sig.includes("twitter_")) {
    return { url: "https://ogp.me/", label: "Open Graph protocol docs" };
  }

  // rel="me" verification
  if (sig.includes("social_verified") || sig.includes("social_not_verified")) {
    return { url: "https://indieweb.org/rel-me", label: "rel=\"me\" verification guide" };
  }

  // Sitemap
  if (sig.includes("sitemap")) {
    return { url: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview", label: "Google sitemap guide" };
  }

  // SSL/TLS
  if (sig.includes("ssl") || sig.includes("tls")) {
    if (isCloudflare) return { url: "https://developers.cloudflare.com/ssl/edge-certificates/", label: "Cloudflare SSL docs" };
    return { url: "https://www.ssllabs.com/ssltest/", label: "SSL Labs test" };
  }

  return null;
}

// ─── Quick Wins Filter ──────────────────────────────────────────────

function getQuickWins(actionItems: ActionItem[]): ActionItem[] {
  return actionItems.filter(item => {
    const effort = item.effort.toLowerCase();
    const isQuick = effort.includes("5 min") || effort.includes("10 min") || effort.includes("15 min") || effort.includes("one-line") || effort.includes("one response header");
    const isHighImpact = item.severity === "high" || item.severity === "critical";
    return isQuick || (isHighImpact && effort.includes("min"));
  }).slice(0, 6);
}

// ─── BYO Key helpers ────────────────────────────────────────────────

const STORAGE_KEY = "yoke_openrouter_key";
const MODEL_STORAGE_KEY = "yoke_openrouter_model";
const CUSTOM_PROMPT_KEY = "yoke_custom_prompt";
const SETTINGS_OPEN_KEY = "yoke_settings_open";

const AVAILABLE_MODELS = [
  { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3", provider: "DeepSeek" },
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", provider: "Anthropic" },
  { id: "anthropic/claude-opus-4", label: "Claude Opus 4", provider: "Anthropic" },
  { id: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "openai/o3", label: "o3", provider: "OpenAI" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google" },
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", provider: "Meta" },
];

function getSavedKey(): string {
  try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}
function saveKey(key: string) {
  try { if (key) localStorage.setItem(STORAGE_KEY, key); else localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}
function getSavedModel(): string {
  try { return localStorage.getItem(MODEL_STORAGE_KEY) || "deepseek/deepseek-chat-v3-0324"; } catch { return "deepseek/deepseek-chat-v3-0324"; }
}
function saveModel(model: string) {
  try { localStorage.setItem(MODEL_STORAGE_KEY, model); } catch { /* noop */ }
}
function getCustomPrompt(): string {
  try { return localStorage.getItem(CUSTOM_PROMPT_KEY) || ""; } catch { return ""; }
}
function saveCustomPrompt(prompt: string) {
  try { if (prompt) localStorage.setItem(CUSTOM_PROMPT_KEY, prompt); else localStorage.removeItem(CUSTOM_PROMPT_KEY); } catch { /* noop */ }
}
function getSettingsOpen(): boolean {
  try { return localStorage.getItem(SETTINGS_OPEN_KEY) === "true"; } catch { return false; }
}
function saveSettingsOpen(open: boolean) {
  try { localStorage.setItem(SETTINGS_OPEN_KEY, String(open)); } catch { /* noop */ }
}

// ─── Advanced Settings Panel ────────────────────────────────────────

function AdvancedSettings({ domain, onKeyChange, onModelChange }: {
  domain: string;
  onKeyChange: (key: string) => void;
  onModelChange: (model: string) => void;
}) {
  const [open, setOpen] = useState(getSettingsOpen);
  const [keyValue, setKeyValue] = useState(getSavedKey);
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [model, setModel] = useState(getSavedModel);
  const [promptText, setPromptText] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptEdited, setPromptEdited] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const hasKey = !!getSavedKey();

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    saveSettingsOpen(next);
    if (next && !promptText && domain) {
      loadPrompt();
    }
  };

  const loadPrompt = async () => {
    setPromptLoading(true);
    try {
      const res = await fetch("/api/ai-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      if (res.ok) {
        const data = await res.json() as { system: string; user: string };
        const fullPrompt = `${data.system}\n\n---\n\n${data.user}`;
        setDefaultPrompt(fullPrompt);
        const custom = getCustomPrompt();
        setPromptText(custom || fullPrompt);
        setPromptEdited(!!custom);
      }
    } catch { /* noop */ }
    setPromptLoading(false);
  };

  const handleKeySave = () => {
    const trimmed = keyValue.trim();
    saveKey(trimmed);
    onKeyChange(trimmed);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const handleKeyRemove = () => {
    setKeyValue("");
    saveKey("");
    onKeyChange("");
  };

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    saveModel(newModel);
    onModelChange(newModel);
  };

  const handlePromptChange = (newText: string) => {
    setPromptText(newText);
    setPromptEdited(newText !== defaultPrompt);
    saveCustomPrompt(newText === defaultPrompt ? "" : newText);
  };

  const handlePromptReset = () => {
    setPromptText(defaultPrompt);
    setPromptEdited(false);
    saveCustomPrompt("");
  };

  const handlePromptCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch { /* noop */ }
  };

  return (
    <div style={{ width: open ? "100%" : "auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        onClick={toggleOpen}
        title="Advanced AI settings"
        style={{
          display: "flex", alignItems: "center", gap: "5px",
          padding: "4px 10px", borderRadius: "6px",
          border: `1px solid ${hasKey ? "var(--success)" : "var(--border)"}`,
          background: hasKey ? "rgba(46,160,67,0.08)" : open ? "rgba(88,166,255,0.08)" : "transparent",
          color: hasKey ? "var(--success)" : open ? "var(--accent)" : "var(--muted)",
          cursor: "pointer", fontSize: "11px",
          transition: "all 0.15s",
        }}
      >
        <Settings size={12} style={{ transition: "transform 0.3s", transform: open ? "rotate(90deg)" : "none" }} />
        {hasKey ? "BYO Key ✓" : "Advanced"}
        {hasKey && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--success)", display: "inline-block" }} />}
      </button>
      </div>

      {open && (
        <div style={{
          marginTop: "10px", background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: "10px", padding: "16px", display: "flex", flexDirection: "column", gap: "16px",
        }}>
          {/* API Key Section */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <Key size={12} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>OpenRouter API Key</span>
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer"
                style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "3px", fontSize: "10px", color: "var(--muted)", textDecoration: "none" }}>
                Get a free key <ExternalLink size={9} />
              </a>
            </div>
            <div style={{ fontSize: "11px", color: "var(--muted)", margin: "0 0 8px 0", lineHeight: 1.6 }}>
              <p style={{ margin: "0 0 6px 0" }}>
                <strong style={{ color: "var(--text)" }}>Why?</strong> Yoke's AI analysis uses{" "}
                <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>OpenRouter</a>
                {" "}to access models like DeepSeek, Claude, GPT-4o, and Gemini. Without a key, you get 10 analyses/hr on our shared key. With your own, you get unlimited access, model selection, and prompt editing.
              </p>
              <p style={{ margin: "0" }}>
                <strong style={{ color: "var(--text)" }}>Privacy:</strong> Your key is stored in your browser's localStorage only — it's sent directly from your browser to OpenRouter, never to Yoke's servers. We can't see, log, or access it. <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>Privacy policy →</a>
              </p>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type={showKey ? "text" : "password"}
                  value={keyValue}
                  onChange={e => setKeyValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleKeySave(); }}
                  placeholder="sk-or-v1-..."
                  style={{
                    width: "100%", padding: "7px 32px 7px 10px", borderRadius: "6px",
                    border: "1px solid var(--border)", background: "var(--bg)",
                    color: "var(--text)", fontSize: "12px", outline: "none",
                    fontFamily: "monospace", boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  title={showKey ? "Hide key" : "Show key"}
                  style={{
                    position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--muted)", padding: "2px", display: "flex",
                  }}
                >
                  {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              <button onClick={handleKeySave} style={{
                padding: "7px 14px", borderRadius: "6px",
                border: "1px solid var(--accent)", background: "rgba(88,166,255,0.1)",
                color: "var(--accent)", cursor: "pointer", fontSize: "12px", fontWeight: 600,
                whiteSpace: "nowrap",
              }}>
                {keySaved ? "Saved!" : "Save"}
              </button>
            </div>
            {hasKey && (
              <button onClick={handleKeyRemove} style={{
                marginTop: "6px", padding: "3px 8px", borderRadius: "4px",
                border: "none", background: "transparent",
                color: "var(--danger)", cursor: "pointer", fontSize: "11px",
              }}>
                Remove key
              </button>
            )}
          </div>

          {/* Model Selector */}
          <div style={{ opacity: hasKey ? 1 : 0.45, pointerEvents: hasKey ? "auto" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <Sparkles size={12} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>Model</span>
              {!hasKey && <span style={{ fontSize: "10px", color: "var(--muted)", fontStyle: "italic" }}>requires API key</span>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {AVAILABLE_MODELS.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleModelChange(m.id)}
                  disabled={!hasKey}
                  style={{
                    padding: "5px 10px", borderRadius: "6px",
                    border: `1px solid ${model === m.id ? "var(--accent)" : "var(--border)"}`,
                    background: model === m.id ? "rgba(88,166,255,0.12)" : "var(--bg)",
                    color: model === m.id ? "var(--accent)" : "var(--muted)",
                    cursor: hasKey ? "pointer" : "default", fontSize: "11px",
                    fontWeight: model === m.id ? 600 : 400,
                    transition: "all 0.15s",
                  }}
                >
                  {m.label}
                  <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "4px" }}>{m.provider}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Editor */}
          <div style={{ opacity: hasKey ? 1 : 0.45, pointerEvents: hasKey ? "auto" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <Sparkles size={12} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>Prompt</span>
              {!hasKey && <span style={{ fontSize: "10px", color: "var(--muted)", fontStyle: "italic" }}>requires API key</span>}
              {promptEdited && (
                <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "4px", background: "rgba(210,153,34,0.15)", color: "var(--warning)" }}>
                  edited
                </span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
                {promptEdited && (
                  <button onClick={handlePromptReset} title="Reset to default" style={{
                    display: "flex", alignItems: "center", gap: "3px",
                    padding: "2px 6px", borderRadius: "4px",
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--muted)", cursor: "pointer", fontSize: "10px",
                  }}>
                    <RotateCcw size={9} /> Reset
                  </button>
                )}
                <button onClick={handlePromptCopy} title="Copy prompt" style={{
                  display: "flex", alignItems: "center", gap: "3px",
                  padding: "2px 6px", borderRadius: "4px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--muted)", cursor: "pointer", fontSize: "10px",
                }}>
                  {promptCopied ? <Check size={9} /> : <Copy size={9} />}
                  {promptCopied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <p style={{ fontSize: "10px", color: "var(--muted)", margin: "0 0 6px 0", lineHeight: 1.4 }}>
              This is the exact prompt sent to the AI. Edit it to focus the analysis on what matters to you.
            </p>
            {promptLoading ? (
              <div style={{
                height: "200px", display: "flex", alignItems: "center", justifyContent: "center",
                border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg)",
              }}>
                <Loader2 size={14} style={{ color: "var(--muted)", animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: "11px", color: "var(--muted)", marginLeft: "8px" }}>Loading prompt…</span>
              </div>
            ) : (
              <textarea
                value={promptText}
                onChange={e => handlePromptChange(e.target.value)}
                spellCheck={false}
                style={{
                  width: "100%", height: "240px", padding: "10px", borderRadius: "6px",
                  border: `1px solid ${promptEdited ? "var(--warning)" : "var(--border)"}`,
                  background: "var(--bg)", color: "var(--text)",
                  fontSize: "11px", fontFamily: "'SF Mono', Monaco, Consolas, monospace",
                  lineHeight: 1.5, outline: "none", resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>

          {/* Status footer */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingTop: "8px", borderTop: "1px solid var(--border)",
            fontSize: "10px", color: "var(--muted)",
          }}>
            <span>
              {hasKey ? (
                <>Using your key · <span style={{ color: "var(--success)" }}>Unlimited analysis</span></>
              ) : (
                <>Platform key · 10 analyses/hr</>
              )}
            </span>
            <span style={{ opacity: 0.6 }}>
              {hasKey ? AVAILABLE_MODELS.find(m => m.id === model)?.label || model : "DeepSeek V3"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rate Limit UI ──────────────────────────────────────────────────

function RateLimitView({ data, onKeySet }: { data: RateLimitResponse; onKeySet: (key: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.diy_prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* fallback */ }
  };

  const handleKeySave = () => {
    const trimmed = keyInput.trim();
    if (trimmed) {
      saveKey(trimmed);
      onKeySet(trimmed);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", textAlign: "center" }}>
      <div style={{
        width: "56px", height: "56px", borderRadius: "14px",
        background: "rgba(210,153,34,0.15)", display: "flex",
        alignItems: "center", justifyContent: "center", marginBottom: "16px",
      }}>
        <Zap size={24} style={{ color: "var(--warning)" }} />
      </div>
      <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>
        Daily AI limit reached ({data.used}/{data.limit})
      </h3>
      <p style={{ fontSize: "12px", color: "var(--muted)", maxWidth: "440px", lineHeight: 1.6, marginBottom: "20px" }}>
        Yoke is free and open source — we rate-limit AI calls to manage costs, not knowledge.
      </p>

      <div style={{
        width: "100%", maxWidth: "460px", background: "var(--card)",
        border: "1px solid var(--border)", borderRadius: "10px", padding: "16px", marginBottom: "14px",
      }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "8px" }}>
          Run it yourself
        </div>
        <p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 12px 0", lineHeight: 1.5 }}>
          Copy the analysis prompt and paste it into ChatGPT, Claude, Gemini, or any AI assistant.
        </p>
        <button onClick={handleCopy} style={{
          display: "flex", alignItems: "center", gap: "6px", margin: "0 auto",
          padding: "8px 18px", borderRadius: "8px",
          border: "1px solid var(--accent)", background: "rgba(88,166,255,0.1)",
          color: "var(--accent)", cursor: "pointer", fontSize: "13px", fontWeight: 600,
        }}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied!" : "Copy analysis prompt"}
        </button>
      </div>

      <div style={{
        width: "100%", maxWidth: "460px", background: "var(--card)",
        border: "1px solid var(--border)", borderRadius: "10px", padding: "16px",
      }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
          <Key size={14} /> Unlock unlimited analysis
        </div>
        <p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 12px 0", lineHeight: 1.5 }}>
          Enter your own <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>OpenRouter API key</a> — stored locally, never sent to Yoke.
        </p>
        <div style={{ display: "flex", gap: "6px" }}>
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="sk-or-v1-..."
            onKeyDown={e => { if (e.key === "Enter") handleKeySave(); }}
            style={{
              flex: 1, padding: "7px 10px", borderRadius: "6px",
              border: "1px solid var(--border)", background: "var(--bg)",
              color: "var(--text)", fontSize: "12px", outline: "none", fontFamily: "monospace",
            }}
          />
          <button onClick={handleKeySave} style={{
            padding: "7px 14px", borderRadius: "6px",
            border: "1px solid var(--accent)", background: "rgba(88,166,255,0.1)",
            color: "var(--accent)", cursor: "pointer", fontSize: "12px", fontWeight: 600,
          }}>
            Save & retry
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Loading Indicator ───────────────────────────────────────────

const ESTIMATED_SECONDS = 45;

const LOADING_PHASES = [
  { at: 0, msg: "Preparing analysis data…" },
  { at: 3, msg: "Sending to AI model…" },
  { at: 6, msg: "Finding cross-signal correlations…" },
  { at: 14, msg: "Synthesizing insights across data points…" },
  { at: 25, msg: "Formatting structured results…" },
  { at: 38, msg: "Still working — complex domains take longer…" },
  { at: 55, msg: "Almost there…" },
];

function AILoadingIndicator() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const progress = Math.min(elapsed / ESTIMATED_SECONDS, 0.95);
  const phase = [...LOADING_PHASES].reverse().find(p => elapsed >= p.at) || LOADING_PHASES[0];

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px",
      padding: "16px", display: "flex", flexDirection: "column", gap: "10px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Loader2 size={14} style={{ color: "var(--accent)", animation: "spin 1s linear infinite", flexShrink: 0 }} />
        <span style={{ fontSize: "12px", color: "var(--text)" }}>{phase.msg}</span>
        <span style={{ fontSize: "10px", color: "var(--muted)", marginLeft: "auto", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{elapsed}s</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
      <div style={{ height: "3px", borderRadius: "2px", background: "var(--border)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: "2px", background: "var(--accent)",
          width: `${progress * 100}%`, transition: "width 1s linear",
        }} />
      </div>
      <span style={{ fontSize: "10px", color: "var(--muted)" }}>
        Cross-signal analysis typically takes 30–45s — feel free to explore other tabs while you wait
      </span>
    </div>
  );
}

// ─── Grade-Up Simulator UI ──────────────────────────────────────────

function GradeUpSimulator({ data }: { data: AnalysisResult }) {
  const [expanded, setExpanded] = useState(false);
  const plan = generateGradeUpPlan(data);

  if (!plan || plan.items.length === 0) {
    if (data.domain_score?.grade === "A+") {
      return (
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px",
          padding: "16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <ArrowUp size={14} style={{ color: "var(--success)" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Grade-Up Simulator</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", fontSize: "13px", color: "var(--success)" }}>
            <CheckCircle2 size={14} />
            <span>You're already at A+! Maximum score achieved.</span>
          </div>
        </div>
      );
    }
    return null;
  }

  const DEFAULT_VISIBLE = 5;
  const visibleItems = expanded ? plan.items : plan.items.slice(0, DEFAULT_VISIBLE);
  const hasMore = plan.items.length > DEFAULT_VISIBLE;

  // Calculate running totals for visible items
  let runningGain = 0;
  const itemsWithRunning = visibleItems.map(item => {
    runningGain += item.pointGain;
    return { ...item, runningTotal: runningGain };
  });

  const totalGain = plan.items.reduce((sum, i) => sum + i.pointGain, 0);
  const projectedScore = Math.min(100, Math.round(plan.currentScore + totalGain));
  const projectedGrade = projectedScore >= 95 ? "A+" : projectedScore >= 90 ? "A" : projectedScore >= 85 ? "B+" : projectedScore >= 80 ? "B" : projectedScore >= 75 ? "C+" : projectedScore >= 65 ? "C" : projectedScore >= 50 ? "D" : "F";

  const progressPct = Math.min(((plan.currentScore - (GRADE_THRESHOLDS.find(g => g.grade === plan.currentGrade)?.min ?? 0)) / (plan.targetThreshold - (GRADE_THRESHOLDS.find(g => g.grade === plan.currentGrade)?.min ?? 0))) * 100, 100);

  const axisLabels: Record<string, string> = {
    security: "Security", performance: "Performance", reliability: "Reliability",
    trust: "Trust", visibility: "Visibility",
  };
  const axisColors: Record<string, string> = {
    security: "#f85149", performance: "#58a6ff", reliability: "#7ee787",
    trust: "#d2a221", visibility: "#bc8cff",
  };

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px",
      padding: "16px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <ArrowUp size={14} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Grade-Up Simulator</span>
        <span style={{ fontSize: "11px", color: "var(--muted)", marginLeft: "auto" }}>
          {plan.currentGrade} → {plan.targetGrade}
        </span>
      </div>

      {/* Progress bar toward next grade */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{plan.currentScore} pts ({plan.currentGrade})</span>
          <span style={{ color: "var(--muted)" }}>{plan.targetThreshold} pts ({plan.targetGrade})</span>
        </div>
        <div style={{ height: "6px", borderRadius: "3px", background: "var(--border)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: "3px",
            background: "linear-gradient(90deg, var(--accent), #7ee787)",
            width: `${Math.max(5, progressPct)}%`,
            transition: "width 0.5s ease",
          }} />
        </div>
        <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "3px" }}>
          Need +{plan.pointsNeeded} points · fixing all items below → {projectedScore} pts ({projectedGrade})
        </div>
      </div>

      {/* Fix items */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {itemsWithRunning.map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: "10px",
            padding: "8px 10px", borderRadius: "6px",
            background: "rgba(88,166,255,0.03)", border: "1px solid rgba(88,166,255,0.08)",
          }}>
            <span style={{
              fontSize: "11px", fontWeight: 700, color: "var(--accent)",
              minWidth: "20px", textAlign: "right", paddingTop: "1px",
            }}>
              {i + 1}.
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>
                  {item.fixDescription}
                </span>
                {item.fixLink && (
                  <a
                    href={item.fixLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.fixLink.label}
                    style={{ color: "var(--accent)", display: "flex", alignItems: "center", opacity: 0.6, transition: "opacity 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
                  >
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
                <span style={{
                  fontSize: "10px", padding: "1px 6px", borderRadius: "3px",
                  background: `${axisColors[item.axis] || "var(--muted)"}15`,
                  color: axisColors[item.axis] || "var(--muted)",
                  fontWeight: 600,
                }}>
                  {axisLabels[item.axis] || item.axis}
                </span>
                <span style={{ fontSize: "10px", color: "var(--success)", fontWeight: 600 }}>
                  +{item.pointGain.toFixed(1)} pts
                </span>
                {item.effort && item.effort !== "Varies" && (
                  <span style={{ fontSize: "10px", color: "var(--muted)" }}>{item.effort}</span>
                )}
              </div>
              {item.label !== item.fixDescription && (
                <div style={{ fontSize: "10px", color: "var(--dim)", marginTop: "2px" }}>
                  Current: {item.label}
                </div>
              )}
            </div>
            <span style={{
              fontSize: "10px", color: "var(--muted)", whiteSpace: "nowrap",
              paddingTop: "2px", fontVariantNumeric: "tabular-nums",
            }}>
              Σ +{item.runningTotal.toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(prev => !prev)}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: "8px 0 0",
            display: "flex", alignItems: "center", gap: "4px",
            fontSize: "11px", color: "var(--muted)", transition: "color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
        >
          {expanded ? (
            <><ChevronUp size={12} /> Show less</>
          ) : (
            <><ChevronDown size={12} /> Show {plan.items.length - DEFAULT_VISIBLE} more</>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Quick Wins UI ──────────────────────────────────────────────────

function QuickWinsPanel({ actionItems, data }: { actionItems: ActionItem[]; data: AnalysisResult }) {
  const quickWins = getQuickWins(actionItems);
  if (quickWins.length === 0) return null;

  // Estimate total point gain from quick wins using the grade-up plan
  const plan = generateGradeUpPlan(data);
  const quickWinSignals = new Set(quickWins.map(q => q.title.toLowerCase()));

  return (
    <div style={{
      background: "var(--card)", border: "1px solid rgba(210,153,34,0.2)", borderRadius: "10px",
      padding: "16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <Zap size={14} style={{ color: "var(--warning)" }} />
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Quick Wins</span>
        <span style={{ fontSize: "10px", color: "var(--muted)" }}>— do these in under 30 minutes</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {quickWins.map((item, i) => {
          const ref = findReferenceLink(item.title);
          // Try to find matching fix link from the grade-up plan
          const gradeUpMatch = plan?.items.find(g =>
            g.fixDescription.toLowerCase().includes(item.title.toLowerCase().slice(0, 20)) ||
            item.title.toLowerCase().includes(g.fixDescription.toLowerCase().slice(0, 20))
          );
          const fixLink = gradeUpMatch?.fixLink || null;

          return (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: "8px",
              paddingLeft: "8px", borderLeft: "2px solid var(--warning)",
            }}>
              <span style={{ fontSize: "12px", color: "var(--warning)", fontWeight: 700, paddingTop: "1px" }}>
                {i + 1}.
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>{item.title}</span>
                  {(ref || fixLink) && (
                    <a
                      href={(fixLink || ref)!.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={(fixLink || ref)!.label}
                      style={{ color: "var(--dim)", opacity: 0.5, transition: "opacity 0.15s", display: "flex" }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                      onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
                    >
                      <ExternalLink size={10} />
                    </a>
                  )}
                  <span style={{ fontSize: "10px", color: "var(--muted)", marginLeft: "auto", whiteSpace: "nowrap" }}>{item.effort}</span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.3 }}>{item.reason}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Cross-Signal Insights UI ───────────────────────────────────────

function CrossSignalInsightsCard({ insights }: { insights: CrossSignalInsight[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const severityColor = (s: string) =>
    s === "high" ? "var(--danger)" : s === "medium" ? "var(--warning)" : s === "low" ? "#58a6ff" : "var(--muted)";
  const severityIcon = (s: string) =>
    s === "high" ? "🔴" : s === "medium" ? "🟡" : s === "low" ? "🔵" : "ℹ️";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {insights.map((insight, i) => (
        <div
          key={i}
          style={{
            background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px",
            padding: "12px", cursor: "pointer",
            borderLeftColor: severityColor(insight.severity), borderLeftWidth: "3px",
          }}
          onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <span style={{ fontSize: "11px", flexShrink: 0, paddingTop: "1px" }}>{severityIcon(insight.severity)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "12px", color: "var(--text)", lineHeight: 1.5 }}>
                {insight.insight}
              </div>
              {(expandedIdx === i || true) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                  {insight.signals_cited.map((sig, j) => (
                    <span key={j} style={{
                      fontSize: "9px", padding: "1px 6px", borderRadius: "3px",
                      background: "rgba(88,166,255,0.1)", color: "var(--accent)",
                      fontFamily: "monospace",
                    }}>
                      {sig}
                    </span>
                  ))}
                  {insight.actionable && (
                    <span style={{
                      fontSize: "9px", padding: "1px 6px", borderRadius: "3px",
                      background: "rgba(46,160,67,0.1)", color: "var(--success)",
                    }}>
                      actionable
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

// Module-level cache so results survive tab switches
const _insightsCache: Record<string, AIAnalysisResult> = {};
const _metadataCache: Record<string, { analyzed_at: string; cached: boolean }> = {};

export function AIAnalysisPanel({ domain, analysisData, streaming }: { domain: string; analysisData?: AnalysisResult; streaming?: boolean }) {
  const [insightsResult, setInsightsResult] = useState<AIAnalysisResult | null>(_insightsCache[domain] || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<RateLimitResponse | null>(null);
  const [analysisMetadata, setAnalysisMetadata] = useState<{ analyzed_at: string; cached: boolean } | null>(_metadataCache[domain] || null);
  const [, setKeyVersion] = useState(0);
  const [selectedModel, setSelectedModel] = useState(getSavedModel);
  const [prioritiesExpanded, setPrioritiesExpanded] = useState(false);

  const actionItems = analysisData ? generateActionItems(analysisData) : [];

  const generateInsights = useCallback(async () => {
    if (insightsResult) return;
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const savedKey = getSavedKey();
      if (savedKey) headers["X-OpenRouter-Key"] = savedKey;

      const bodyObj: Record<string, string> = { domain };
      if (savedKey && selectedModel) bodyObj.model = selectedModel;

      let res: Response | null = null;
      const maxRetries = 3;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        res = await fetch("/api/ai-analysis", {
          method: "POST",
          headers,
          body: JSON.stringify(bodyObj),
        });
        if (res.status !== 503) break;
      }
      if (!res) throw new Error("No response from AI API");

      if (res.status === 429) {
        const rl = await res.json() as RateLimitResponse;
        if (rl.rate_limited) {
          setRateLimited(rl);
          setLoading(false);
          return;
        }
      }

      const json = await res.json() as AIAnalysisResponse;
      if (!res.ok || json.error) {
        setError(json.error || `API error ${res.status}`);
      } else if (json.result) {
        setInsightsResult(json.result);
        _insightsCache[domain] = json.result;
        if (json.analyzed_at) {
          const meta = { analyzed_at: json.analyzed_at, cached: !!json.cached };
          setAnalysisMetadata(meta);
          _metadataCache[domain] = meta;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate analysis");
    } finally {
      setLoading(false);
    }
  }, [domain, insightsResult, selectedModel, loading]);

  const handleKeyChange = (key: string) => {
    setKeyVersion(v => v + 1);
    if (key && rateLimited) {
      setRateLimited(null);
    }
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    setInsightsResult(null);
    delete _insightsCache[domain];
  };

  // Rate limited
  if (rateLimited) {
    return <RateLimitView data={rateLimited} onKeySet={handleKeyChange} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Advanced Settings */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <AdvancedSettings domain={domain} onKeyChange={handleKeyChange} onModelChange={handleModelChange} />
      </div>

      {/* 1. Grade-Up Simulator (deterministic) */}
      {analysisData && <GradeUpSimulator data={analysisData} />}

      {/* 2. Quick Wins (deterministic) */}
      {analysisData && <QuickWinsPanel actionItems={actionItems} data={analysisData} />}

      {/* 3. Top Priorities (deterministic) */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px",
        padding: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <Target size={14} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Key Findings</span>
          <span style={{ fontSize: "10px", color: "var(--muted)", marginLeft: "auto" }}>ranked by impact</span>
        </div>
        {actionItems.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0 4px", fontSize: "13px", color: "var(--success)" }}>
            <CheckCircle2 size={14} />
            <span>This domain is well-configured. No critical issues found.</span>
          </div>
        ) : (() => {
          const DEFAULT_VISIBLE = 5;
          const hasMore = actionItems.length > DEFAULT_VISIBLE;
          const visibleItems = prioritiesExpanded ? actionItems : actionItems.slice(0, DEFAULT_VISIBLE);
          return (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
            {visibleItems.map((item, i) => {
              const severityColor = item.severity === "critical" ? "var(--danger)"
                : item.severity === "high" ? "#f59e0b"
                : item.severity === "medium" ? "var(--warning)"
                : "var(--muted)";
              const severityIcon = item.severity === "critical" ? "🔴"
                : item.severity === "high" ? "🟠"
                : item.severity === "medium" ? "🟡"
                : "🟢";
              const ref = findReferenceLink(item.title);

              // Try to get a fix link from the grade-up engine
              const plan = analysisData ? generateGradeUpPlan(analysisData) : null;
              const gradeUpMatch = plan?.items.find(g =>
                item.title.toLowerCase().includes(g.fixDescription.toLowerCase().slice(0, 15))
              );
              const fixLink = gradeUpMatch?.fixLink || null;

              return (
                <div key={i} style={{
                  display: "flex", flexDirection: "column", gap: "3px",
                  paddingLeft: "12px", borderLeft: `2px solid ${severityColor}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "11px", flexShrink: 0 }}>{severityIcon}</span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>{item.title}</span>
                    {(ref || fixLink) && (
                      <a
                        href={(fixLink || ref)!.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={(fixLink || ref)!.label}
                        style={{ color: "var(--dim)", flexShrink: 0, opacity: 0.5, transition: "opacity 0.15s", display: "flex", alignItems: "center" }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
                      >
                        <ExternalLink size={10} />
                      </a>
                    )}
                    {item.effort && (
                      <span style={{ fontSize: "10px", color: "var(--muted)", marginLeft: "auto", whiteSpace: "nowrap", flexShrink: 0 }}>{item.effort}</span>
                    )}
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.4, paddingLeft: "17px" }}>{item.reason}</span>
                </div>
              );
            })}
            {hasMore && (
              <button
                onClick={() => setPrioritiesExpanded(prev => !prev)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: "4px 0 0",
                  display: "flex", alignItems: "center", gap: "4px",
                  fontSize: "11px", color: "var(--muted)", transition: "color 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
              >
                {prioritiesExpanded ? (
                  <><ChevronUp size={12} /> Show less</>
                ) : (
                  <><ChevronDown size={12} /> Show {actionItems.length - DEFAULT_VISIBLE} more</>
                )}
              </button>
            )}
          </div>
          );
        })()}
      </div>

      {/* 4. Cross-Signal Insights (LLM) */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <Sparkles size={14} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
            Cross-Signal Insights
          </span>
          <span style={{ fontSize: "10px", color: "var(--muted)", marginLeft: "4px" }}>
            — AI-powered correlations across your data
          </span>
        </div>

        {/* Analysis timestamp */}
        {analysisMetadata && insightsResult && (
          <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
            {analysisMetadata.cached ? "Cached" : "Generated"} {new Date(analysisMetadata.analyzed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
        )}

        {/* Loading state */}
        {loading && <AILoadingIndicator />}

        {/* Results */}
        {insightsResult && insightsResult.cross_signal_insights && (
          <CrossSignalInsightsCard insights={insightsResult.cross_signal_insights} />
        )}

        {/* Error display */}
        {error && (
          <div style={{
            background: "rgba(248,81,73,0.1)", border: "1px solid rgba(248,81,73,0.3)",
            borderRadius: "8px", padding: "12px", display: "flex", alignItems: "center", gap: "8px",
          }}>
            <XCircle size={14} style={{ color: "var(--danger)" }} />
            <span style={{ fontSize: "12px", color: "var(--danger)" }}>{error}</span>
            <button
              onClick={() => { setInsightsResult(null); delete _insightsCache[domain]; generateInsights(); }}
              style={{
                marginLeft: "auto", padding: "4px 10px", borderRadius: "4px",
                border: "1px solid var(--border)", background: "var(--card)",
                color: "var(--text)", cursor: "pointer", fontSize: "11px",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Generate button */}
        {!insightsResult && !loading && !error && (
          <div style={{
            textAlign: "center", padding: "20px",
            background: "var(--card)", border: "1px dashed var(--border)", borderRadius: "8px",
          }}>
            {streaming ? (
              <>
                <Loader2 size={20} style={{ color: "var(--accent)", opacity: 0.6, margin: "0 auto 8px", animation: "spin 1s linear infinite" }} />
                <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }}>
                  Waiting for analysis to complete before generating AI insights...
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 12px 0", lineHeight: 1.5 }}>
                  AI finds non-obvious correlations between your signals — things like mismatched DMARC/DKIM configs, SSL/HSTS conflicts, or redundant third-party scripts.
                </p>
                <button
                  onClick={generateInsights}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    padding: "8px 18px", borderRadius: "8px",
                    border: "1px solid var(--accent)", background: "rgba(88,166,255,0.1)",
                    color: "var(--accent)", cursor: "pointer", fontSize: "13px", fontWeight: 600,
                  }}
                >
                  <Sparkles size={14} />
                  Generate Cross-Signal Insights
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
