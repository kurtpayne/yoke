import { Code } from "lucide-react";
import { Panel, DataRow, StatusBadge } from "./Panel";
import type { AnalysisResult } from "../utils/types";

export function JsonLdPanel({ data }: { data: AnalysisResult }) {
  const items = data.json_ld;
  if (!items || items.length === 0) return (
    <Panel title="Schema.org / JSON-LD" icon={<Code size={14} />}>
      <div className="p-4">
        <StatusBadge status="neutral" label="No structured data found" />
        <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)", marginTop: "8px" }}>
          No JSON-LD structured data was detected in the page source.
        </p>
      </div>
    </Panel>
  );

  return (
    <Panel title="Schema.org / JSON-LD" icon={<Code size={14} />} badge={<StatusBadge status="info" label={`${items.length} items`} />}>
      {items.map((item, i) => (
        <div key={`${item.type}-${item.name ?? i}`}>
          <div className="sub-section" style={{ fontSize: "10px" }}>@type: {item.type}</div>
          {item.name && <DataRow label="Name" value={item.name} mono={false} />}
          {item.description && <DataRow label="Description" value={<span style={{ fontSize: "11px" }}>{item.description}</span>} mono={false} copyValue={item.description} />}
          {item.url && <DataRow label="URL" value={<span style={{ fontSize: "10px", wordBreak: "break-all" }}>{item.url}</span>} copyValue={item.url} />}
        </div>
      ))}
    </Panel>
  );
}
