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
            HTTP connectivity checks + DNS resolution from multiple providers
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
            <Globe size={12} /> Run Availability Check
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
              Running availability checks...
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

  const httpResults = data.results.filter((r) => r.type !== "dns");
  const dnsResults = data.results.filter((r) => r.type === "dns");
  const isGlobal = data.source === "check-host";
  const edgeColo = data.edge_colo ?? null;

  const httpUp = httpResults.filter((r) => r.status === "up").length;
  const httpTotal = httpResults.length;
  const httpPending = httpResults.filter((r) => r.status === "pending").length;
  const allHttpUp = httpUp === httpTotal && httpPending === 0;

  const dnsUp = dnsResults.filter((r) => r.status === "up").length;
  const dnsTotal = dnsResults.length;

  const thStyle = {
    padding: "5px 12px",
    fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600,
    color: "var(--dim)", textTransform: "uppercase" as const, letterSpacing: "0.06em",
  };

  return (
    <Panel
      title="Global Availability"
      icon={<Globe size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          <CliButton commands={availabilityCliCommands(domain)} domain={domain} />
          <StatusBadge
            status={allHttpUp ? "pass" : httpUp > httpTotal / 2 ? "warn" : "fail"}
            label={`${httpUp}/${httpTotal} UP`}
          />
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
      <div style={{ maxHeight: "500px", overflowY: "auto", overflowX: "auto" }}>
        {/* HTTP Probes Section Header */}
        <div style={{
          padding: "6px 12px",
          background: "var(--surface-raised)",
          borderBottom: "1px solid var(--border-muted)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            HTTP Probes
          </span>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>
            {isGlobal
              ? `${httpTotal} worldwide locations`
              : edgeColo
                ? `from CF edge ${edgeColo}`
                : `${httpTotal} probes from edge`}
            {httpPending > 0 ? ` · ${httpPending} pending` : ""}
          </span>
        </div>

        {/* HTTP Results Table */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-muted)" }}>
              <th style={{ ...thStyle, textAlign: "left" }}>Location</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Response</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Code</th>
            </tr>
          </thead>
          <tbody>
            {httpResults.map((r, i) => (
              <tr key={`http-${i}`} style={{ borderBottom: "1px solid var(--border-muted)" }}>
                <td style={{ padding: "5px 12px" }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: "14px" }}>{countryFlag(r.location.country_code)}</span>
                    <div>
                      <div style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--text)" }}>
                        {r.location.city || r.location.country}
                      </div>
                      {(r.ip || r.location.asn) && (
                        <div style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>
                          {[r.ip, r.location.asn].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ padding: "5px 12px", textAlign: "center" }}>
                  <StatusDot status={r.status} />
                </td>
                <td style={{
                  padding: "5px 12px", textAlign: "right",
                  fontFamily: "var(--font-mono)", fontSize: "11px",
                  color: r.response_time_ms != null
                    ? (r.response_time_ms < 300 ? "var(--success)" : r.response_time_ms < 1000 ? "var(--warning)" : "var(--danger)")
                    : "var(--dim)",
                }}>
                  {r.response_time_ms != null ? `${r.response_time_ms}ms` : "—"}
                </td>
                <td style={{ padding: "5px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--dim)" }}>
                  {r.status_code ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* DNS Resolution Section */}
        {dnsResults.length > 0 && (
          <>
            <div style={{
              padding: "6px 12px",
              background: "var(--surface-raised)",
              borderTop: "1px solid var(--border-muted)",
              borderBottom: "1px solid var(--border-muted)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                DNS Resolution
              </span>
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>
                {dnsUp}/{dnsTotal} resolving
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {dnsResults.map((r, i) => (
                  <tr key={`dns-${i}`} style={{ borderBottom: "1px solid var(--border-muted)" }}>
                    <td style={{ padding: "5px 12px" }}>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: "14px" }}>{countryFlag(r.location.country_code)}</span>
                        <div>
                          <div style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--text)" }}>
                            {r.location.city}
                          </div>
                          <div style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>
                            {r.location.country}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "5px 12px", textAlign: "center" }}>
                      <StatusDot status={r.status} label={r.status === "up" ? "RESOLVES" : "FAIL"} />
                    </td>
                    <td colSpan={2} style={{
                      padding: "5px 12px", textAlign: "right",
                      fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--dim)",
                      maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {r.message ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Footer: link to check-host.net results or edge info */}
      {data.permanent_link ? (
        <div className="px-4 py-2" style={{ borderTop: "1px solid var(--border-muted)" }}>
          <a href={data.permanent_link} target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--accent)", textDecoration: "none" }}>
            View full results on check-host.net →
          </a>
        </div>
      ) : !isGlobal && edgeColo ? (
        <div className="px-3 py-2" style={{ borderTop: "1px solid var(--border-muted)" }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>
            Probed from Cloudflare {edgeColo} edge · Results reflect connectivity from your region
          </span>
        </div>
      ) : null}
    </Panel>
  );
}

function StatusDot({ status, label }: { status: string; label?: string }) {
  const isPending = status === "pending";
  const isUp = status === "up";
  const isError = status === "error";
  const color = isUp ? "var(--success)" : isPending ? "var(--warning)" : isError ? "var(--warning)" : "var(--danger)";
  const text = label ?? (isUp ? "UP" : isPending ? "..." : isError ? "ERROR" : "DOWN");

  return (
    <div className="flex items-center justify-center gap-1.5">
      {isPending ? (
        <RefreshCw size={10} className="animate-spin" style={{ color }} />
      ) : (
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
      )}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color, fontWeight: 600 }}>
        {text}
      </span>
    </div>
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
