import { Activity } from "lucide-react";
import { Panel, GradeBadge } from "./Panel";
import type { AnalysisResult } from "../utils/types";

export function HealthScorePanel({ data }: { data: AnalysisResult }) {
  const hs = data.health_score;
  if (!hs) return null;

  const pct = Math.round((hs.score / hs.max_score) * 100);
  const gradeColor = hs.grade === "A" ? "var(--success)" : hs.grade === "B" ? "#7ee787" : hs.grade === "C" ? "var(--warning)" : "var(--danger)";

  const breakdownEntries = Object.entries(hs.breakdown).sort((a, b) => b[1] - a[1]);

  // Max possible per category (for bar visualization)
  const maxPerCategory: Record<string, number> = {
    "SSL Certificate": 20,
    "Security Headers": 15,
    "Email Auth": 11,
    "DNSSEC": 5,
    "HSTS": 5,
    "Blocklists": 5,
    "Performance": 5,
    "Legal Pages": 3,
    "Social Meta": 2,
  };

  return (
    <Panel
      title="Domain Health Score"
      icon={<Activity size={14} />}
      badge={<GradeBadge grade={hs.grade} />}
    >
      <div className="p-4">
        {/* Big score display */}
        <div className="flex items-center gap-4 mb-4">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{
              width: "72px", height: "72px",
              background: `linear-gradient(135deg, ${gradeColor}22, ${gradeColor}11)`,
              border: `2px solid ${gradeColor}44`,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "32px", fontWeight: 800, color: gradeColor, lineHeight: 1 }}>
              {hs.grade}
            </span>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 700, color: "var(--text)" }}>
              {hs.score}<span style={{ fontSize: "14px", color: "var(--dim)" }}>/{hs.max_score}</span>
            </div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)" }}>
              {pct}% overall health
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2.5 rounded-full mb-4" style={{ background: "var(--surface-raised)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: gradeColor }}
          />
        </div>

        {/* Category breakdown */}
        <div className="space-y-2">
          {breakdownEntries.map(([name, value]) => {
            const max = maxPerCategory[name] ?? 5;
            const barPct = (value / max) * 100;
            return (
              <div key={name}>
                <div className="flex items-center justify-between mb-1">
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--text-secondary)" }}>{name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: value === max ? "var(--success)" : value > 0 ? "var(--text)" : "var(--dim)" }}>
                    {value}/{max}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full" style={{ background: "var(--surface-raised)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${barPct}%`,
                      background: value === max ? "var(--success)" : value > max / 2 ? "var(--warning)" : value > 0 ? "var(--danger)" : "var(--border-muted)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
