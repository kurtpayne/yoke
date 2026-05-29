import { Layers } from "lucide-react";
import { Panel, DataRow, StatusBadge, ErrorState } from "./Panel";
import { CliButton, techStackCliCommands } from "./CliModal";
import type { AnalysisResult } from "../utils/types";

const confidenceLabel: Record<string, string> = { high: "high", medium: "med", low: "low" };
const confidenceColor: Record<string, string> = { high: "var(--success)", medium: "var(--warning)", low: "var(--dim)" };

export function TechStackPanel({ data }: { data: AnalysisResult }) {
  const tech = data.tech_stack;
  if (!tech || tech.length === 0) return (
    <Panel title="Tech Stack" icon={<Layers size={14} />} badge={<CliButton commands={techStackCliCommands(data.domain)} domain={data.domain} />}>
      <ErrorState message="No technologies detected" />
    </Panel>
  );

  const grouped = new Map<string, typeof tech>();
  for (const item of tech) {
    const existing = grouped.get(item.category) ?? [];
    existing.push(item);
    grouped.set(item.category, existing);
  }

  return (
    <Panel
      title="Tech Stack"
      icon={<Layers size={14} />}
      badge={<StatusBadge status="info" label={`${tech.length} detected`} />}
    >
      {[...grouped.entries()].map(([category, items]) => (
        <div key={category}>
          <div className="sub-section" style={{ color: "var(--dim)", fontSize: "10px" }}>{category}</div>
          {items.map((item, i) => (
            <DataRow
              key={item.name}
              label={<span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text)" }}>{item.name}</span>}
              value={
                <div className="flex items-center gap-2">
                  {item.version && <span className="badge badge-info" style={{ fontSize: "10px" }}>v{item.version}</span>}
                  <span
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                    style={{
                      fontSize: "9px",
                      fontFamily: "var(--font-ui)",
                      fontWeight: 600,
                      letterSpacing: "0.03em",
                      color: confidenceColor[item.confidence] ?? "var(--dim)",
                      background: `color-mix(in srgb, ${confidenceColor[item.confidence] ?? "var(--dim)"} 12%, transparent)`,
                      lineHeight: 1,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: confidenceColor[item.confidence] ?? "var(--dim)" }}
                    />
                    {confidenceLabel[item.confidence] ?? item.confidence}
                  </span>
                </div>
              }
              copyValue={item.version ? `${item.name} v${item.version}` : item.name}
            />
          ))}
        </div>
      ))}
      <div className="px-4 py-2.5 flex items-center gap-4 border-t" style={{ borderColor: "var(--border)" }}>
        <span style={{ fontSize: "9px", fontFamily: "var(--font-ui)", color: "var(--dim)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Confidence:
        </span>
        {(["high", "medium", "low"] as const).map((level) => (
          <span key={level} className="flex items-center gap-1" style={{ fontSize: "9px", fontFamily: "var(--font-ui)", color: confidenceColor[level] }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: confidenceColor[level] }} />
            {confidenceLabel[level]}
          </span>
        ))}
      </div>
    </Panel>
  );
}
