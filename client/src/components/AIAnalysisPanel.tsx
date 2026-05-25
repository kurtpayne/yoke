import { useState, useCallback } from "react";
import { Sparkles, Shield, Server, Gauge, TrendingUp, Search, Mail, AlertTriangle, CheckCircle2, Info, XCircle, Loader2, Zap, Target, Users, DollarSign, Code, BarChart3, Key, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import type { AnalysisResult } from "../utils/types";

// ─── Types ──────────────────────────────────────────────────────────

interface AIAnalysisResult {
  summary: string;
  posture: string;
  risk_level?: string;
  key_findings: Array<{ category: string; finding: string; severity: string; action: string }>;
  persona_insights: Record<string, string>;
  attack_surface: string[];
  recommendations: Array<{ priority: number; action: string; impact: string; effort: string }>;
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

// ─── Deterministic Key Findings ─────────────────────────────────────

interface DetFinding {
  icon: string;
  text: string;
  severity: "critical" | "warning" | "info" | "good";
}

function generateKeyFindings(data: AnalysisResult): DetFinding[] {
  const findings: DetFinding[] = [];

  // SSL issues
  if (data.ssl) {
    if (data.ssl.error && !data.ssl.grade) {
      findings.push({ icon: "🔴", text: "SSL certificate issue: " + (data.ssl.error || "not detected"), severity: "critical" });
    } else if (data.ssl.grade) {
      if (data.ssl.grade.startsWith("A")) {
        findings.push({ icon: "✅", text: `SSL grade ${data.ssl.grade}`, severity: "good" });
      } else if (data.ssl.grade === "T") {
        findings.push({ icon: "🔴", text: "SSL certificate has trust issues", severity: "critical" });
      } else {
        findings.push({ icon: "🟡", text: `SSL grade ${data.ssl.grade} — room for improvement`, severity: "warning" });
      }
    }
    if (data.ssl.valid_to) {
      const daysLeft = Math.floor((new Date(data.ssl.valid_to).getTime() - Date.now()) / 86400000);
      if (daysLeft < 0) {
        findings.push({ icon: "🔴", text: "SSL certificate has expired", severity: "critical" });
      } else if (daysLeft <= 14) {
        findings.push({ icon: "🔴", text: `SSL certificate expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, severity: "critical" });
      } else if (daysLeft <= 30) {
        findings.push({ icon: "🟡", text: `SSL certificate expires in ${daysLeft} days`, severity: "warning" });
      }
    }
  }

  // Domain expiration
  if (data.rdap?.days_until_expiry != null) {
    if (data.rdap.days_until_expiry <= 30) {
      findings.push({ icon: "🔴", text: `Domain expires in ${data.rdap.days_until_expiry} day${data.rdap.days_until_expiry === 1 ? "" : "s"}`, severity: "critical" });
    } else if (data.rdap.days_until_expiry <= 90) {
      findings.push({ icon: "🟡", text: `Domain expires in ${data.rdap.days_until_expiry} days`, severity: "warning" });
    }
  }

  // Security headers
  if (data.headers) {
    const missing = data.headers.security_audit.filter(h => h.status === "fail").map(h => h.header);
    const critical = ["content-security-policy", "strict-transport-security"];
    const missingCritical = missing.filter(h => critical.includes(h.toLowerCase()));
    if (missingCritical.length > 0) {
      findings.push({ icon: "🟡", text: `Missing security header${missingCritical.length > 1 ? "s" : ""}: ${missingCritical.join(", ")}`, severity: "warning" });
    }
  }

  // Email auth
  if (data.email_auth) {
    const missing: string[] = [];
    if (!data.email_auth.spf?.found) missing.push("SPF");
    if (data.email_auth.dkim_selectors_found?.length === 0) missing.push("DKIM");
    if (!data.email_auth.dmarc?.found) missing.push("DMARC");
    if (missing.length > 0) {
      findings.push({ icon: "🟡", text: `Missing email authentication: ${missing.join(", ")}`, severity: "warning" });
    } else {
      const dmarcPolicy = data.email_auth.dmarc?.policy;
      if (dmarcPolicy === "reject" || dmarcPolicy === "quarantine") {
        findings.push({ icon: "✅", text: `Full email authentication (SPF + DKIM + DMARC ${dmarcPolicy})`, severity: "good" });
      }
    }
  }

  // Performance
  if (data.performance) {
    if (data.performance.score != null && data.performance.score < 50) {
      findings.push({ icon: "🔴", text: `Low performance score: ${data.performance.score}/100`, severity: "critical" });
    }
    if (data.performance.lcp != null && data.performance.lcp > 4000) {
      findings.push({ icon: "🟡", text: `Slow Largest Contentful Paint: ${(data.performance.lcp / 1000).toFixed(1)}s`, severity: "warning" });
    }
  }

  // DNSSEC
  if (data.dnssec) {
    if (!data.dnssec.enabled) {
      findings.push({ icon: "ℹ️", text: "DNSSEC not enabled", severity: "info" });
    }
  }

  // Accessibility
  if (data.accessibility) {
    const score = (data.accessibility as { score?: number }).score;
    if (score != null && score < 70) {
      findings.push({ icon: "🟡", text: `Accessibility score ${score}/100 — needs improvement`, severity: "warning" });
    }
  }

  // Blocklists
  if (data.blocklists) {
    const listed = data.blocklists.filter(b => b.listed);
    if (listed.length > 0) {
      findings.push({ icon: "🔴", text: `Listed on ${listed.length} blocklist${listed.length > 1 ? "s" : ""}: ${listed.map(b => b.name).join(", ")}`, severity: "critical" });
    }
  }

  // Breaches
  if (data.breaches && data.breaches.items && data.breaches.items.length > 0) {
    findings.push({ icon: "🟡", text: `${data.breaches.items.length} known data breach${data.breaches.items.length > 1 ? "es" : ""} associated with this domain`, severity: "warning" });
  }

  // Status
  if (data.status && !data.status.is_up) {
    findings.push({ icon: "🔴", text: "Site appears to be down", severity: "critical" });
  }

  // Sort: critical first, then warning, info, good
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2, good: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  // If no issues found, add a positive message
  if (findings.length === 0) {
    findings.push({ icon: "✅", text: "No critical issues detected — looking good!", severity: "good" });
  }

  return findings.slice(0, 7);
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
    return (
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px",
        padding: "20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
      }}>
        <Loader2 size={16} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: "12px", color: "var(--muted)" }}>Analyzing from {persona.label.toLowerCase()} perspective…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
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
  const [, setKeyVersion] = useState(0);

  const keyFindings = analysisData ? generateKeyFindings(analysisData) : [];

  const generateForPersona = useCallback(async (personaKey: PersonaKey) => {
    if (personaResults[personaKey]) return; // already cached
    setLoadingPersona(personaKey);
    setPersonaError(null);

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
      }
    } catch (err) {
      setPersonaError(err instanceof Error ? err.message : "Failed to generate analysis");
    } finally {
      setLoadingPersona(null);
    }
  }, [domain, personaResults]);

  const handleKeyChange = (key: string) => {
    setKeyVersion(v => v + 1);
    if (key && rateLimited) {
      setRateLimited(null);
    }
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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, right: 0, zIndex: 10 }}>
        <KeySettings onSave={handleKeyChange} />
      </div>

      {/* ─── Deterministic Key Findings ─── */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px",
        padding: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <Zap size={14} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Key Findings</span>
          <span style={{ fontSize: "10px", color: "var(--muted)", marginLeft: "auto" }}>based on scan data</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {keyFindings.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", lineHeight: 1.5 }}>
              <span style={{ flexShrink: 0, fontSize: "12px" }}>{f.icon}</span>
              <span style={{
                color: f.severity === "critical" ? "var(--danger)"
                  : f.severity === "warning" ? "var(--warning)"
                  : f.severity === "good" ? "var(--success)"
                  : "var(--text)",
              }}>
                {f.text}
              </span>
            </div>
          ))}
        </div>
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
            return (
              <button
                key={key}
                onClick={() => handlePersonaClick(key)}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "6px 12px", borderRadius: "20px",
                  border: `1px solid ${isActive ? "var(--accent)" : hasResult ? "var(--success)" : "var(--border)"}`,
                  background: isActive ? "rgba(88,166,255,0.1)" : hasResult ? "rgba(46,160,67,0.06)" : "transparent",
                  color: isActive ? "var(--accent)" : hasResult ? "var(--success)" : "var(--muted)",
                  cursor: "pointer", fontSize: "11px",
                  fontWeight: isActive ? 600 : 400,
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
