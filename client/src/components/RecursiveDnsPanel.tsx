import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Globe, Loader2, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "../api";
import { Panel } from "./Panel";
import type { RecursiveDnsResult, ResolverResult } from "../utils/types";

function StatusBadge({ status }: { status: ResolverResult["status"] }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    ok: { bg: "var(--success-subtle, rgba(63,185,80,0.15))", fg: "var(--success, #3fb950)" },
    nxdomain: { bg: "var(--warning-subtle, rgba(210,153,34,0.15))", fg: "var(--warning, #d29922)" },
    servfail: { bg: "var(--danger-subtle, rgba(248,81,73,0.15))", fg: "var(--danger, #f85149)" },
    timeout: { bg: "var(--danger-subtle, rgba(248,81,73,0.15))", fg: "var(--danger, #f85149)" },
    error: { bg: "var(--danger-subtle, rgba(248,81,73,0.15))", fg: "var(--danger, #f85149)" },
  };
  const c = colors[status] || colors.error;
  return (
    <span
      className="badge"
      style={{
        fontSize: "9px",
        padding: "1px 6px",
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.fg}33`,
      }}
    >
      {status}
    </span>
  );
}

function RecordCell({ records, highlight }: { records: string[]; highlight?: boolean }) {
  if (records.length === 0) {
    return <span style={{ color: "var(--dim)", fontSize: "11px", fontStyle: "italic" }}>none</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {records.map(r => (
        <span
          key={r}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: highlight ? "var(--warning, #d29922)" : "var(--text)",
          }}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

export function RecursiveDnsPanel({ domain }: { domain: string }) {
  const scan = useMutation({
    mutationFn: () => api.recursiveDns({ domain }),
  });

  const data = scan.data as RecursiveDnsResult | undefined;

  // Determine if there are discrepancies between resolvers
  function hasDiscrepancy(): boolean {
    if (!data || data.consensus) return false;
    return true;
  }

  // Get the set of A records for a resolver, to compare for highlighting
  function getResolverAKey(r: ResolverResult): string {
    return r.a_records.slice().sort().join(",");
  }

  // Determine which resolvers have non-matching records for highlighting
  function isDiscrepant(r: ResolverResult): boolean {
    if (!data || data.consensus) return false;
    const okResolvers = data.resolvers.filter(res => res.status === "ok");
    if (okResolvers.length <= 1) return false;
    const keys = okResolvers.map(getResolverAKey);
    const firstKey = keys[0];
    // Highlight if this resolver's key differs from the first
    return r.status === "ok" && getResolverAKey(r) !== firstKey;
  }

  return (
    <Panel
      title="DNS Resolution"
      icon={<Globe size={14} />}
      badge={
        data ? (
          data.consensus ? (
            <span className="badge badge-info" style={{ fontSize: "10px", display: "flex", alignItems: "center", gap: "3px" }}>
              <CheckCircle2 size={10} /> consensus
            </span>
          ) : (
            <span className="badge" style={{ fontSize: "10px", display: "flex", alignItems: "center", gap: "3px", background: "var(--warning-subtle, rgba(210,153,34,0.15))", color: "var(--warning, #d29922)", border: "1px solid rgba(210,153,34,0.25)" }}>
              <AlertTriangle size={10} /> discrepancy
            </span>
          )
        ) : null
      }
    >
      {!data && !scan.isPending && (
        <div className="p-4 flex flex-col items-center gap-3">
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)", textAlign: "center" }}>
            Queries Google, Cloudflare &amp; Quad9 DNS resolvers to check for consistency.
          </p>
          <button
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-md"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            <Search size={13} />
            Check DNS Resolution
          </button>
        </div>
      )}

      {scan.isPending && (
        <div className="p-4 flex flex-col items-center gap-2">
          <Loader2 size={18} className="animate-spin" style={{ color: "var(--accent)" }} />
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)" }}>
            Querying resolvers…
          </p>
        </div>
      )}

      {scan.error && (
        <div className="p-4">
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--danger)" }}>
            Check failed: {String(scan.error)}
          </p>
          <button
            onClick={() => scan.mutate()}
            className="mt-2 px-3 py-1 rounded-md"
            style={{
              background: "var(--danger-subtle)",
              color: "var(--danger)",
              border: "1px solid rgba(248, 81, 73, 0.25)",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: "11px",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="p-2">
          {/* Results table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", fontFamily: "var(--font-ui)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-muted)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Resolver</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>A Records</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>AAAA Records</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>TTL</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Time</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.resolvers.map(r => (
                  <tr key={r.name} style={{ borderBottom: "1px solid var(--border-muted)" }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      <div>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{r.name}</span>
                        <span style={{ fontSize: "10px", color: "var(--dim)", marginLeft: "6px" }}>{r.provider}</span>
                      </div>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <RecordCell records={r.a_records} highlight={isDiscrepant(r)} />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <RecordCell records={r.aaaa_records} />
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--dim)" }}>
                      {r.ttl != null ? `${r.ttl}s` : "—"}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--dim)" }}>
                      {r.response_time_ms}ms
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Discrepancy warning */}
          {hasDiscrepancy() && (
            <div
              className="flex items-center gap-2 mt-2 px-3 py-2 rounded-md"
              style={{
                background: "var(--warning-subtle, rgba(210,153,34,0.1))",
                border: "1px solid rgba(210,153,34,0.25)",
                fontSize: "11px",
                fontFamily: "var(--font-ui)",
                color: "var(--warning, #d29922)",
              }}
            >
              <AlertTriangle size={12} />
              <span>DNS resolvers are returning different A records — this may indicate DNS propagation in progress or geo-based load balancing.</span>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
