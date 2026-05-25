import { useState, useRef, useEffect } from "react";
import { Tooltip } from "./Tooltip";
import type { AnalysisResult, Axis, AxisScoreData, ArchetypeName } from "../utils/types";

// ─── Constants ───────────────────────────────────────────────────────

const AXES: Axis[] = ["security", "performance", "reliability", "trust", "visibility"];
const AXIS_LABELS: Record<Axis, string> = {
  security: "Security",
  performance: "Performance",
  reliability: "Reliability",
  trust: "Trust",
  visibility: "Visibility",
};

const ARCHETYPE_ICONS: Record<ArchetypeName, string> = {
  commerce: "🛒",
  content: "📝",
  application: "⚙️",
  corporate: "🏢",
  infrastructure: "🔧",
  institutional: "🏛️",
  general: "🌐",
};

const ARCHETYPE_LABELS: Record<ArchetypeName, string> = {
  commerce: "Commerce",
  content: "Content",
  application: "Application",
  corporate: "Corporate",
  infrastructure: "Infrastructure",
  institutional: "Institutional",
  general: "General",
};

const WEIGHT_SUMMARIES: Record<ArchetypeName, string> = {
  commerce: "Security and Performance matter most for Commerce sites",
  content: "Visibility and Performance are key for Content sites",
  application: "Security and Performance are critical for Applications",
  corporate: "Trust and Visibility define Corporate presence",
  infrastructure: "Reliability and Security are vital for Infrastructure",
  institutional: "Security and Reliability are paramount for Institutional sites",
  general: "All axes weighted equally for General sites",
};

// ─── Radar Plot SVG ──────────────────────────────────────────────────

const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 75;
const ANGLE_OFFSET = -Math.PI / 2; // start from top

function polarToCartesian(angle: number, r: number): [number, number] {
  return [
    CENTER + r * Math.cos(angle + ANGLE_OFFSET),
    CENTER + r * Math.sin(angle + ANGLE_OFFSET),
  ];
}

function polygonPoints(values: number[], maxVal = 100): string {
  return values
    .map((v, i) => {
      const angle = (2 * Math.PI * i) / values.length;
      const r = (v / maxVal) * RADIUS;
      const [x, y] = polarToCartesian(angle, r);
      return `${x},${y}`;
    })
    .join(" ");
}

function gridPolygon(level: number): string {
  const r = (level / 100) * RADIUS;
  return AXES.map((_, i) => {
    const angle = (2 * Math.PI * i) / AXES.length;
    const [x, y] = polarToCartesian(angle, r);
    return `${x},${y}`;
  }).join(" ");
}

interface RadarPlotProps {
  axes: Record<Axis, AxisScoreData>;
  archetype: ArchetypeName;
}

export function RadarPlot({ axes, archetype }: RadarPlotProps) {
  const [animProgress, setAnimProgress] = useState(0);
  const [hoveredAxis, setHoveredAxis] = useState<Axis | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 600;
    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimProgress(eased);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const values = AXES.map(a => axes[a].score * animProgress);
  const dataPoints = polygonPoints(values);

  return (
    <div className="relative" style={{ width: "100%", maxWidth: SIZE, aspectRatio: "1/1" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ overflow: "visible" }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {[25, 50, 75, 100].map(level => (
          <polygon
            key={level}
            points={gridPolygon(level)}
            fill="none"
            stroke="var(--border)"
            strokeWidth={level === 100 ? 1 : 0.5}
            opacity={level === 100 ? 0.6 : 0.3}
          />
        ))}

        {/* Spoke lines */}
        {AXES.map((_, i) => {
          const angle = (2 * Math.PI * i) / AXES.length;
          const [x, y] = polarToCartesian(angle, RADIUS);
          return (
            <line
              key={i}
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              stroke="var(--border)"
              strokeWidth={0.5}
              opacity={0.4}
            />
          );
        })}

        {/* Data polygon fill */}
        <polygon
          points={dataPoints}
          fill="var(--accent)"
          fillOpacity={0.15}
          stroke="var(--accent)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* Data points */}
        {AXES.map((axis, i) => {
          const angle = (2 * Math.PI * i) / AXES.length;
          const r = (values[i] / 100) * RADIUS;
          const [x, y] = polarToCartesian(angle, r);
          return (
            <circle
              key={axis}
              cx={x}
              cy={y}
              r={hoveredAxis === axis ? 4 : 3}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={1.5}
              style={{ transition: "r 0.15s" }}
            />
          );
        })}

        {/* Axis labels */}
        {AXES.map((axis, i) => {
          const angle = (2 * Math.PI * i) / AXES.length;
          const labelR = RADIUS + 18;
          const [x, y] = polarToCartesian(angle, labelR);
          const score = axes[axis].score;
          const weight = Math.round(axes[axis].weight * 100);
          const isHovered = hoveredAxis === axis;

          return (
            <g key={axis}>
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: "10px",
                  fontWeight: isHovered ? 600 : 500,
                  fill: isHovered ? "var(--accent)" : "var(--dim)",
                  cursor: "default",
                  transition: "fill 0.15s",
                }}
                onMouseEnter={() => setHoveredAxis(axis)}
                onMouseLeave={() => setHoveredAxis(null)}
              >
                {AXIS_LABELS[axis]}
              </text>
              {/* Score under label */}
              <text
                x={x}
                y={y + 12}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  fontWeight: 600,
                  fill: score >= 80 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--danger)",
                  opacity: isHovered ? 1 : 0.7,
                }}
                onMouseEnter={() => setHoveredAxis(axis)}
                onMouseLeave={() => setHoveredAxis(null)}
              >
                {score}
              </text>
            </g>
          );
        })}

        {/* Invisible hover zones for each spoke */}
        {AXES.map((axis, i) => {
          const angle = (2 * Math.PI * i) / AXES.length;
          const [x, y] = polarToCartesian(angle, RADIUS * 0.6);
          return (
            <circle
              key={`zone-${axis}`}
              cx={x}
              cy={y}
              r={22}
              fill="transparent"
              onMouseEnter={() => setHoveredAxis(axis)}
              onMouseLeave={() => setHoveredAxis(null)}
              style={{ cursor: "default" }}
            />
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hoveredAxis && (
        <div
          className="absolute z-10 p-2 rounded-md"
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            fontSize: "11px",
            fontFamily: "var(--font-ui)",
            left: "50%",
            bottom: -8,
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--text)" }}>
            {AXIS_LABELS[hoveredAxis]}: {axes[hoveredAxis].score}/100
          </span>
          <span style={{ color: "var(--dim)", marginLeft: 6 }}>
            ({Math.round(axes[hoveredAxis].weight * 100)}% weight for {ARCHETYPE_LABELS[archetype]})
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Composite Score Display ─────────────────────────────────────────

function gradeColor(grade: string): string {
  if (grade === "A") return "var(--success)";
  if (grade === "B") return "#7ee787";
  if (grade === "C") return "var(--warning)";
  if (grade === "D") return "#ffa198";
  return "var(--danger)";
}

function scoreColor(score: number): string {
  if (score >= 90) return "var(--success)";
  if (score >= 80) return "#7ee787";
  if (score >= 70) return "var(--warning)";
  if (score >= 60) return "#ffa198";
  return "var(--danger)";
}

// ─── Main DomainScore Component ──────────────────────────────────────

export function DomainScore({ data }: { data: AnalysisResult }) {
  const ds = data.domain_score;
  if (!ds) return null;

  const [autoDetect, setAutoDetect] = useState(true);
  const [selectedArchetype, setSelectedArchetype] = useState<ArchetypeName>(ds.archetype.detected);

  // When auto-detect changes, reset to detected
  const activeArchetype = autoDetect ? ds.archetype.detected : selectedArchetype;

  return (
    <div className="panel">
      <div className="panel-header flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="opacity-60">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </span>
          <span>Domain Score</span>
        </div>
        {/* Archetype chip */}
        <div className="flex items-center gap-2">
          <Tooltip text={ds.archetype.signals.join(", ")}>
            <span
              className="badge badge-info"
              style={{
                fontSize: "10px",
                cursor: "help",
                borderStyle: autoDetect ? "solid" : "dashed",
                opacity: autoDetect ? 1 : 0.8,
              }}
            >
              {ARCHETYPE_ICONS[activeArchetype]} {ARCHETYPE_LABELS[activeArchetype]}
              {!autoDetect && <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: 4 }}>(manual)</span>}
            </span>
          </Tooltip>
        </div>
      </div>

      <div className="p-4">
        <div className="flex flex-col lg:flex-row items-center gap-6">
          {/* Radar Plot */}
          <div className="flex-shrink-0 w-full max-w-[200px]">
            <RadarPlot axes={ds.axes} archetype={activeArchetype} />
          </div>

          {/* Score + Details */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Big score */}
            <div className="flex items-center gap-4">
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "42px",
                    fontWeight: 700,
                    lineHeight: "1",
                    color: scoreColor(ds.composite),
                  }}
                >
                  {ds.composite}
                </div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", marginTop: 2 }}>
                  out of 100
                </div>
              </div>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "var(--radius)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: "24px",
                  fontWeight: 700,
                  color: gradeColor(ds.grade),
                  background: `color-mix(in srgb, ${gradeColor(ds.grade)} 10%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${gradeColor(ds.grade)} 20%, transparent)`,
                }}
              >
                {ds.grade}
              </div>
            </div>

            {/* Weight summary */}
            <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)", lineHeight: "18px" }}>
              {WEIGHT_SUMMARIES[activeArchetype]}
            </p>

            {/* Axis breakdown bars */}
            <div className="space-y-1.5">
              {AXES.map(axis => {
                const a = ds.axes[axis];
                return (
                  <div key={axis} className="flex items-center gap-2" style={{ fontSize: "11px" }}>
                    <span style={{ fontFamily: "var(--font-ui)", color: "var(--dim)", width: 80, flexShrink: 0, fontWeight: 500 }}>
                      {AXIS_LABELS[axis]}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--border)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${a.score}%`,
                          background: a.score >= 80 ? "var(--success)" : a.score >= 60 ? "var(--warning)" : "var(--danger)",
                          transition: "width 0.6s ease-out",
                        }}
                      />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)", minWidth: 24, textAlign: "right" }}>
                      {a.score}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Secondary archetype note */}
            {ds.archetype.secondary && autoDetect && (
              <p style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>
                Also shows {ARCHETYPE_LABELS[ds.archetype.secondary]} traits
              </p>
            )}

            {/* Archetype override controls */}
            <div className="flex items-center gap-3" style={{ fontSize: "11px", fontFamily: "var(--font-ui)" }}>
              <label className="flex items-center gap-1.5" style={{ color: "var(--dim)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={autoDetect}
                  onChange={(e) => {
                    setAutoDetect(e.target.checked);
                    if (e.target.checked) setSelectedArchetype(ds.archetype.detected);
                  }}
                  style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                />
                Auto-detect
              </label>
              <select
                value={selectedArchetype}
                onChange={(e) => setSelectedArchetype(e.target.value as ArchetypeName)}
                disabled={autoDetect}
                style={{
                  background: "var(--surface-raised)",
                  color: autoDetect ? "var(--dim)" : "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "2px 6px",
                  fontSize: "11px",
                  fontFamily: "var(--font-ui)",
                  cursor: autoDetect ? "not-allowed" : "pointer",
                  opacity: autoDetect ? 0.5 : 1,
                }}
              >
                {(["commerce", "content", "application", "corporate", "infrastructure", "institutional", "general"] as ArchetypeName[]).map(a => (
                  <option key={a} value={a}>{ARCHETYPE_ICONS[a]} {ARCHETYPE_LABELS[a]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Top findings */}
        <TopFindings axes={ds.axes} />
      </div>
    </div>
  );
}

// ─── Top Findings Summary ────────────────────────────────────────────

function severityColor(severity: string): string {
  switch (severity) {
    case "critical": return "var(--danger)";
    case "high": return "#ffa198";
    case "medium": return "var(--warning)";
    case "low": return "var(--dim)";
    case "info": return "var(--accent)";
    case "good": return "var(--success)";
    default: return "var(--dim)";
  }
}

function severityIcon(severity: string): string {
  switch (severity) {
    case "critical": return "🔴";
    case "high": return "🟠";
    case "medium": return "🟡";
    case "low": return "🔵";
    case "info": return "ℹ️";
    case "good": return "✅";
    default: return "·";
  }
}

function TopFindings({ axes }: { axes: Record<Axis, AxisScoreData> }) {
  // Collect non-good findings across all axes, sorted by severity
  const severityOrder = ["critical", "high", "medium", "low", "info", "good"];
  const allFindings = AXES.flatMap(a => axes[a].findings)
    .filter(f => f.severity !== "good" && f.severity !== "info")
    .sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))
    .slice(0, 6);

  if (allFindings.length === 0) return null;

  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div style={{ fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        Key Findings
      </div>
      <div className="space-y-1">
        {allFindings.map((f, i) => (
          <div key={`${f.signal}-${i}`} className="flex items-start gap-2" style={{ fontSize: "11px", lineHeight: "16px" }}>
            <span style={{ fontSize: "10px", flexShrink: 0, marginTop: 1 }}>{severityIcon(f.severity)}</span>
            <span style={{ fontFamily: "var(--font-ui)", color: severityColor(f.severity) }}>
              {f.label}
              {f.tradeoff && (
                <span style={{ color: "var(--dim)", fontSize: "10px", marginLeft: 4 }}>
                  — {f.tradeoff}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab Axis Score Badge ────────────────────────────────────────────
// Shows the relevant axis score at the top of each tab

export function AxisScoreBadge({ data, axis }: { data: AnalysisResult; axis: Axis }) {
  const ds = data.domain_score;
  if (!ds) return null;

  const axisData = ds.axes[axis];
  const score = axisData.score;
  const color = score >= 80 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="flex items-center gap-2 px-1 mb-2">
      <div className="vital-pill" style={{ padding: "4px 10px" }}>
        <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {AXIS_LABELS[axis]}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color }}>
          {score}
        </span>
        <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>/100</span>
      </div>
    </div>
  );
}
