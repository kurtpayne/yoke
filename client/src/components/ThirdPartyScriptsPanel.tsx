import { useState } from "react";
import { FileCode, ChevronDown, ChevronRight, AlertTriangle, Shield, Zap } from "lucide-react";
import { Panel, StatusBadge } from "./Panel";
import type { AnalysisResult, ScriptCategoryData } from "../utils/types";

// ─── Category icons/colors ──────────────────────────────────────────

const CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  "Analytics": { emoji: "📊", color: "var(--accent)" },
  "Advertising": { emoji: "📢", color: "var(--danger)" },
  "Social": { emoji: "👥", color: "var(--info)" },
  "Chat / Support": { emoji: "💬", color: "var(--success)" },
  "Heatmaps / Session Recording": { emoji: "🔥", color: "var(--warning)" },
  "CDN / Libraries": { emoji: "📦", color: "var(--dim)" },
  "Performance / Monitoring": { emoji: "📈", color: "var(--accent)" },
  "Consent / Privacy": { emoji: "🔒", color: "var(--success)" },
  "Payment": { emoji: "💳", color: "var(--success)" },
  "First Party": { emoji: "🏠", color: "var(--text)" },
  "Other": { emoji: "❓", color: "var(--dim)" },
};

// ─── Category section ───────────────────────────────────────────────

function CategorySection({ name, data }: { name: string; data: ScriptCategoryData }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[name] ?? { emoji: "📄", color: "var(--dim)" };

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
        }}
      >
        <span style={{ fontSize: "13px", flexShrink: 0 }}>{meta.emoji}</span>
        <span style={{ fontWeight: 500, flex: 1, textAlign: "left" }}>{name}</span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 600,
          color: meta.color,
          minWidth: 20,
          textAlign: "right",
        }}>
          {data.count}
        </span>
        {expanded ? <ChevronDown size={11} style={{ color: "var(--dim)", flexShrink: 0 }} /> : <ChevronRight size={11} style={{ color: "var(--dim)", flexShrink: 0 }} />}
      </button>
      {expanded && (
        <div className="px-4 pb-2" style={{ paddingLeft: "2.25rem" }}>
          {data.scripts.map((script, i) => (
            <div key={`${script.url}-${i}`} className="flex items-center gap-2 py-1" style={{ fontSize: "11px" }}>
              <span style={{
                fontFamily: "var(--font-mono)",
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
              }}>
                {script.domain}
              </span>
              <div className="flex gap-1" style={{ flexShrink: 0 }}>
                {script.async && (
                  <span className="badge badge-pass" style={{ fontSize: "9px", padding: "0 4px" }}>async</span>
                )}
                {script.defer && (
                  <span className="badge badge-pass" style={{ fontSize: "9px", padding: "0 4px" }}>defer</span>
                )}
                {!script.async && !script.defer && name !== "First Party" && (
                  <span className="badge badge-warn" style={{ fontSize: "9px", padding: "0 4px" }}>blocking</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────

export function ThirdPartyScriptsPanel({ data }: { data: AnalysisResult }) {
  const tps = data.third_party_scripts;

  if (!tps) {
    return (
      <Panel title="Third-Party Scripts" icon={<FileCode size={14} />}>
        <div className="p-4">
          <StatusBadge status="neutral" label="Not available" />
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)", marginTop: 8 }}>
            Script analysis requires a successful HTTP probe.
          </p>
        </div>
      </Panel>
    );
  }

  // Sort categories: privacy-sensitive first, then by count
  const privacySensitive = new Set(["Advertising", "Heatmaps / Session Recording", "Analytics", "Social"]);
  const categoryEntries = Object.entries(tps.categories).sort((a, b) => {
    const aPriv = privacySensitive.has(a[0]) ? 0 : 1;
    const bPriv = privacySensitive.has(b[0]) ? 0 : 1;
    if (aPriv !== bPriv) return aPriv - bPriv;
    return b[1].count - a[1].count;
  });

  return (
    <Panel
      title="Third-Party Scripts"
      icon={<FileCode size={14} />}
      badge={
        <div className="flex gap-1.5">
          <StatusBadge
            status={tps.third_party > 10 ? "warn" : tps.third_party > 0 ? "info" : "pass"}
            label={`${tps.third_party} third-party`}
          />
          {tps.render_blocking > 0 && (
            <StatusBadge status="warn" label={`${tps.render_blocking} blocking`} />
          )}
        </div>
      }
    >
      {/* Summary bar */}
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ borderBottom: "1px solid var(--border-muted)" }}>
        <div className="flex items-center gap-1.5">
          <FileCode size={12} style={{ color: "var(--dim)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>
            {tps.total}
          </span>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)" }}>total scripts</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text)" }}>
            {tps.first_party}
          </span>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>first-party</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: tps.third_party > 10 ? "var(--warning)" : "var(--text)" }}>
            {tps.third_party}
          </span>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>third-party</span>
        </div>
        {tps.render_blocking > 0 && (
          <div className="flex items-center gap-1.5">
            <Zap size={11} style={{ color: "var(--warning)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--warning)" }}>
              {tps.render_blocking}
            </span>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>render-blocking</span>
          </div>
        )}
      </div>

      {/* Privacy concerns */}
      {tps.privacy_concerns.length > 0 && (
        <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border-muted)", background: "rgba(248, 81, 73, 0.04)" }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Shield size={11} style={{ color: "var(--danger)" }} />
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", fontWeight: 600, color: "var(--danger)" }}>
              Privacy Concerns
            </span>
          </div>
          {tps.privacy_concerns.map((concern, i) => (
            <div key={i} className="flex items-start gap-1.5 py-0.5">
              <AlertTriangle size={10} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", lineHeight: "16px" }}>
                {concern}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Categories */}
      {categoryEntries.map(([name, catData]) => (
        <CategorySection key={name} name={name} data={catData} />
      ))}

      {/* Empty state */}
      {tps.total === 0 && (
        <div className="p-4">
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)" }}>
            No scripts detected on this page.
          </p>
        </div>
      )}
    </Panel>
  );
}
