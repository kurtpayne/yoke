import { Shield, ShieldCheck, ShieldAlert, Check, X, AlertTriangle, Eye, ExternalLink } from "lucide-react";
import { Panel, DataRow, StatusBadge } from "./Panel";
import { Tooltip } from "./Tooltip";
import { findReferenceLink } from "./DomainSignals";
import type { AnalysisResult } from "../utils/types";

// ─── Category labels & icons ────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  security: "Security",
  identity: "Identity & Authentication",
  transparency: "Transparency",
  operational: "Operational Transparency",
};

const CATEGORY_ORDER = ["security", "identity", "transparency", "operational"] as const;

// ─── WAF Section ────────────────────────────────────────────────────

function WafSection({ data }: { data: AnalysisResult }) {
  const waf = data.waf;
  if (!waf) return null;

  return (
    <div style={{ borderBottom: "1px solid var(--border-muted)" }}>
      <DataRow
        label={
          <span className="flex items-center gap-1.5">
            {waf.detected ? <ShieldCheck size={12} style={{ color: "var(--success)" }} /> : <ShieldAlert size={12} style={{ color: "var(--muted)" }} />}
            Web Application Firewall
          </span>
        }
        value={
          waf.detected ? (
            <div className="flex items-center gap-1.5">
              <StatusBadge status="pass" label={waf.provider ?? "Detected"} />
              <Tooltip text={`Confidence: ${waf.confidence}. Evidence: ${waf.signals.join(", ")}`}>
                <span className={`badge badge-${waf.confidence === "high" ? "pass" : waf.confidence === "medium" ? "info" : "warn"}`} style={{ fontSize: "9px", cursor: "help" }}>
                  {waf.confidence}
                </span>
              </Tooltip>
            </div>
          ) : (
            <StatusBadge status="neutral" label="Not detected" />
          )
        }
        copyValue={waf.detected ? (waf.provider ?? "Detected") : undefined}
      />
    </div>
  );
}

// ─── Trust Signals Section ──────────────────────────────────────────

function TrustSignalRow({ signal }: { signal: { name: string; present: boolean; value: string | null; severity: string; importance?: string } }) {
  const statusMap: Record<string, "pass" | "warn" | "fail" | "info" | "neutral"> = {
    good: "pass", info: "info", low: "warn", medium: "fail",
  };
  const status = signal.present ? (statusMap[signal.severity] ?? "pass") : "neutral";
  const isExtra = signal.importance === "extra";
  const ref = findReferenceLink(signal.name);

  return (
    <DataRow
      label={
        <span className="flex items-center gap-1.5" style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--text)" }}>
          {signal.present
            ? <Check size={10} style={{ color: "var(--success)", flexShrink: 0 }} />
            : isExtra
              ? <span style={{ width: 10, textAlign: "center", color: "var(--dim)", fontSize: "10px", flexShrink: 0, lineHeight: "10px" }}>–</span>
              : <X size={10} style={{ color: "var(--muted)", flexShrink: 0 }} />
          }
          <span style={{ opacity: (!signal.present && isExtra) ? 0.5 : 1 }}>{signal.name}</span>
          {ref && (
            <Tooltip text={ref.label}>
              <a href={ref.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <ExternalLink size={9} style={{ color: "var(--muted)", opacity: 0.7 }} />
              </a>
            </Tooltip>
          )}
        </span>
      }
      value={
        signal.value && signal.present ? (
          <Tooltip text={signal.value}>
            <span className={`badge badge-${status}`} style={{ fontSize: "9px", cursor: "help", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {signal.value.length > 40 ? signal.value.slice(0, 37) + "…" : signal.value}
            </span>
          </Tooltip>
        ) : null
      }
      copyValue={signal.value && signal.present ? signal.value : undefined}
    />
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────

export function ProtectionTrustPanel({ data }: { data: AnalysisResult }) {
  const trust = data.trust_signals;
  const waf = data.waf;

  // Don't render if we have no data at all
  if (!trust && !waf) return null;

  const signals = trust?.signals ?? [];
  const factors = trust?.trust_score_factors;

  // Group signals by category
  const grouped = new Map<string, typeof signals>();
  for (const s of signals) {
    const cat = s.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(s);
  }

  // Summary counts — header badge reflects core signals only
  const coreSignals = signals.filter(s => s.importance !== "extra");
  const corePresent = coreSignals.filter(s => s.present).length;
  const coreTotal = coreSignals.length;
  const extraPresent = signals.filter(s => s.importance === "extra" && s.present).length;

  return (
    <Panel
      title="Protection & Trust"
      icon={<Shield size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          {waf?.detected && (
            <Tooltip text={`WAF: ${waf.provider} (${waf.confidence} confidence)`}>
              <span className="badge badge-pass" style={{ fontSize: "9px", cursor: "help" }}>
                WAF ✓
              </span>
            </Tooltip>
          )}
          <StatusBadge
            status={corePresent >= coreTotal && coreTotal > 0 ? "pass" : corePresent >= Math.ceil(coreTotal / 2) ? "info" : "neutral"}
            label={`${corePresent}/${coreTotal} core${extraPresent > 0 ? ` · +${extraPresent}` : ""}`}
          />
        </div>
      }
    >
      {/* WAF */}
      <WafSection data={data} />

      {/* Trust signals grouped by category */}
      {CATEGORY_ORDER.map(cat => {
        const catSignals = grouped.get(cat);
        if (!catSignals || catSignals.length === 0) return null;
        const coreSignals = catSignals.filter(s => s.importance !== "extra");
        const extraSignals = catSignals.filter(s => s.importance === "extra");
        const corePresent = coreSignals.filter(s => s.present).length;
        const extraPresent = extraSignals.filter(s => s.present).length;
        return (
          <div key={cat}>
            <div className="sub-section flex items-center justify-between">
              <span>{CATEGORY_LABELS[cat] ?? cat}</span>
              <span style={{ fontSize: "9px", color: "var(--dim)" }}>
                {coreSignals.length > 0 ? `${corePresent}/${coreSignals.length}` : ""}
                {coreSignals.length > 0 && extraPresent > 0 ? " · " : ""}
                {extraPresent > 0 ? `+${extraPresent} extra` : ""}
              </span>
            </div>
            {coreSignals.length > 0 && extraSignals.length > 0 && (
              <div style={{ padding: "2px 16px 0", fontFamily: "var(--font-ui)", fontSize: "9px", color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Core
              </div>
            )}
            {coreSignals.map(s => (
              <TrustSignalRow key={s.name} signal={s} />
            ))}
            {extraSignals.length > 0 && coreSignals.length > 0 && (
              <div style={{ padding: "2px 16px 0", fontFamily: "var(--font-ui)", fontSize: "9px", color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Extra
              </div>
            )}
            {extraSignals.map(s => (
              <TrustSignalRow key={s.name} signal={s} />
            ))}
          </div>
        );
      })}

      {/* Trust factor summary */}
      {factors && factors.positive.length > 0 && (
        <div className="px-4 py-2" style={{ borderTop: "1px solid var(--border-muted)" }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--success)", lineHeight: "16px", fontWeight: 600, marginBottom: "2px" }}>
            Strengths
          </div>
          {factors.positive.slice(0, 6).map((f, i) => (
            <div key={i} className="flex items-start gap-1.5" style={{ marginBottom: "2px" }}>
              <Check size={9} style={{ color: "var(--success)", marginTop: "3px", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--text-secondary)", lineHeight: "14px" }}>
                {f}
              </span>
            </div>
          ))}
        </div>
      )}

      {factors && factors.negative.length > 0 && (
        <div className="px-4 py-2" style={{ borderTop: "1px solid var(--border-muted)" }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--warning)", lineHeight: "16px", fontWeight: 600, marginBottom: "2px" }}>
            Gaps
          </div>
          {factors.negative.slice(0, 6).map((f, i) => (
            <div key={i} className="flex items-start gap-1.5" style={{ marginBottom: "2px" }}>
              <AlertTriangle size={9} style={{ color: "var(--warning)", marginTop: "3px", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--text-secondary)", lineHeight: "14px" }}>
                {f}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
