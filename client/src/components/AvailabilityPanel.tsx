import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe, RefreshCw } from "lucide-react";
import { api } from "../api";
import { Panel, StatusBadge, ErrorState } from "./Panel";
import { CliButton, availabilityCliCommands } from "./CliModal";

export function AvailabilityPanel({ domain }: { domain: string }) {
  const [enabled, setEnabled] = useState(false);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["availability", domain],
    queryFn: () => api.checkAvailability({ domain }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  if (!enabled) {
    return (
      <Panel title="Global Availability" icon={<Globe size={14} />}>
        <div className="p-4 flex flex-col items-center gap-3">
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)", textAlign: "center" }}>
            Test HTTP availability from 20+ worldwide locations via check-host.net
          </p>
          <button
            type="button"
            onClick={() => setEnabled(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-md transition-all"
            style={{
              background: "var(--accent)", color: "var(--accent-fg)",
              fontFamily: "var(--font-ui)", fontSize: "12px", fontWeight: 600,
              border: "none", cursor: "pointer",
            }}
          >
            <Globe size={12} /> Run Global Check
          </button>
        </div>
      </Panel>
    );
  }

  if (isPending) {
    return (
      <Panel title="Global Availability" icon={<Globe size={14} />}>
        <div className="p-4 text-center">
          <div className="inline-flex items-center gap-2">
            <RefreshCw size={14} className="animate-spin" style={{ color: "var(--accent)" }} />
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)" }}>
              Testing from global nodes... (takes ~5s)
            </span>
          </div>
        </div>
      </Panel>
    );
  }

  if (error) return <ErrorState message={`Availability check failed: ${String(error)}`} />;
  if (!data?.results?.length) {
    return (
      <Panel title="Global Availability" icon={<Globe size={14} />}>
        <div className="p-4 flex flex-col items-center gap-2">
          <StatusBadge status="warn" label="Check returned no results" />
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", textAlign: "center" }}>
            check-host.net may be temporarily unavailable. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all"
            style={{
              background: "var(--surface-raised)", border: "1px solid var(--border-muted)",
              fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--text)",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      </Panel>
    );
  }

  const upCount = data.results.filter((r) => r.status === "up").length;
  const totalCount = data.results.length;
  const allUp = upCount === totalCount;

  return (
    <Panel
      title="Global Availability"
      icon={<Globe size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          <CliButton commands={availabilityCliCommands(domain)} domain={domain} />
          <StatusBadge status={allUp ? "pass" : upCount > totalCount / 2 ? "warn" : "fail"} label={`${upCount}/${totalCount} UP`} />
          <button
            type="button"
            onClick={() => refetch()}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", padding: "2px" }}
            title="Re-run check"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      }
    >
      <div style={{ maxHeight: "400px", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-muted)" }}>
              <th style={{ padding: "6px 12px", textAlign: "left", fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Location</th>
              <th style={{ padding: "6px 12px", textAlign: "center", fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</th>
              <th style={{ padding: "6px 12px", textAlign: "right", fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Response</th>
              <th style={{ padding: "6px 12px", textAlign: "right", fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Code</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((r, i) => (
              <tr key={`avail-${i}`} style={{ borderBottom: "1px solid var(--border-muted)" }}>
                <td style={{ padding: "6px 12px" }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: "14px" }}>{countryFlag(r.location.country_code)}</span>
                    <div>
                      <div style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--text)" }}>{r.location.city || r.location.country}</div>
                      <div style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>{r.location.country_code}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "6px 12px", textAlign: "center" }}>
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: r.status === "up" ? "var(--success)" : r.status === "pending" ? "var(--warning)" : "var(--danger)" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: r.status === "up" ? "var(--success)" : r.status === "pending" ? "var(--warning)" : "var(--danger)", fontWeight: 600 }}>
                      {r.status.toUpperCase()}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "6px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "11px", color: r.response_time_ms != null ? (r.response_time_ms < 500 ? "var(--success)" : r.response_time_ms < 2000 ? "var(--warning)" : "var(--danger)") : "var(--dim)" }}>
                  {r.response_time_ms != null ? `${r.response_time_ms}ms` : "—"}
                </td>
                <td style={{ padding: "6px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--dim)" }}>
                  {r.status_code ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.permanent_link && (
        <div className="px-4 py-2" style={{ borderTop: "1px solid var(--border-muted)" }}>
          <a href={data.permanent_link} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--accent)", textDecoration: "none" }}>
            View full results on check-host.net →
          </a>
        </div>
      )}
    </Panel>
  );
}

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌐";
  try {
    const codePoints = code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
    return String.fromCodePoint(...codePoints);
  } catch {
    return "🌐";
  }
}
