import { ArrowLeft, Terminal, Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";

function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);
  return (
    <div style={{ position: "relative", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: "22px", overflowX: "auto", color: "var(--text)" }}>
      <button onClick={copy} style={{ position: "absolute", top: 8, right: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "var(--dim)", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--dim)"; }}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{code}</pre>
    </div>
  );
}

/** Read-only output block (no copy button, dimmer styling) */
function OutputBlock({ text }: { text: string }) {
  return (
    <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: "20px", overflowX: "auto", color: "var(--dim)" }}>
      <pre style={{ margin: 0, whiteSpace: "pre" }}>{text}</pre>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontFamily: "var(--font-ui)", fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 12, letterSpacing: "-0.01em" }}>{title}</h2>
      {children}
    </div>
  );
}

export default function CliPage() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px" }}>
      {/* Back link */}
      <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--dim)", textDecoration: "none", marginBottom: 24 }}
        onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={e => (e.currentTarget.style.color = "var(--dim)")}>
        <ArrowLeft size={14} /> Back to Yoke
      </a>

      {/* Hero */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Terminal size={24} style={{ color: "var(--accent)" }} />
          <h1 style={{ fontFamily: "var(--font-ui)", fontSize: 28, fontWeight: 800, color: "var(--text)", margin: 0, letterSpacing: "-0.02em" }}>Yoke CLI</h1>
        </div>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 14, color: "var(--dim)", lineHeight: "22px", margin: 0 }}>
          Domain intelligence from your terminal. Single binary, same data as the web app.
        </p>
      </div>

      {/* Install + first analysis — above the fold */}
      <Section title="Quick Start">
        <CopyBlock code={`curl -sSL https://yoke.lol/install.sh | bash`} />
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--dim)", margin: "8px 0 16px", lineHeight: "18px" }}>
          Downloads the latest release for your platform (macOS/Linux, amd64/arm64).
        </p>
        <CopyBlock code="yoke stripe.com" />
        <div style={{ marginTop: 8 }}>
          <OutputBlock text={`╭─────────────────────────────────────────────────────────────╮
│ stripe.com  91/100 A                                        │
│ application                                                 │
│                                                             │
│ SECURITY       ███████████████████░ 98                      │
│ PERFORMANCE    █████████████░░░░░░░ 69                      │
│ RELIABILITY    ███████████████████░ 97                      │
│ TRUST          ████████████████████ 100                     │
│ VISIBILITY     ███████████████████░ 97                      │
│                                                             │
│ SSL A+ · HTTP/2 · Stripe · LCP 5.6s                         │
│                                                             │
│ Findings                                                    │
│ ~ 1 privacy concern(s) from third-party scripts             │
│ ! Low performance score 44/100                              │
│ ! LCP: 5.6s                                                 │
│ ℹ DNSSEC not enabled                                        │
│ ✓ SSL grade A+                                              │
│ ✓ HSTS enabled                                              │
│ ✓ Content Security Policy present                           │
╰─────────────────────────────────────────────────────────────╯`} />
        </div>
      </Section>

      {/* More examples with output */}
      <Section title="Examples">
        <div className="space-y-4">
          <div>
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--dim)", marginBottom: 8 }}>Quick score check:</p>
            <CopyBlock code="yoke score stripe.com" />
            <div style={{ marginTop: 6 }}>
              <OutputBlock text="stripe.com  91/100  A" />
            </div>
          </div>

          <div>
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--dim)", marginBottom: 8 }}>JSON output — pipe to jq, use in scripts or CI:</p>
            <CopyBlock code={`yoke stripe.com --json | jq '.domain_score.axes | to_entries[] | "\\(.key): \\(.value.score)"'`} />
            <div style={{ marginTop: 6 }}>
              <OutputBlock text={`"security: 98"
"performance: 69"
"reliability: 97"
"trust: 100"
"visibility: 97"`} />
            </div>
          </div>

          <div>
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--dim)", marginBottom: 8 }}>Compare two domains side-by-side:</p>
            <CopyBlock code="yoke compare github.com gitlab.com" />
          </div>

          <div>
            <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--dim)", marginBottom: 8 }}>AI analysis (requires <a href="https://openrouter.ai/" target="_blank" rel="noopener" style={{ color: "var(--accent)" }}>OpenRouter</a> API key):</p>
            <CopyBlock code={`yoke ai --setup          # one-time: set your API key
yoke ai stripe.com      # expert security/SEO/dev analysis`} />
          </div>
        </div>
      </Section>

      {/* Commands reference */}
      <Section title="Commands">
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {[
            ["yoke <domain>", "Full analysis card"],
            ["yoke <domain> --json", "Raw JSON output"],
            ["yoke score <domain>", 'Quick score (e.g. "92/100 A")'],
            ["yoke score <domain> --json", "Score as JSON"],
            ["yoke compare <d1> <d2>", "Side-by-side comparison"],
            ["yoke ai <domain>", "AI-powered analysis"],
            ["yoke ai --setup", "Configure OpenRouter API key"],
            ["yoke config", "Show current configuration"],
            ["yoke config --set-base-url <url>", "Point to self-hosted instance"],
          ].map(([cmd, desc], i, arr) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none", gap: 16 }}>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", whiteSpace: "nowrap" }}>{cmd}</code>
              <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--dim)", textAlign: "right" }}>{desc}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Configuration */}
      <Section title="Configuration">
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--dim)", lineHeight: "22px", marginBottom: 12 }}>
          Config file at <code style={{ fontSize: 12, color: "var(--text)", background: "var(--surface)", padding: "2px 6px", borderRadius: 4 }}>~/.yoke.toml</code>. Override per-session with env vars:
        </p>
        <CopyBlock code={`export YOKE_BASE_URL=https://your-instance.com
export OPENROUTER_API_KEY=sk-or-...`} />
      </Section>

      {/* Self-hosting */}
      <Section title="Self-Hosting">
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--dim)", lineHeight: "22px", marginBottom: 12 }}>
          Yoke is open source. Deploy your own instance and point the CLI at it:
        </p>
        <CopyBlock code={`git clone https://github.com/kurtpayne/yoke
cd yoke && npm install && npx wrangler deploy

yoke config --set-base-url https://your-yoke.workers.dev`} />
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--dim)", marginTop: 12 }}>
          <a href="https://github.com/kurtpayne/yoke" target="_blank" rel="noopener" style={{ color: "var(--accent)" }}>View on GitHub →</a>
        </p>
      </Section>
    </div>
  );
}
