import { useState } from "react";
import { Accessibility, Check, AlertTriangle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Panel, StatusBadge } from "./Panel";
import type { AnalysisResult, AccessibilityCheck } from "../utils/types";

// ─── Impact badge ────────────────────────────────────────────────────

function ImpactBadge({ impact }: { impact: AccessibilityCheck["impact"] }) {
  const colors: Record<string, string> = {
    critical: "var(--danger)",
    serious: "var(--warning)",
    moderate: "var(--accent)",
    minor: "var(--dim)",
  };
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        fontWeight: 600,
        color: colors[impact] ?? "var(--dim)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        padding: "1px 5px",
        borderRadius: 3,
        border: `1px solid ${colors[impact] ?? "var(--dim)"}`,
        opacity: 0.8,
      }}
    >
      {impact}
    </span>
  );
}

// ─── Status icon ─────────────────────────────────────────────────────

function StatusIcon({ status }: { status: AccessibilityCheck["status"] }) {
  switch (status) {
    case "pass": return <Check size={12} style={{ color: "var(--success)", flexShrink: 0 }} />;
    case "warn": return <AlertTriangle size={12} style={{ color: "var(--warning)", flexShrink: 0 }} />;
    case "fail": return <XCircle size={12} style={{ color: "var(--danger)", flexShrink: 0 }} />;
  }
}

// ─── Score ring ──────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const size = 52;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--danger)";

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, fill: color }}>
        {score}
      </text>
    </svg>
  );
}

// ─── Check row ───────────────────────────────────────────────────────

function CheckRow({ check }: { check: AccessibilityCheck }) {
  const [expanded, setExpanded] = useState(check.status !== "pass");

  return (
    <div style={{ borderBottom: "1px solid var(--border-muted)" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full py-2 px-4"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
          fontSize: "12px",
          color: "var(--text)",
          textAlign: "left",
        }}
      >
        <StatusIcon status={check.status} />
        <span style={{ fontWeight: 500, flex: 1, minWidth: 0 }}>{check.name}</span>
        <ImpactBadge impact={check.impact} />
        {expanded ? <ChevronDown size={11} style={{ color: "var(--dim)", flexShrink: 0 }} /> : <ChevronRight size={11} style={{ color: "var(--dim)", flexShrink: 0 }} />}
      </button>
      {expanded && (
        <div className="px-4 pb-2.5" style={{ paddingLeft: "2.25rem" }}>
          <p style={{
            fontFamily: "var(--font-ui)",
            fontSize: "11px",
            color: "var(--dim)",
            lineHeight: "17px",
            margin: 0,
          }}>
            {check.detail}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────

export function AccessibilityPanel({ data }: { data: AnalysisResult }) {
  const a11y = data.accessibility;

  if (!a11y) {
    return (
      <Panel title="Accessibility" icon={<Accessibility size={14} />}>
        <div className="p-4">
          <StatusBadge status="neutral" label="Not available" />
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)", marginTop: 8 }}>
            Accessibility analysis requires a successful HTTP probe.
          </p>
        </div>
      </Panel>
    );
  }

  // Group checks by impact level (critical first)
  const impactOrder: AccessibilityCheck["impact"][] = ["critical", "serious", "moderate", "minor"];
  const sorted = [...a11y.checks].sort((a, b) => {
    const ai = impactOrder.indexOf(a.impact);
    const bi = impactOrder.indexOf(b.impact);
    if (ai !== bi) return ai - bi;
    // Within same impact, failures first
    const statusOrder = { fail: 0, warn: 1, pass: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  return (
    <Panel
      title="Accessibility"
      icon={<Accessibility size={14} />}
      badge={
        <div className="flex gap-1.5">
          {a11y.summary.failures > 0 && <StatusBadge status="fail" label={`${a11y.summary.failures} fail`} />}
          {a11y.summary.warnings > 0 && <StatusBadge status="warn" label={`${a11y.summary.warnings} warn`} />}
          {a11y.summary.passed > 0 && <StatusBadge status="pass" label={`${a11y.summary.passed} pass`} />}
        </div>
      }
    >
      {/* Score header */}
      <div className="px-4 py-3 flex items-center gap-4" style={{ borderBottom: "1px solid var(--border-muted)" }}>
        <ScoreRing score={a11y.score} />
        <div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
            WCAG Quick Scan
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", lineHeight: "17px", marginTop: 2 }}>
            Static HTML analysis — checks page structure, semantics, and common accessibility patterns.
            Color contrast and focus indicators require browser rendering.
          </div>
        </div>
      </div>

      {/* Check list */}
      {sorted.map((check, i) => (
        <CheckRow key={`${check.name}-${i}`} check={check} />
      ))}

      {/* Regulation note */}
      <div className="px-4 py-2.5" style={{ background: "var(--surface-hover)" }}>
        <p style={{
          fontFamily: "var(--font-ui)",
          fontSize: "10px",
          color: "var(--dim)",
          lineHeight: "15px",
          margin: 0,
        }}>
          ℹ European Accessibility Act (2025) &amp; ADA compliance require ongoing accessibility efforts.
          This scan covers structural checks only — consider full audits with axe, Lighthouse, or WAVE.
        </p>
      </div>
    </Panel>
  );
}
