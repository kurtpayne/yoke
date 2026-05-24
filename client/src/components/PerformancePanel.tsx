import { Gauge, Leaf } from "lucide-react";
import { Panel, DataRow, StatusBadge, ErrorState } from "./Panel";
import { CliButton, performanceCliCommands } from "./CliModal";
import { Tooltip } from "./Tooltip";
import type { AnalysisResult } from "../utils/types";

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 90 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--danger)";
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-14 h-14">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="2.5" />
          <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${pct * 0.94} 100`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center" style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color }}>
          {score}
        </span>
      </div>
      <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
    </div>
  );
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function PerformancePanel({ data }: { data: AnalysisResult }) {
  const perf = data.performance;
  if (!perf) return (
    <Panel title="Performance" icon={<Gauge size={14} />}>
      <ErrorState message="Performance data unavailable" />
    </Panel>
  );

  return (
    <Panel
      title="Performance"
      icon={<Gauge size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          <CliButton commands={performanceCliCommands(data.domain)} domain={data.domain} />
          {perf.error
            ? <StatusBadge status="warn" label={perf.error} />
            : perf.score != null
            ? <StatusBadge status={perf.score >= 90 ? "pass" : perf.score >= 50 ? "warn" : "fail"} label={`${perf.score}/100`} />
            : undefined}
        </div>
      }
    >
      {perf.score != null && (
        <div className="flex justify-center gap-4 py-4 px-3" style={{ borderBottom: "1px solid var(--border-muted)" }}>
          <ScoreGauge score={perf.score} label="Overall" />
        </div>
      )}
      <div>
        {perf.fcp != null && <DataRow label={<span className="flex items-center gap-1">First Contentful Paint <Tooltip text="Time until the first text or image is painted on screen" help /></span>} value={formatMs(perf.fcp)} />}
        {perf.lcp != null && <DataRow label={<span className="flex items-center gap-1">Largest Contentful Paint <Tooltip text="Time until the largest visible element (image or text block) renders. Under 2.5s is good." help /></span>} value={formatMs(perf.lcp)} />}
        {perf.tbt != null && <DataRow label={<span className="flex items-center gap-1">Total Blocking Time <Tooltip text="Total time the main thread was blocked, preventing user interaction. Under 200ms is good." help /></span>} value={formatMs(perf.tbt)} />}
        {perf.cls != null && <DataRow label={<span className="flex items-center gap-1">Cumulative Layout Shift <Tooltip text="Measures visual stability — how much the page layout shifts unexpectedly. Under 0.1 is good." help /></span>} value={perf.cls.toFixed(3)} />}
        {perf.si != null && <DataRow label={<span className="flex items-center gap-1">Speed Index <Tooltip text="How quickly content is visually displayed during page load. Lower is better." help /></span>} value={formatMs(perf.si)} />}
        {perf.ttfb != null && <DataRow label={<span className="flex items-center gap-1">Time to First Byte <Tooltip text="Time from the browser request to receiving the first byte from the server. Under 800ms is good." help /></span>} value={formatMs(perf.ttfb)} />}
        <DataRow label="Strategy" value={perf.strategy} />
      </div>
    </Panel>
  );
}

export function CarbonPanel({ data }: { data: AnalysisResult }) {
  const carbon = data.carbon;
  if (!carbon) return null;

  const co2 = carbon.co2_per_view;
  const cleaner = carbon.cleaner_than;
  const color = co2 != null ? (co2 < 0.5 ? "var(--success)" : co2 < 1.0 ? "var(--warning)" : "var(--danger)") : "var(--dim)";

  return (
    <Panel title="Carbon Footprint" icon={<Leaf size={14} />}>
      <div className="flex items-center gap-4 p-4">
        {co2 != null && (
          <div className="flex flex-col items-center justify-center rounded-lg p-3" style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, minWidth: "80px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 700, color, lineHeight: 1 }}>
              {co2.toFixed(2)}g
            </span>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>
              CO₂/view
            </span>
          </div>
        )}
        <div className="flex-1 space-y-2">
          {cleaner != null && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)" }}>Cleaner than</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color, fontWeight: 600 }}>
                  {Math.round(cleaner * 100)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full" style={{ background: "var(--border)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round(cleaner * 100)}%`, background: color }} />
              </div>
            </div>
          )}
          <StatusBadge status={carbon.green ? "pass" : "neutral"} label={carbon.green ? "Green hosted" : "Standard hosting"} />
        </div>
      </div>
    </Panel>
  );
}
