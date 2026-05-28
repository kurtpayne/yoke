import { Gauge, Leaf, ExternalLink, BarChart3, Monitor, Smartphone, Users } from "lucide-react";
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

function VitalBadge({ label, value, good, poor }: { label: string; value: number; good: number; poor: number }) {
  const color = value <= good ? "var(--success)" : value <= poor ? "var(--warning)" : "var(--danger)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "2px 8px", borderRadius: "4px", fontSize: "11px",
      fontFamily: "var(--font-mono)", fontWeight: 600, color,
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
    }}>
      {label}
    </span>
  );
}

export function PerformancePanel({ data }: { data: AnalysisResult }) {
  const perf = data.performance;
  const perfDesktop = data.performance_desktop;
  const crux = data.performance_crux;
  const domain = data.domain;
  const psiUrl = `https://pagespeed.web.dev/analysis?url=https://${encodeURIComponent(domain)}`;
  const hasCrux = crux && crux.has_data;

  if (!perf && !perfDesktop && !hasCrux) return (
    <Panel title="Performance" icon={<Gauge size={14} />}>
      <ErrorState message="Performance data unavailable" />
    </Panel>
  );

  const hasError = !!perf?.error && !perf?.score;
  const mobileScore = perf?.score;
  const desktopScore = perfDesktop?.score;

  return (
    <Panel
      title="Performance"
      icon={<Gauge size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          <CliButton commands={performanceCliCommands(data.domain)} domain={data.domain} />
          {hasCrux && <StatusBadge status="pass" label="Field data" />}
          {hasError && !hasCrux
            ? <StatusBadge status="warn" label={perf!.error!.length > 40 ? perf!.error!.slice(0, 37) + "…" : perf!.error!} />
            : undefined}
        </div>
      }
    >
      {/* Score gauges — show all available */}
      {(mobileScore != null || desktopScore != null) && (
        <div className="flex justify-center gap-4 py-4 px-3" style={{ borderBottom: "1px solid var(--border-muted)" }}>
          {desktopScore != null && <ScoreGauge score={desktopScore} label="Desktop" />}
          {mobileScore != null && <ScoreGauge score={mobileScore} label="Mobile" />}
          {desktopScore != null && mobileScore != null && (
            <ScoreGauge score={Math.round(desktopScore * 0.6 + mobileScore * 0.4)} label="Blended" />
          )}
        </div>
      )}

      {/* CrUX Field Data Section */}
      {hasCrux && (
        <div style={{ borderBottom: "1px solid var(--border-muted)" }}>
          <div className="px-4 py-2" style={{ background: "color-mix(in srgb, var(--success) 5%, transparent)" }}>
            <div className="flex items-center gap-1.5">
              <Users size={12} style={{ color: "var(--success)" }} />
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", fontWeight: 600, color: "var(--success)" }}>
                Chrome UX Report — Real User Data (28-day p75)
              </span>
            </div>
          </div>
          <div>
            {crux.lcp_p75 != null && (
              <DataRow label={<span className="flex items-center gap-1">LCP <Tooltip text="Largest Contentful Paint — p75 from real Chrome users over 28 days. Under 2.5s is good." help /></span>} value={<VitalBadge label={formatMs(crux.lcp_p75)} value={crux.lcp_p75} good={2500} poor={4000} />} />
            )}
            {crux.fcp_p75 != null && (
              <DataRow label={<span className="flex items-center gap-1">FCP <Tooltip text="First Contentful Paint — p75 from real Chrome users. Under 1.8s is good." help /></span>} value={<VitalBadge label={formatMs(crux.fcp_p75)} value={crux.fcp_p75} good={1800} poor={3000} />} />
            )}
            {crux.cls_p75 != null && (
              <DataRow label={<span className="flex items-center gap-1">CLS <Tooltip text="Cumulative Layout Shift — p75 from real Chrome users. Under 0.1 is good." help /></span>} value={<VitalBadge label={crux.cls_p75.toFixed(3)} value={crux.cls_p75} good={0.1} poor={0.25} />} />
            )}
            {crux.inp_p75 != null && (
              <DataRow label={<span className="flex items-center gap-1">INP <Tooltip text="Interaction to Next Paint — a Core Web Vital measuring responsiveness. Under 200ms is good. Only available from real user data." help /></span>} value={<VitalBadge label={formatMs(crux.inp_p75)} value={crux.inp_p75} good={200} poor={500} />} />
            )}
            {crux.ttfb_p75 != null && (
              <DataRow label={<span className="flex items-center gap-1">TTFB <Tooltip text="Time to First Byte — p75 from real Chrome users. Under 800ms is good." help /></span>} value={<VitalBadge label={formatMs(crux.ttfb_p75)} value={crux.ttfb_p75} good={800} poor={1800} />} />
            )}
          </div>
          {crux.collection_period && (
            <div className="px-4 py-1.5">
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>
                Collection: {crux.collection_period.first_date} → {crux.collection_period.last_date}
              </span>
            </div>
          )}
          {crux.form_factors && (
            <div className="px-4 py-1.5" style={{ borderTop: "1px solid var(--border-muted)" }}>
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>
                Device mix: 🖥 {Math.round(crux.form_factors.desktop * 100)}% · 📱 {Math.round(crux.form_factors.phone * 100)}% · 📟 {Math.round(crux.form_factors.tablet * 100)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error state — informational, not scary */}
      {hasError && !hasCrux && (
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-muted)" }}>
          <div className="flex items-start gap-2">
            <span style={{ color: "var(--warning)", fontSize: "14px", lineHeight: 1, flexShrink: 0 }}>⚠</span>
            <div>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--warning)", margin: 0 }}>
                {perf!.error}
              </p>
              <p style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", margin: "4px 0 0" }}>
                Google's Lighthouse couldn't complete the analysis.{" "}
                <a href={psiUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                  Try PageSpeed Insights directly ↗
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Lab Data — Desktop + Mobile side by side */}
      {(mobileScore != null || desktopScore != null) && (
        <div>
          <div className="px-4 py-2" style={{ background: "color-mix(in srgb, var(--accent) 5%, transparent)" }}>
            <div className="flex items-center gap-1.5">
              <BarChart3 size={12} style={{ color: "var(--accent)" }} />
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", fontWeight: 600, color: "var(--accent)" }}>
                Lighthouse Lab Data
              </span>
            </div>
          </div>
          {/* Desktop metrics */}
          {perfDesktop && desktopScore != null && (
            <div>
              <div className="px-4 py-1.5" style={{ borderBottom: "1px solid var(--border-muted)" }}>
                <div className="flex items-center gap-1">
                  <Monitor size={11} style={{ color: "var(--dim)" }} />
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Desktop</span>
                </div>
              </div>
              {perfDesktop.fcp != null && <DataRow label="FCP" value={formatMs(perfDesktop.fcp)} />}
              {perfDesktop.lcp != null && <DataRow label="LCP" value={formatMs(perfDesktop.lcp)} />}
              {perfDesktop.tbt != null && <DataRow label="TBT" value={formatMs(perfDesktop.tbt)} />}
              {perfDesktop.cls != null && <DataRow label="CLS" value={perfDesktop.cls.toFixed(3)} />}
              {perfDesktop.si != null && <DataRow label="Speed Index" value={formatMs(perfDesktop.si)} />}
              {perfDesktop.ttfb != null && <DataRow label="TTFB" value={formatMs(perfDesktop.ttfb)} />}
            </div>
          )}
          {/* Mobile metrics */}
          {perf && mobileScore != null && (
            <div>
              <div className="px-4 py-1.5" style={{ borderBottom: "1px solid var(--border-muted)" }}>
                <div className="flex items-center gap-1">
                  <Smartphone size={11} style={{ color: "var(--dim)" }} />
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Mobile</span>
                </div>
              </div>
              {perf.fcp != null && <DataRow label="FCP" value={formatMs(perf.fcp)} />}
              {perf.lcp != null && <DataRow label="LCP" value={formatMs(perf.lcp)} />}
              {perf.tbt != null && <DataRow label="TBT" value={formatMs(perf.tbt)} />}
              {perf.cls != null && <DataRow label="CLS" value={perf.cls.toFixed(3)} />}
              {perf.si != null && <DataRow label="Speed Index" value={formatMs(perf.si)} />}
              {perf.ttfb != null && <DataRow label="TTFB" value={formatMs(perf.ttfb)} />}
            </div>
          )}
        </div>
      )}

      {/* Source attribution */}
      <div className="px-4 py-2" style={{ borderTop: "1px solid var(--border-muted)" }}>
        <div className="flex items-center justify-between">
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>
            {hasCrux ? "Field data from CrUX • Lab data from " : "Data from "}
            <a href={psiUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
              Google PageSpeed <ExternalLink size={9} style={{ display: "inline", verticalAlign: "middle" }} />
            </a>
          </span>
        </div>
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
