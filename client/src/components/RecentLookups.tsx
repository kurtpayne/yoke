import { Clock } from "lucide-react";
import type { RecentLookupsResult } from "../utils/types";

type Lookup = RecentLookupsResult["lookups"][number];

interface RecentLookupsProps {
  lookups: Lookup[];
  onSelect: (domain: string) => void;
}

export function RecentLookups({ lookups, onSelect }: RecentLookupsProps) {
  if (lookups.length === 0) return null;

  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <Clock size={13} style={{ color: "var(--dim)", flexShrink: 0 }} />
      {lookups.map((l) => (
        <button
          key={l.id}
          onClick={() => onSelect(l.domain)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: "var(--text-secondary)",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-dim)";
            e.currentTarget.style.color = "var(--text)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          {l.is_up != null && (
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: l.is_up ? "var(--success)" : "var(--danger)" }}
            />
          )}
          <span>{l.domain}</span>
        </button>
      ))}
    </div>
  );
}
