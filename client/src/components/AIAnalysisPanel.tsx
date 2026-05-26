import { useState, useCallback, useEffect } from "react";
import { Sparkles, Shield, Server, Gauge, TrendingUp, Search, Mail, AlertTriangle, CheckCircle2, Info, XCircle, Loader2, Zap, Target, Users, DollarSign, Code, BarChart3, Key, Copy, Check, ChevronDown, ChevronUp, Settings, Eye, EyeOff, RotateCcw, ExternalLink } from "lucide-react";
import type { AnalysisResult } from "../utils/types";
import { findReferenceLink } from "./DomainSignals";

// ─── Types ──────────────────────────────────────────────────────────

interface AIAnalysisResult {
  summary: string;
  posture: string;
  risk_level?: string;
  key_findings: Array<{ category: string; finding: string; severity: string; action: string }>;
  persona_insights: Record<string, string>;
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

      // Only add cross-axis insight if there's a meaningful gap
      if (weakest[1].score != null && strongest[1].score != null && strongest[1].score - weakest[1].score >= 15) {
        items.push({
          title: `Biggest opportunity: ${axisLabels[weakest[0]]}`,
          reason: `${axisLabels[weakest[0]]} (${weakest[1].score}) is your lowest axis while ${axisLabels[strongest[0]]} (${strongest[1].score}) is strong. Focus on ${axisAdvice[weakest[0]]} for the most impact on your overall score.`,
          effort: "See recommendations above",
          axis: weakest[0],
          severity: "medium",
          impact: 80, // high impact for cross-axis — always show near top
        });
      }

      // Special insight: security strong but performance weak
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

      // Special insight: email auth dragging two axes
      if (axes.security?.score != null && axes.trust?.score != null) {
        const secFindings = axes.security.findings || [];
        const trustFindings = axes.trust.findings || [];
        const emailSecIssue = secFindings.some(f => f.signal?.includes("email") || f.label?.toLowerCase().includes("dkim") || f.label?.toLowerCase().includes("spf"));
        const emailTrustIssue = trustFindings.some(f => f.label?.toLowerCase().includes("email") || f.label?.toLowerCase().includes("authentication"));
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

    // Not-measured warning
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

  // Return top 5 max, but ensure at least one cross-axis insight if available
  const top = items.slice(0, 5);
  const hasCrossAxis = top.some(i => i.title.startsWith("Biggest opportunity") || i.title.startsWith("Security is solid") || i.title.startsWith("Email auth impacts"));
  if (!hasCrossAxis) {
    const crossAxis = items.find(i => i.title.startsWith("Biggest opportunity") || i.title.startsWith("Security is solid") || i.title.startsWith("Email auth impacts"));
    if (crossAxis && top.length >= 5) {
      top[4] = crossAxis;
    } else if (crossAxis) {
      top.push(crossAxis);
    }
  }

  return top;
}

// ─── BYO Key helpers ────────────────────────────────────────────────

const STORAGE_KEY = "yoke_openrouter_key";
const MODEL_STORAGE_KEY = "yoke_openrouter_model";
const CUSTOM_PROMPT_KEY = "yoke_custom_prompt";
const SETTINGS_OPEN_KEY = "yoke_settings_open";

const AVAILABLE_MODELS = [
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
  try { return localStorage.getItem(MODEL_STORAGE_KEY) || "anthropic/claude-sonnet-4"; } catch { return "anthropic/claude-sonnet-4"; }
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
      {/* Gear toggle button */}
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

      {/* Expanded settings panel */}
      {open && (
        <div style={{
          marginTop: "10px", background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: "10px", padding: "16px", display: "flex", flexDirection: "column", gap: "16px",
        }}>
          {/* ── API Key Section ── */}
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
                {" "}to access models like Claude, GPT-4o, and Gemini. Without a key, you get 10 analyses/hr on our shared key. With your own, you get unlimited access, model selection, and prompt editing.
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

          {/* ── Model Selector (disabled without BYO key) ── */}
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

          {/* ── Prompt Editor (disabled without BYO key) ── */}
            <div style={{ opacity: hasKey ? 1 : 0.45, pointerEvents: hasKey ? "auto" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <Code size={12} style={{ color: "var(--accent)" }} />
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

          {/* ── Status footer ── */}
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
              {hasKey ? AVAILABLE_MODELS.find(m => m.id === model)?.label || model : "Claude Sonnet 4"}
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
    } catch { /* fallback: textarea select */ }
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

// ─── Persona Definitions ────────────────────────────────────────────

type PersonaKey = "security_researcher" | "developer" | "seo_professional" | "site_owner" | "competitor_analyst" | "domain_buyer";

const PERSONAS: { key: PersonaKey; label: string; icon: typeof Shield; desc: string }[] = [
  { key: "security_researcher", label: "Security", icon: Shield, desc: "Vulnerabilities, attack surface, and security posture" },
  { key: "developer", label: "Developer", icon: Code, desc: "Tech stack, performance, and integration concerns" },
  { key: "seo_professional", label: "SEO", icon: Search, desc: "Visibility, structured data, and discoverability" },
  { key: "site_owner", label: "Owner", icon: Users, desc: "Overall health, trust signals, and compliance" },
  { key: "competitor_analyst", label: "Competitor", icon: BarChart3, desc: "Market positioning, tech choices, and gaps" },
  { key: "domain_buyer", label: "Buyer", icon: DollarSign, desc: "Domain value, age, history, and acquisition risk" },
];

// ─── AI Loading Indicator ───────────────────────────────────────────

const ESTIMATED_SECONDS = 30;

const LOADING_PHASES = [
  { at: 0, msg: "Preparing analysis data…" },
  { at: 3, msg: "Sending to AI model…" },
  { at: 6, msg: "Analyzing security posture…" },
  { at: 12, msg: "Evaluating infrastructure & performance…" },
  { at: 18, msg: "Synthesizing expert insights…" },
  { at: 25, msg: "Formatting recommendations…" },
  { at: 35, msg: "Still working — complex domains take longer…" },
  { at: 50, msg: "Almost there…" },
];

function AILoadingIndicator({ personaLabel }: { personaLabel: string }) {
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
      <div style={{
        height: "3px", borderRadius: "2px", background: "var(--border)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: "2px",
          background: "var(--accent)",
          width: `${progress * 100}%`,
          transition: "width 1s linear",
        }} />
      </div>
      <span style={{ fontSize: "10px", color: "var(--muted)" }}>
        {personaLabel} analysis typically takes ~{ESTIMATED_SECONDS}s
      </span>
    </div>
  );
}

// ─── AI Persona Insight Card ────────────────────────────────────────

function PersonaInsightCard({
  persona,
  insight,
  loading,
  onGenerate,
}: {
  persona: typeof PERSONAS[number];
  insight: string | null;
  loading: boolean;
  onGenerate: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (insight === null && !loading) {
    return (
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px",
        padding: "16px", textAlign: "center",
      }}>
        <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "12px", lineHeight: 1.5 }}>
          {persona.desc}
        </p>
        <button onClick={onGenerate} style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          padding: "7px 16px", borderRadius: "6px",
          border: "1px solid var(--accent)", background: "rgba(88,166,255,0.1)",
          color: "var(--accent)", cursor: "pointer", fontSize: "12px", fontWeight: 600,
        }}>
          <Sparkles size={12} />
          Generate {persona.label} Analysis
        </button>
      </div>
    );
  }

  if (loading) {
    return <AILoadingIndicator personaLabel={persona.label} />;
  }

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px",
      padding: "14px", fontSize: "13px", lineHeight: 1.7, color: "var(--text)",
    }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", marginBottom: expanded ? "8px" : 0 }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {persona.label} Analysis
        </span>
        {expanded ? <ChevronUp size={14} style={{ color: "var(--muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--muted)" }} />}
      </div>
      {expanded && <div>{insight}</div>}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function AIAnalysisPanel({ domain, analysisData }: { domain: string; analysisData?: AnalysisResult }) {
  const [activePersona, setActivePersona] = useState<PersonaKey | null>(null);
  const [personaResults, setPersonaResults] = useState<Record<string, string>>({});
  const [loadingPersona, setLoadingPersona] = useState<string | null>(null);
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<RateLimitResponse | null>(null);
  const [analysisMetadata, setAnalysisMetadata] = useState<{ analyzed_at: string; cached: boolean } | null>(null);
  const [, setKeyVersion] = useState(0);
  const [selectedModel, setSelectedModel] = useState(getSavedModel);

  const actionItems = analysisData ? generateActionItems(analysisData) : [];

  const generateForPersona = useCallback(async (personaKey: PersonaKey) => {
    if (personaResults[personaKey]) return; // already cached
    if (loadingPersona) return; // another request in flight — wait for it (it returns all personas)
    setLoadingPersona(personaKey);
    setPersonaError(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const savedKey = getSavedKey();
      if (savedKey) headers["X-OpenRouter-Key"] = savedKey;

      const bodyObj: Record<string, string> = { domain };
      if (savedKey && selectedModel) bodyObj.model = selectedModel;

      // Retry with exponential backoff on 503
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
          setLoadingPersona(null);
          return;
        }
      }

      const json = await res.json() as AIAnalysisResponse;
      if (!res.ok || json.error) {
        setPersonaError(json.error || `API error ${res.status}`);
      } else if (json.result?.persona_insights) {
        // Cache ALL persona results from this response
        const insights = json.result.persona_insights;
        setPersonaResults(prev => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(insights)) {
            if (value) next[key] = value;
          }
          return next;
        });
        if (json.analyzed_at) {
          setAnalysisMetadata({ analyzed_at: json.analyzed_at, cached: !!json.cached });
        }
      }
    } catch (err) {
      setPersonaError(err instanceof Error ? err.message : "Failed to generate analysis");
    } finally {
      setLoadingPersona(null);
    }
  }, [domain, personaResults, selectedModel, loadingPersona]);

  const handleKeyChange = (key: string) => {
    setKeyVersion(v => v + 1);
    if (key && rateLimited) {
      setRateLimited(null);
    }
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    // Clear cached persona results since model changed
    setPersonaResults({});
  };

  const handlePersonaClick = (key: PersonaKey) => {
    if (activePersona === key) {
      setActivePersona(null); // toggle off
    } else {
      setActivePersona(key);
      if (!personaResults[key]) {
        generateForPersona(key);
      }
    }
  };

  // ─── Rate limited ───
  if (rateLimited) {
    return <RateLimitView data={rateLimited} onKeySet={handleKeyChange} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* ─── Advanced Settings (gear button + panel) ─── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <AdvancedSettings domain={domain} onKeyChange={handleKeyChange} onModelChange={handleModelChange} />
      </div>

      {/* ─── Top Priorities ─── */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px",
        padding: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <Target size={14} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Top Priorities</span>
          <span style={{ fontSize: "10px", color: "var(--muted)", marginLeft: "auto" }}>ranked by impact</span>
        </div>
        {actionItems.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0 4px", fontSize: "13px", color: "var(--success)" }}>
            <CheckCircle2 size={14} />
            <span>This domain is well-configured. No critical issues found.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
            {actionItems.map((item, i) => {
              const severityColor = item.severity === "critical" ? "var(--danger)"
                : item.severity === "high" ? "#f59e0b"
                : item.severity === "medium" ? "var(--warning)"
                : "var(--muted)";
              const severityIcon = item.severity === "critical" ? "🔴"
                : item.severity === "high" ? "🟠"
                : item.severity === "medium" ? "🟡"
                : "🟢";
              const ref = findReferenceLink(item.title);
              return (
                <div key={i} style={{
                  display: "flex", flexDirection: "column", gap: "3px",
                  paddingLeft: "12px", borderLeft: `2px solid ${severityColor}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "11px", flexShrink: 0 }}>{severityIcon}</span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>{item.title}</span>
                    {ref && (
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={ref.label}
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
          </div>
        )}
      </div>

      {/* ─── AI Deep Dive — Persona Pills ─── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <Sparkles size={14} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
            AI Deep Dive
          </span>
          <span style={{ fontSize: "10px", color: "var(--muted)", marginLeft: "4px" }}>
            — click a perspective for AI-powered insights
          </span>
        </div>

        {/* Persona pill tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "12px", flexWrap: "wrap" }}>
          {PERSONAS.map(({ key, label, icon: PIcon }) => {
            const isActive = activePersona === key;
            const hasResult = !!personaResults[key];
            const isDisabled = !!loadingPersona && loadingPersona !== key;
            return (
              <button
                key={key}
                onClick={() => !isDisabled && handlePersonaClick(key)}
                disabled={isDisabled}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "6px 12px", borderRadius: "20px",
                  border: `1px solid ${isActive ? "var(--accent)" : hasResult ? "var(--success)" : "var(--border)"}`,
                  background: isActive ? "rgba(88,166,255,0.1)" : hasResult ? "rgba(46,160,67,0.06)" : "transparent",
                  color: isActive ? "var(--accent)" : hasResult ? "var(--success)" : "var(--muted)",
                  cursor: isDisabled ? "not-allowed" : "pointer", fontSize: "11px",
                  fontWeight: isActive ? 600 : 400,
                  opacity: isDisabled ? 0.5 : 1,
                  transition: "all 0.15s",
                }}
              >
                <PIcon size={12} />
                {label}
                {hasResult && !isActive && <Check size={10} />}
              </button>
            );
          })}
        </div>

        {/* Analysis timestamp */}
        {analysisMetadata && Object.keys(personaResults).length > 0 && (
          <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
            {analysisMetadata.cached ? "Cached" : "Generated"} {new Date(analysisMetadata.analyzed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
        )}

        {/* Active persona content */}
        {activePersona && (
          <PersonaInsightCard
            persona={PERSONAS.find(p => p.key === activePersona)!}
            insight={personaResults[activePersona] || null}
            loading={loadingPersona === activePersona}
            onGenerate={() => generateForPersona(activePersona)}
          />
        )}

        {/* Error display */}
        {personaError && (
          <div style={{
            background: "rgba(248,81,73,0.1)", border: "1px solid rgba(248,81,73,0.3)",
            borderRadius: "8px", padding: "12px", display: "flex", alignItems: "center", gap: "8px",
          }}>
            <XCircle size={14} style={{ color: "var(--danger)" }} />
            <span style={{ fontSize: "12px", color: "var(--danger)" }}>{personaError}</span>
            <button
              onClick={() => activePersona && generateForPersona(activePersona)}
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

        {/* No persona selected — subtle prompt */}
        {!activePersona && Object.keys(personaResults).length === 0 && (
          <div style={{
            textAlign: "center", padding: "20px",
            background: "var(--card)", border: "1px dashed var(--border)", borderRadius: "8px",
          }}>
            <Sparkles size={20} style={{ color: "var(--muted)", opacity: 0.4, margin: "0 auto 8px" }} />
            <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }}>
              Select a perspective above for AI-powered analysis tailored to that role.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
