import { useState, useRef, useEffect, useCallback } from "react";
import { analyzeStream, type StreamEvent } from "../api";
import { Search, Loader2, ArrowLeftRight, X, CheckCircle2, Circle } from "lucide-react";
import type { CompareResult, AnalysisResult, Axis, AxisScoreData, DomainScoreData, ArchetypeName } from "../utils/types";

// ─── Constants ───────────────────────────────────────────────────────

const AXES: Axis[] = ["security", "performance", "reliability", "trust", "visibility"];
const AXIS_LABELS: Record<Axis, string> = {
  security: "Security",
  performance: "Performance",
  reliability: "Reliability",
  trust: "Trust",
  visibility: "Visibility",
};

const ARCHETYPE_ICONS: Record<string, string> = {
  commerce: "🛒", content: "📝", application: "⚙️", corporate: "🏢",
  infrastructure: "🔧", institutional: "🏛️", general: "🌐",
};

const ARCHETYPE_LABELS: Record<string, string> = {
  commerce: "Commerce", content: "Content", application: "Application",
  corporate: "Corporate", infrastructure: "Infrastructure",
  institutional: "Institutional", general: "General",
};

// ─── Streaming Compare Hook ──────────────────────────────────────────

interface DomainProgress {
  completed: number;
  total: number;
  label: string;
  checks: Map<string, { label: string; done: boolean }>;
  done: boolean;
}

function emptyProgress(): DomainProgress {
  return { completed: 0, total: 0, label: "Waiting…", checks: new Map(), done: false };
}

function buildCompareResult(d1: AnalysisResult, d2: AnalysisResult): CompareResult {
  const score1 = d1.domain_score as DomainScoreData | undefined;
  const score2 = d2.domain_score as DomainScoreData | undefined;

  const axes: CompareResult["comparison"]["axes"] = AXES.map(axis => {
    const s1 = score1?.axes?.[axis]?.score ?? 0;
    const s2 = score2?.axes?.[axis]?.score ?? 0;
    return { axis, score1: s1, score2: s2, delta: s1 - s2, absDelta: Math.abs(s1 - s2) };
  });

  return {
    domain1: d1,
    domain2: d2,
    comparison: {
      composite: {
        score1: score1?.composite ?? null,
        score2: score2?.composite ?? null,
        grade1: score1?.grade ?? null,
        grade2: score2?.grade ?? null,
        delta: (score1?.composite ?? 0) - (score2?.composite ?? 0),
      },
      archetype1: (score1?.archetype?.detected as ArchetypeName) ?? null,
      archetype2: (score2?.archetype?.detected as ArchetypeName) ?? null,
      axes,
      biggest_differences: [...axes].sort((a, b) => b.absDelta - a.absDelta).slice(0, 3),
    },
  };
}

function useStreamingCompare() {
  const [data, setData] = useState<CompareResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress1, setProgress1] = useState<DomainProgress>(emptyProgress());
  const [progress2, setProgress2] = useState<DomainProgress>(emptyProgress());
  const [dom1, setDom1] = useState("");
  const [dom2, setDom2] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const mutate = useCallback(({ domain1, domain2 }: { domain1: string; domain2: string }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const d1 = domain1.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    const d2 = domain2.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    setDom1(d1);
    setDom2(d2);
    setIsPending(true);
    setError(null);
    setData(null);
    setProgress1({ ...emptyProgress(), label: "Connecting…" });
    setProgress2({ ...emptyProgress(), label: "Connecting…" });

    let result1: AnalysisResult | null = null;
    let result2: AnalysisResult | null = null;

    const checkBothDone = () => {
      if (result1 && result2) {
        setData(buildCompareResult(result1, result2));
        setIsPending(false);
      }
    };

    const makeHandler = (setProgress: typeof setProgress1, setResult: (r: AnalysisResult) => void) =>
      (evt: StreamEvent) => {
        if (controller.signal.aborted) return;
        switch (evt.type) {
          case "phase": {
            const d = evt.data as { phase: string; label: string; total?: number };
            setProgress(prev => ({ ...prev, label: d.label, total: d.total ?? prev.total }));
            break;
          }
          case "result": {
            const d = evt.data as { key: string; label?: string; completed?: number; total?: number };
            setProgress(prev => {
              const checks = new Map(prev.checks);
              if (d.label && d.key) checks.set(d.key, { label: d.label, done: true });
              const completed = d.completed ?? prev.completed;
              const total = d.total ?? prev.total;
              return { ...prev, completed, total, checks, label: `${completed} of ${total} checks` };
            });
            break;
          }
          case "done": {
            const result = evt.data as AnalysisResult;
            setResult(result);
            setProgress(prev => ({ ...prev, done: true, label: "Done" }));
            break;
          }
          case "error": {
            const d = evt.data as { message: string };
            setError(new Error(d.message));
            setIsPending(false);
            break;
          }
        }
      };

    const handler1 = makeHandler(setProgress1, (r) => { result1 = r; checkBothDone(); });
    const handler2 = makeHandler(setProgress2, (r) => { result2 = r; checkBothDone(); });

    Promise.all([
      analyzeStream(d1, handler1, controller.signal),
      analyzeStream(d2, handler2, controller.signal),
    ]).catch((err) => {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsPending(false);
    });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setData(null);
    setIsPending(false);
    setError(null);
    setProgress1(emptyProgress());
    setProgress2(emptyProgress());
  }, []);

  return { data, isPending, error, progress1, progress2, dom1, dom2, mutate, reset };
}

// ─── Compare Progress UI ─────────────────────────────────────────────

function CompareProgress({ domain, progress }: { domain: string; progress: DomainProgress }) {
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const sortedChecks = Array.from(progress.checks.entries());

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {progress.done
            ? <CheckCircle2 size={13} style={{ color: "var(--success)", flexShrink: 0 }} />
            : <Loader2 size={13} className="animate-spin" style={{ color: "var(--accent)", flexShrink: 0 }} />}
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600,
            color: progress.done ? "var(--success)" : "var(--text)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {domain}
          </span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--dim)", flexShrink: 0 }}>
          {progress.done ? "✓" : progress.total > 0 ? `${progress.completed}/${progress.total}` : "…"}
        </span>
      </div>
      <div className="w-full h-1 rounded-full" style={{ background: "var(--border)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: progress.done ? "100%" : `${pct}%`,
            background: progress.done ? "var(--success)" : "var(--accent)",
            transition: "width 0.3s ease, background 0.3s ease",
          }}
        />
      </div>
      {sortedChecks.length > 0 && (
        <div className="mt-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "2px 8px" }}>
          {sortedChecks.map(([key, { label, done }]) => (
            <div key={key} className="flex items-center gap-1" style={{ opacity: done ? 1 : 0.4 }}>
              {done
                ? <CheckCircle2 size={9} style={{ color: "var(--success)", flexShrink: 0 }} />
                : <Circle size={9} style={{ color: "var(--dim)", flexShrink: 0 }} />}
              <span style={{
                fontFamily: "var(--font-ui)", fontSize: "9px",
                color: done ? "var(--text)" : "var(--dim)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Comparison Radar Plot ───────────────────────────────────────────

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 90;
const ANGLE_OFFSET = -Math.PI / 2;

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

interface CompareRadarProps {
  axes1: Record<Axis, AxisScoreData>;
  axes2: Record<Axis, AxisScoreData>;
  domain1: string;
  domain2: string;
}

function CompareRadar({ axes1, axes2, domain1, domain2 }: CompareRadarProps) {
  const [animProgress, setAnimProgress] = useState(0);
  const [hoveredAxis, setHoveredAxis] = useState<Axis | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 700;
    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimProgress(eased);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [axes1, axes2]);

  const vals1 = AXES.map(a => (axes1[a].score ?? 0) * animProgress);
  const vals2 = AXES.map(a => (axes2[a].score ?? 0) * animProgress);

  return (
    <div className="compare-radar-container">
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mb-2" style={{ fontSize: "11px", fontFamily: "var(--font-ui)" }}>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 12, height: 3, background: "var(--accent)", display: "inline-block", borderRadius: 2 }} />
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{domain1}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 12, height: 3, background: "#f97316", display: "inline-block", borderRadius: 2 }} />
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{domain2}</span>
        </span>
      </div>

      <div className="relative mx-auto" style={{ width: "100%", maxWidth: SIZE, aspectRatio: "1/1" }}>
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
              <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y}
                stroke="var(--border)" strokeWidth={0.5} opacity={0.4} />
            );
          })}

          {/* Domain 1 — solid fill */}
          <polygon
            points={polygonPoints(vals1)}
            fill="var(--accent)"
            fillOpacity={0.12}
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* Domain 2 — dashed outline with lighter fill */}
          <polygon
            points={polygonPoints(vals2)}
            fill="#f97316"
            fillOpacity={0.08}
            stroke="#f97316"
            strokeWidth={2}
            strokeDasharray="6 3"
            strokeLinejoin="round"
          />

          {/* Data points — domain 1 */}
          {AXES.map((axis, i) => {
            const angle = (2 * Math.PI * i) / AXES.length;
            const r = (vals1[i] / 100) * RADIUS;
            const [x, y] = polarToCartesian(angle, r);
            return (
              <circle key={`d1-${axis}`} cx={x} cy={y}
                r={hoveredAxis === axis ? 4 : 3}
                fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5}
                style={{ transition: "r 0.15s" }} />
            );
          })}

          {/* Data points — domain 2 */}
          {AXES.map((axis, i) => {
            const angle = (2 * Math.PI * i) / AXES.length;
            const r = (vals2[i] / 100) * RADIUS;
            const [x, y] = polarToCartesian(angle, r);
            return (
              <circle key={`d2-${axis}`} cx={x} cy={y}
                r={hoveredAxis === axis ? 4 : 3}
                fill="#f97316" stroke="var(--surface)" strokeWidth={1.5}
                style={{ transition: "r 0.15s" }} />
            );
          })}

          {/* Axis labels */}
          {AXES.map((axis, i) => {
            const angle = (2 * Math.PI * i) / AXES.length;
            const labelR = RADIUS + 22;
            const [x, y] = polarToCartesian(angle, labelR);
            const isHovered = hoveredAxis === axis;
            return (
              <text key={axis} x={x} y={y}
                textAnchor="middle" dominantBaseline="central"
                style={{
                  fontFamily: "var(--font-ui)", fontSize: "10px",
                  fontWeight: isHovered ? 600 : 500,
                  fill: isHovered ? "var(--text)" : "var(--dim)",
                  cursor: "default", transition: "fill 0.15s",
                }}
                onMouseEnter={() => setHoveredAxis(axis)}
                onMouseLeave={() => setHoveredAxis(null)}
              >
                {AXIS_LABELS[axis]}
              </text>
            );
          })}

          {/* Hover zones */}
          {AXES.map((axis, i) => {
            const angle = (2 * Math.PI * i) / AXES.length;
            const [x, y] = polarToCartesian(angle, RADIUS * 0.6);
            return (
              <circle key={`zone-${axis}`} cx={x} cy={y} r={26}
                fill="transparent" style={{ cursor: "default" }}
                onMouseEnter={() => setHoveredAxis(axis)}
                onMouseLeave={() => setHoveredAxis(null)} />
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hoveredAxis && (
          <div className="absolute z-10 p-2 rounded-md"
            style={{
              background: "var(--surface-raised)", border: "1px solid var(--border)",
              fontSize: "11px", fontFamily: "var(--font-ui)",
              left: "50%", bottom: -8, transform: "translateX(-50%)",
              whiteSpace: "nowrap", pointerEvents: "none",
            }}>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>{axes1[hoveredAxis].score ?? "N/M"}</span>
            <span style={{ color: "var(--dim)", margin: "0 4px" }}>vs</span>
            <span style={{ color: "#f97316", fontWeight: 600 }}>{axes2[hoveredAxis].score ?? "N/M"}</span>
            <span style={{ color: "var(--dim)", marginLeft: 6 }}>
              ({(axes1[hoveredAxis].score ?? 0) - (axes2[hoveredAxis].score ?? 0) > 0 ? "+" : ""}
              {(axes1[hoveredAxis].score ?? 0) - (axes2[hoveredAxis].score ?? 0)})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Score helpers ───────────────────────────────────────────────────

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

function deltaDisplay(delta: number): { text: string; color: string } {
  if (delta > 0) return { text: `+${delta}`, color: "var(--success)" };
  if (delta < 0) return { text: `${delta}`, color: "var(--danger)" };
  return { text: "=", color: "var(--dim)" };
}

// ─── Compact Score Card ──────────────────────────────────────────────

function ScoreCard({ domain, score, grade, archetype, color }: {
  domain: string; score: number; grade: string; archetype: string | null; color: string;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: "32px", fontWeight: 700,
          lineHeight: "1", color: scoreColor(score),
        }}>
          {score}
        </div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)", marginTop: 1 }}>
          /100
        </div>
      </div>
      <div style={{
        width: 36, height: 36, borderRadius: "var(--radius)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700,
        color: gradeColor(grade), flexShrink: 0,
        background: `color-mix(in srgb, ${gradeColor(grade)} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${gradeColor(grade)} 20%, transparent)`,
      }}>
        {grade}
      </div>
      <div className="min-w-0">
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600,
          color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {domain}
        </div>
        {archetype && (
          <span className="badge badge-info" style={{ fontSize: "9px", marginTop: 2 }}>
            {ARCHETYPE_ICONS[archetype] ?? "🌐"} {ARCHETYPE_LABELS[archetype] ?? archetype}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Compare View ──────────────────────────────────────────────

export function CompareView({ initialDomain }: { initialDomain?: string }) {
  const [domain1, setDomain1] = useState(initialDomain ?? "");
  const [domain2, setDomain2] = useState("");
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 500);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Check URL for compare path
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/compare\/([^/]+)\/([^/]+)$/);
    if (match) {
      setDomain1(match[1]);
      setDomain2(match[2]);
    }
  }, []);

  const compare = useStreamingCompare();

  const doCompare = useCallback(() => {
    const d1 = domain1.trim();
    const d2 = domain2.trim();
    if (!d1 || !d2 || compare.isPending) return;
    compare.mutate({ domain1: d1, domain2: d2 });
  }, [domain1, domain2, compare]);

  // Update URL + title when compare finishes
  useEffect(() => {
    if (compare.data && compare.dom1 && compare.dom2) {
      const comparePath = `/compare/${compare.dom1}/${compare.dom2}`;
      if (window.location.pathname !== comparePath) {
        window.history.pushState(null, "", comparePath);
      }
      document.title = `${compare.dom1} vs ${compare.dom2} — Yoke`;
    }
  }, [compare.data, compare.dom1, compare.dom2]);

  // Auto-trigger if both domains come from URL
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/compare\/([^/]+)\/([^/]+)$/);
    if (match && !compare.data && !compare.isPending) {
      compare.mutate({ domain1: match[1], domain2: match[2] });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const swap = () => {
    setDomain1(domain2);
    setDomain2(domain1);
  };

  const data = compare.data;
  const ds1 = data?.domain1?.domain_score;
  const ds2 = data?.domain2?.domain_score;

  return (
    <div className="space-y-4">
      {/* Input bar */}
      <div className="panel p-3">
        <div className="flex flex-col sm:flex-row items-stretch gap-2">
          <input
            type="text"
            value={domain1}
            onChange={e => setDomain1(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") doCompare(); }}
            placeholder="domain1.com"
            className="flex-1 bg-transparent px-3 py-2 rounded-md outline-none"
            style={{
              fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--accent)",
              border: "1px solid var(--border)", background: "var(--surface)",
            }}
            disabled={compare.isPending}
          />

          <button
            type="button"
            onClick={swap}
            className="flex items-center justify-center px-2 py-1 rounded-md self-center"
            style={{
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--dim)", cursor: "pointer", flexShrink: 0,
            }}
            title="Swap domains"
          >
            <ArrowLeftRight size={14} />
          </button>

          <input
            type="text"
            value={domain2}
            onChange={e => setDomain2(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") doCompare(); }}
            placeholder="domain2.com"
            className="flex-1 bg-transparent px-3 py-2 rounded-md outline-none"
            style={{
              fontFamily: "var(--font-mono)", fontSize: "13px", color: "#f97316",
              border: "1px solid var(--border)", background: "var(--surface)",
            }}
            disabled={compare.isPending}
          />

          <button
            type="button"
            onClick={doCompare}
            disabled={compare.isPending || !domain1.trim() || !domain2.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-md transition-all disabled:opacity-30"
            style={{
              background: "var(--accent)", color: "var(--accent-fg)",
              fontFamily: "var(--font-ui)", fontSize: "13px", fontWeight: 600,
              cursor: compare.isPending ? "default" : "pointer", border: "none",
              flexShrink: 0,
            }}
          >
            {compare.isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
            {compare.isPending ? "Comparing…" : "Go"}
          </button>
        </div>
      </div>

      {/* Error */}
      {compare.error && (
        <div className="panel p-4 flex items-center gap-3" style={{ borderColor: "var(--danger)" }}>
          <span style={{ color: "var(--danger)", fontFamily: "var(--font-ui)", fontSize: "13px" }}>
            Compare failed: {String(compare.error)}
          </span>
        </div>
      )}

      {/* Streaming progress — dual domain bars */}
      {compare.isPending && (
        <div className="panel p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowLeftRight size={14} style={{ color: "var(--accent)" }} />
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
              Comparing domains…
            </span>
          </div>
          <div className="flex gap-4" style={{ flexDirection: "row" }}>
            <CompareProgress domain={compare.dom1 || domain1} progress={compare.progress1} />
            <div style={{ width: 1, background: "var(--border)", flexShrink: 0 }} />
            <CompareProgress domain={compare.dom2 || domain2} progress={compare.progress2} />
          </div>
        </div>
      )}

      {/* Results */}
      {data && ds1 && ds2 && !compare.isPending && (
        <div className="space-y-4">
          {/* Score cards side by side */}
          <div className="panel p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
              <ScoreCard
                domain={data.domain1.domain}
                score={ds1.composite}
                grade={ds1.grade}
                archetype={data.comparison.archetype1}
                color="var(--accent)"
              />
              <div className="hidden sm:flex flex-col items-center" style={{ flexShrink: 0 }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700,
                  color: data.comparison.composite.delta > 0 ? "var(--success)"
                    : data.comparison.composite.delta < 0 ? "var(--danger)" : "var(--dim)",
                }}>
                  {data.comparison.composite.delta > 0 ? "+" : ""}{data.comparison.composite.delta}
                </div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: "9px", color: "var(--dim)", textTransform: "uppercase" }}>
                  delta
                </div>
              </div>
              <ScoreCard
                domain={data.domain2.domain}
                score={ds2.composite}
                grade={ds2.grade}
                archetype={data.comparison.archetype2}
                color="#f97316"
              />
            </div>
          </div>

          {/* Radar plot */}
          <div className="panel p-4">
            <div className="panel-header mb-3" style={{ padding: 0, border: "none" }}>
              <span className="flex items-center gap-2">
                <span className="opacity-60">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </span>
                <span style={{ fontFamily: "var(--font-ui)", fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>
                  Score Comparison
                </span>
              </span>
            </div>

            <CompareRadar
              axes1={ds1.axes}
              axes2={ds2.axes}
              domain1={data.domain1.domain}
              domain2={data.domain2.domain}
            />
          </div>

          {/* Axis comparison bars */}
          <div className="panel p-4">
            <div style={{
              fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600,
              color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em",
              marginBottom: 10,
            }}>
              Per-Axis Breakdown
            </div>
            <div className="space-y-3">
              {data.comparison.axes.map(ax => {
                const d = deltaDisplay(ax.delta);
                const isBigDiff = ax.absDelta >= 15;
                return (
                  <div key={ax.axis}>
                    <div className="flex items-center justify-between mb-1" style={{ fontSize: "11px" }}>
                      <span style={{
                        fontFamily: "var(--font-ui)", fontWeight: 600,
                        color: isBigDiff ? "var(--text)" : "var(--dim)",
                      }}>
                        {AXIS_LABELS[ax.axis]}
                        {isBigDiff && <span style={{ marginLeft: 4, fontSize: "9px", color: "var(--warning)" }}>★</span>}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: d.color, fontSize: "11px" }}>
                        {d.text}
                      </span>
                    </div>
                    <div className="flex items-center gap-2" style={{ fontSize: "11px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600, minWidth: 22, textAlign: "right" }}>
                        {ax.score1}
                      </span>
                      <div className="flex-1 relative" style={{ height: 8, borderRadius: 4 }}>
                        {/* Background */}
                        <div className="absolute inset-0 rounded" style={{ background: "var(--border)", opacity: 0.5 }} />
                        {/* Domain 1 bar */}
                        <div className="absolute top-0 left-0 rounded" style={{
                          height: 4, width: `${ax.score1}%`,
                          background: "var(--accent)", transition: "width 0.6s ease-out",
                        }} />
                        {/* Domain 2 bar */}
                        <div className="absolute bottom-0 left-0 rounded" style={{
                          height: 4, width: `${ax.score2}%`,
                          background: "#f97316", transition: "width 0.6s ease-out",
                        }} />
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", color: "#f97316", fontWeight: 600, minWidth: 22, textAlign: "left" }}>
                        {ax.score2}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Key differences */}
          <KeyDifferences data={data} />
        </div>
      )}

      {/* No score data */}
      {data && (!ds1 || !ds2) && !compare.isPending && (
        <div className="panel p-4" style={{ textAlign: "center" }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "13px", color: "var(--dim)" }}>
            {!ds1 && `Could not compute score for ${data.domain1.domain}. `}
            {!ds2 && `Could not compute score for ${data.domain2.domain}. `}
            Try different domains.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Key Differences ─────────────────────────────────────────────────

function KeyDifferences({ data }: { data: CompareResult }) {
  const d1 = data.domain1;
  const d2 = data.domain2;

  const diffs: { label: string; domain1: string; domain2: string }[] = [];

  // SSL grade
  if (d1.ssl?.grade !== d2.ssl?.grade) {
    diffs.push({ label: "SSL Grade", domain1: d1.ssl?.grade ?? "N/A", domain2: d2.ssl?.grade ?? "N/A" });
  }

  // Security headers grade
  if (d1.headers?.security_grade !== d2.headers?.security_grade) {
    diffs.push({ label: "Security Headers", domain1: d1.headers?.security_grade ?? "N/A", domain2: d2.headers?.security_grade ?? "N/A" });
  }

  // HTTP/2 vs HTTP/3
  const h1 = d1.http_protocols;
  const h2 = d2.http_protocols;
  if (h1?.http3 !== h2?.http3) {
    diffs.push({ label: "HTTP/3", domain1: h1?.http3 ? "Yes" : "No", domain2: h2?.http3 ? "Yes" : "No" });
  }

  // DNSSEC
  if (d1.dnssec?.enabled !== d2.dnssec?.enabled) {
    diffs.push({ label: "DNSSEC", domain1: d1.dnssec?.enabled ? "Enabled" : "Off", domain2: d2.dnssec?.enabled ? "Enabled" : "Off" });
  }

  // CDN
  const cdn1 = d1.hosting?.cdn;
  const cdn2 = d2.hosting?.cdn;
  if (cdn1 !== cdn2) {
    diffs.push({ label: "CDN", domain1: cdn1 ?? "None", domain2: cdn2 ?? "None" });
  }

  // WAF
  const waf1 = d1.waf?.detected ? d1.waf.provider : (d1.hosting?.waf ?? null);
  const waf2 = d2.waf?.detected ? d2.waf.provider : (d2.hosting?.waf ?? null);
  if (waf1 !== waf2) {
    diffs.push({ label: "WAF", domain1: waf1 ?? "None", domain2: waf2 ?? "None" });
  }

  // Performance score
  const ps1 = d1.performance?.score;
  const ps2 = d2.performance?.score;
  if (ps1 != null && ps2 != null && Math.abs(ps1 - ps2) >= 10) {
    diffs.push({ label: "PageSpeed", domain1: `${ps1}/100`, domain2: `${ps2}/100` });
  }

  // DMARC
  const dm1 = d1.email_auth?.dmarc?.policy;
  const dm2 = d2.email_auth?.dmarc?.policy;
  if (dm1 !== dm2) {
    diffs.push({ label: "DMARC Policy", domain1: dm1 ?? "None", domain2: dm2 ?? "None" });
  }

  // Tranco rank
  const tr1 = d1.tranco_rank;
  const tr2 = d2.tranco_rank;
  if ((tr1 ?? 0) !== (tr2 ?? 0)) {
    diffs.push({ label: "Tranco Rank", domain1: tr1 ? `#${tr1.toLocaleString()}` : "Unranked", domain2: tr2 ? `#${tr2.toLocaleString()}` : "Unranked" });
  }

  if (diffs.length === 0) return null;

  return (
    <div className="panel p-4">
      <div style={{
        fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600,
        color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em",
        marginBottom: 8,
      }}>
        Key Differences
      </div>
      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "var(--font-ui)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "4px 8px 4px 0", color: "var(--dim)", fontWeight: 500, fontSize: "10px" }}>Signal</th>
              <th style={{ textAlign: "center", padding: "4px 8px", color: "var(--accent)", fontWeight: 600, fontSize: "10px" }}>{data.domain1.domain}</th>
              <th style={{ textAlign: "center", padding: "4px 0 4px 8px", color: "#f97316", fontWeight: 600, fontSize: "10px" }}>{data.domain2.domain}</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d, i) => (
              <tr key={d.label} style={{ borderBottom: i < diffs.length - 1 ? "1px solid var(--border)" : "none" }}>
                <td style={{ padding: "5px 8px 5px 0", color: "var(--text)", fontWeight: 500 }}>{d.label}</td>
                <td style={{ padding: "5px 8px", textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text)" }}>{d.domain1}</td>
                <td style={{ padding: "5px 0 5px 8px", textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text)" }}>{d.domain2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
