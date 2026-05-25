import { useState } from "react";
import { Sparkles, Shield, Server, Gauge, TrendingUp, Search, Mail, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Info, XCircle, Loader2, Zap, Target, Users, DollarSign, Code, BarChart3, Key, Copy, Check, Settings } from "lucide-react";

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
  risk_level?: string; // legacy cached results
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

// ─── Helpers ────────────────────────────────────────────────────────

const POSTURE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  strong: { bg: "rgba(46, 160, 67, 0.15)", text: "var(--success)", border: "rgba(46, 160, 67, 0.4)" },
  fair: { bg: "rgba(210, 153, 34, 0.15)", text: "var(--warning)", border: "rgba(210, 153, 34, 0.4)" },
  poor: { bg: "rgba(219, 109, 40, 0.15)", text: "#db6d28", border: "rgba(219, 109, 40, 0.4)" },
  critical: { bg: "rgba(248, 81, 73, 0.15)", text: "var(--danger)", border: "rgba(248, 81, 73, 0.4)" },
  // Legacy risk_level fallbacks for cached results
  low: { bg: "rgba(46, 160, 67, 0.15)", text: "var(--success)", border: "rgba(46, 160, 67, 0.4)" },
  medium: { bg: "rgba(210, 153, 34, 0.15)", text: "var(--warning)", border: "rgba(210, 153, 34, 0.4)" },
  high: { bg: "rgba(219, 109, 40, 0.15)", text: "#db6d28", border: "rgba(219, 109, 40, 0.4)" },
};

const SEVERITY_ICONS: Record<string, typeof CheckCircle2> = {
  info: Info,
  low: CheckCircle2,
  medium: AlertTriangle,
  high: XCircle,
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "var(--muted)",
  low: "var(--success)",
  medium: "var(--warning)",
  high: "var(--danger)",
};

const CATEGORY_ICONS: Record<string, typeof Shield> = {
  security: Shield,
  infrastructure: Server,
  performance: Gauge,
  trust: TrendingUp,
  seo: Search,
  email: Mail,
};

const EFFORT_COLORS: Record<string, { bg: string; text: string }> = {
  low: { bg: "rgba(46, 160, 67, 0.15)", text: "var(--success)" },
  medium: { bg: "rgba(210, 153, 34, 0.15)", text: "var(--warning)" },
  high: { bg: "rgba(248, 81, 73, 0.15)", text: "var(--danger)" },
};

type PersonaKey = keyof PersonaInsights;

const PERSONAS: { key: PersonaKey; label: string; icon: typeof Shield }[] = [
  { key: "site_owner", label: "Owner", icon: Users },
  { key: "security_researcher", label: "Security", icon: Shield },
  { key: "competitor_analyst", label: "Competitor", icon: BarChart3 },
  { key: "domain_buyer", label: "Buyer", icon: DollarSign },
  { key: "developer", label: "Developer", icon: Code },
  { key: "seo_professional", label: "SEO", icon: Search },
];

// ─── Sub-Components ─────────────────────────────────────────────────

// Map legacy risk_level values to posture labels
const POSTURE_LABEL_MAP: Record<string, string> = {
  strong: "Strong",
  fair: "Fair",
  poor: "Poor",
  critical: "Critical",
  low: "Strong",       // legacy
  medium: "Fair",      // legacy
  high: "Poor",        // legacy
};

function PostureBadge({ level }: { level: string }) {
  const colors = POSTURE_COLORS[level] || POSTURE_COLORS.fair;
  const label = POSTURE_LABEL_MAP[level] || level;
  return (
    <span
      style={{
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        padding: "4px 12px",
        borderRadius: "6px",
        fontSize: "12px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {label} posture
    </span>
  );
}

function FindingCard({ finding }: { finding: KeyFinding }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = SEVERITY_ICONS[finding.severity] || Info;
  const color = SEVERITY_COLORS[finding.severity] || "var(--muted)";
  const CatIcon = CATEGORY_ICONS[finding.category] || Info;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "12px",
        cursor: "pointer",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <Icon size={16} style={{ color, marginTop: "2px", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <CatIcon size={12} style={{ color: "var(--muted)" }} />
            <span style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {finding.category}
            </span>
          </div>
          <div style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.5 }}>
            {finding.finding}
          </div>
          {expanded && finding.action && (
            <div
              style={{
                marginTop: "8px",
                padding: "8px 10px",
                background: "var(--bg)",
                borderRadius: "6px",
                fontSize: "12px",
                color: "var(--muted)",
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "var(--text)" }}>Action:</strong> {finding.action}
            </div>
          )}
        </div>
        {finding.action && (
          expanded ? <ChevronUp size={14} style={{ color: "var(--muted)", flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
        )}
      </div>
    </div>
  );
}

function PersonaSwitcher({ insights }: { insights: PersonaInsights }) {
  const [active, setActive] = useState<PersonaKey>("site_owner");

  return (
    <div>
      <div style={{ display: "flex", gap: "4px", marginBottom: "12px", flexWrap: "wrap" }}>
        {PERSONAS.map(({ key, label, icon: PIcon }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "5px 10px",
              borderRadius: "6px",
              border: `1px solid ${active === key ? "var(--accent)" : "var(--border)"}`,
              background: active === key ? "rgba(88, 166, 255, 0.1)" : "transparent",
              color: active === key ? "var(--accent)" : "var(--muted)",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: active === key ? 600 : 400,
              transition: "all 0.15s",
            }}
          >
            <PIcon size={12} />
            {label}
          </button>
        ))}
      </div>
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "14px",
          fontSize: "13px",
          lineHeight: 1.7,
          color: "var(--text)",
        }}
      >
        {insights[active] || "No insights available for this persona."}
      </div>
    </div>
  );
}

function RecommendationItem({ rec }: { rec: Recommendation }) {
  const effortStyle = EFFORT_COLORS[rec.effort] || EFFORT_COLORS.medium;
  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        padding: "10px 12px",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
      }}
    >
      <div
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          background: "rgba(88, 166, 255, 0.15)",
          color: "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "12px",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {rec.priority}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.5, marginBottom: "4px" }}>
          {rec.action}
        </div>
        <div style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>
          {rec.impact}
        </div>
      </div>
      <span
        style={{
          padding: "2px 8px",
          borderRadius: "4px",
          fontSize: "10px",
          fontWeight: 600,
          textTransform: "uppercase",
          background: effortStyle.bg,
          color: effortStyle.text,
          alignSelf: "flex-start",
          flexShrink: 0,
        }}
      >
        {rec.effort}
      </span>
    </div>
  );
}

// ─── Section Header ─────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title }: { icon: typeof Shield; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", marginTop: "20px" }}>
      <Icon size={14} style={{ color: "var(--accent)" }} />
      <span style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
        {title}
      </span>
    </div>
  );
}

// ─── BYO Key helpers ────────────────────────────────────────────────

const STORAGE_KEY = "yoke_openrouter_key";

function getSavedKey(): string {
  try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}
function saveKey(key: string) {
  try { if (key) localStorage.setItem(STORAGE_KEY, key); else localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

// ─── BYO Key Settings Popover ───────────────────────────────────────

function KeySettings({ onSave }: { onSave: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(getSavedKey);
  const [saved, setSaved] = useState(false);
  const hasKey = !!getSavedKey();

  const handleSave = () => {
    saveKey(value.trim());
    onSave(value.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        title={hasKey ? "API key configured" : "Set OpenRouter API key"}
        style={{
          display: "flex", alignItems: "center", gap: "4px",
          padding: "4px 8px", borderRadius: "6px",
          border: `1px solid ${hasKey ? "var(--success)" : "var(--border)"}`,
          background: hasKey ? "rgba(46,160,67,0.1)" : "transparent",
          color: hasKey ? "var(--success)" : "var(--muted)",
          cursor: "pointer", fontSize: "11px",
        }}
      >
        <Key size={12} />
        {hasKey ? "Key ✓" : "API Key"}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: "6px", zIndex: 100,
          background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "10px",
          padding: "14px", width: "320px", boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)", marginBottom: "4px" }}>
            OpenRouter API Key
          </div>
          <p style={{ fontSize: "11px", color: "var(--muted)", margin: "0 0 10px 0", lineHeight: 1.5 }}>
            Bring your own key for unlimited AI analysis. Get one free at{" "}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>openrouter.ai/keys</a>.
            Stored locally only — never sent to Yoke servers.
          </p>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              type="password"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="sk-or-v1-..."
              style={{
                flex: 1, padding: "6px 10px", borderRadius: "6px",
                border: "1px solid var(--border)", background: "var(--card)",
                color: "var(--text)", fontSize: "12px", outline: "none",
                fontFamily: "monospace",
              }}
            />
            <button onClick={handleSave} style={{
              padding: "6px 12px", borderRadius: "6px",
              border: "1px solid var(--accent)", background: "rgba(88,166,255,0.1)",
              color: "var(--accent)", cursor: "pointer", fontSize: "12px", fontWeight: 600,
            }}>
              {saved ? "Saved!" : "Save"}
            </button>
          </div>
          {value && (
            <button onClick={() => { setValue(""); saveKey(""); onSave(""); }} style={{
              marginTop: "8px", padding: "4px 8px", borderRadius: "4px",
              border: "none", background: "transparent",
              color: "var(--danger)", cursor: "pointer", fontSize: "11px",
            }}>
              Remove key
            </button>
          )}
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

      {/* Option 1: Copy prompt */}
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

      {/* Option 2: BYO key */}
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

// ─── Main Component ─────────────────────────────────────────────────

export function AIAnalysisPanel({ domain }: { domain: string }) {
  const [data, setData] = useState<AIAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<RateLimitResponse | null>(null);
  const [, setKeyVersion] = useState(0); // force re-render on key change

  const generate = async () => {
    setLoading(true);
    setError(null);
    setRateLimited(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const savedKey = getSavedKey();
      if (savedKey) headers["X-OpenRouter-Key"] = savedKey;

      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers,
        body: JSON.stringify({ domain }),
      });

      if (res.status === 429) {
        const rl = await res.json() as RateLimitResponse;
        if (rl.rate_limited) {
          setRateLimited(rl);
          return;
        }
      }

      const json = await res.json() as AIAnalysisResponse;
      if (!res.ok || json.error) {
        setError(json.error || `API error ${res.status}`);
      } else {
        setData(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate analysis");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyChange = (key: string) => {
    setKeyVersion(v => v + 1);
    // If currently rate-limited and key was just set, auto-retry
    if (key && rateLimited) {
      setRateLimited(null);
      setTimeout(generate, 100);
    }
  };

  // ─── Rate limited ───
  if (rateLimited) {
    return <RateLimitView data={rateLimited} onKeySet={handleKeyChange} />;
  }

  // ─── Not yet generated ───
  if (!data && !loading && !error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", textAlign: "center" }}>
        <div style={{ position: "absolute", top: "12px", right: "12px" }}>
          <KeySettings onSave={handleKeyChange} />
        </div>
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "16px",
            background: "rgba(88, 166, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "16px",
          }}
        >
          <Sparkles size={28} style={{ color: "var(--accent)" }} />
        </div>
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text)", marginBottom: "8px" }}>
          AI Domain Analysis
        </h3>
        <p style={{ fontSize: "13px", color: "var(--muted)", maxWidth: "400px", lineHeight: 1.6, marginBottom: "20px" }}>
          Get an AI-powered assessment synthesizing all collected data — security posture, infrastructure choices, and actionable recommendations tailored to different personas.
        </p>
        <button
          onClick={generate}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            borderRadius: "8px",
            border: "1px solid var(--accent)",
            background: "rgba(88, 166, 255, 0.1)",
            color: "var(--accent)",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
            transition: "all 0.15s",
          }}
        >
          <Sparkles size={14} />
          Generate AI Analysis
        </button>
      </div>
    );
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", textAlign: "center" }}>
        <Loader2 size={32} style={{ color: "var(--accent)", animation: "spin 1s linear infinite", marginBottom: "16px" }} />
        <p style={{ fontSize: "14px", color: "var(--text)", marginBottom: "6px" }}>Analyzing {domain}...</p>
        <p style={{ fontSize: "12px", color: "var(--muted)" }}>AI is synthesizing 25+ data points into actionable intelligence</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  // ─── Error ───
  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", textAlign: "center" }}>
        <XCircle size={32} style={{ color: "var(--danger)", marginBottom: "16px" }} />
        <p style={{ fontSize: "14px", color: "var(--text)", marginBottom: "6px" }}>Analysis Failed</p>
        <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "16px", maxWidth: "400px" }}>{error}</p>
        <button
          onClick={generate}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--text)",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  // ─── Results ───
  if (!data?.result) return null;
  const { result, analyzed_at, cached } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, right: 0, zIndex: 10 }}>
        <KeySettings onSave={handleKeyChange} />
      </div>
      {/* Summary + Risk Level */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Sparkles size={16} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>AI Assessment</span>
          </div>
          <PostureBadge level={result.posture || result.risk_level || "fair"} />
        </div>
        <p style={{ fontSize: "13px", lineHeight: 1.7, color: "var(--text)", margin: 0 }}>
          {result.summary}
        </p>
        <div style={{ marginTop: "10px", fontSize: "10px", color: "var(--muted)" }}>
          {cached ? "Cached" : "Generated"} {analyzed_at ? new Date(analyzed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
          {result._usage ? ` · ${result._usage.total_tokens} tokens` : ""}
        </div>
      </div>

      {/* Key Findings */}
      {result.key_findings?.length > 0 && (
        <>
          <SectionTitle icon={Zap} title="Key Findings" />
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {result.key_findings.map((f, i) => (
              <FindingCard key={`finding-${i}`} finding={f} />
            ))}
          </div>
        </>
      )}

      {/* Persona Insights */}
      {result.persona_insights && (
        <>
          <SectionTitle icon={Users} title="Persona Insights" />
          <PersonaSwitcher insights={result.persona_insights} />
        </>
      )}

      {/* Attack Surface */}
      {result.attack_surface?.length > 0 && (
        <>
          <SectionTitle icon={Target} title="Attack Surface" />
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "12px",
            }}
          >
            {result.attack_surface.map((item, i) => (
              <div
                key={`attack-${i}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  padding: "6px 0",
                  borderBottom: i < result.attack_surface.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <AlertTriangle size={12} style={{ color: "var(--warning)", marginTop: "3px", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", color: "var(--text)", lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Recommendations */}
      {result.recommendations?.length > 0 && (
        <>
          <SectionTitle icon={CheckCircle2} title="Recommendations" />
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {result.recommendations.map((rec, i) => (
              <RecommendationItem key={`rec-${i}`} rec={rec} />
            ))}
          </div>
        </>
      )}

      {/* Regenerate button */}
      <div style={{ marginTop: "20px", display: "flex", justifyContent: "center" }}>
        <button
          onClick={generate}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--muted)",
            cursor: "pointer",
            fontSize: "11px",
          }}
        >
          <Sparkles size={12} />
          Regenerate Analysis
        </button>
      </div>
    </div>
  );
}
