import { Activity, Globe, ExternalLink, Clock, Shield, Radio } from "lucide-react";
import type { AnalysisResult, NetworkHealthData } from "../api";
import { Panel, DataRow, StatusBadge } from "./Panel";
import { CliButton, networkHealthCliCommands } from "./CliModal";

export function NetworkHealthPanel({ data }: { data: AnalysisResult }) {
  const nh = data.network_health;
  if (!nh) return null;

  return (
    <Panel title="Network Health" icon={<Activity size={14} />} badge={<CliButton commands={networkHealthCliCommands(data.domain, data.ip_info?.ip)} domain={data.domain} ip={data.ip_info?.ip} />}>
      {nh.dns_propagation && <DnsPropagationSection data={nh.dns_propagation} />}
      {nh.connection_timing && <ConnectionTimingSection data={nh.connection_timing} />}
      {nh.ripe_routing && <RipeRoutingSection data={nh.ripe_routing} />}
      {nh.outage_links && <OutageLinksSection data={nh.outage_links} />}
    </Panel>
  );
}

/* ─── Tooltip helper ─────────────────────────────────────────────── */

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span style={{ position: "relative", cursor: "help" }} title={text}>
      {children}
    </span>
  );
}

/* ─── Section 1: DNS Propagation ─────────────────────────────────── */

function DnsPropagationSection({ data }: { data: NonNullable<NetworkHealthData["dns_propagation"]> }) {
  const thStyle: React.CSSProperties = {
    padding: "5px 12px",
    fontFamily: "var(--font-ui)",
    fontSize: "10px",
    fontWeight: 600,
    color: "var(--dim)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--surface-raised)",
          borderBottom: "1px solid var(--border-muted)",
        }}
      >
        <Tooltip text="Compares A records across Google, Cloudflare, Quad9, and OpenDNS resolvers. Inconsistencies can indicate propagation delays or geo-DNS configurations.">
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            DNS Propagation
          </span>
        </Tooltip>
        <StatusBadge
          status={data.consistent ? "pass" : "warn"}
          label={data.consistent ? "Consistent" : "Inconsistent"}
        />
      </div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-muted)" }}>
            <th style={{ ...thStyle, textAlign: "left" }}>Resolver</th>
            <th style={{ ...thStyle, textAlign: "left" }}>IPs</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Response Time</th>
            <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.resolvers.map((r, i) => {
            const dotColor =
              r.status === "ok"
                ? "var(--success)"
                : r.status === "timeout"
                  ? "var(--warning)"
                  : "var(--danger)";
            return (
              <tr
                key={r.name}
                style={{
                  borderBottom: "1px solid var(--border-muted)",
                  background: i % 2 === 1 ? "var(--surface-raised)" : undefined,
                }}
              >
                <td
                  style={{
                    padding: "5px 12px",
                    fontFamily: "var(--font-ui)",
                    fontSize: "12px",
                    color: "var(--text)",
                  }}
                >
                  {r.name}
                </td>
                <td
                  style={{
                    padding: "5px 12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--dim)",
                  }}
                >
                  {r.ips.join(", ")}
                </td>
                <td
                  style={{
                    padding: "5px 12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--dim)",
                    textAlign: "right",
                  }}
                >
                  {r.response_time_ms}ms
                </td>
                <td style={{ padding: "5px 12px", textAlign: "center" }}>
                  <div className="flex items-center justify-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: dotColor }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        fontWeight: 600,
                        color: dotColor,
                        textTransform: "uppercase",
                      }}
                    >
                      {r.status}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Unique IPs summary */}
      <div
        style={{
          padding: "6px 12px",
          fontFamily: "var(--font-ui)",
          fontSize: "11px",
          color: "var(--dim)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {data.unique_ips.length} unique IP{data.unique_ips.length !== 1 ? "s" : ""} resolved
      </div>
    </div>
  );
}

/* ─── Section 2: Connection Timing ───────────────────────────────── */

function ConnectionTimingSection({ data }: { data: NonNullable<NetworkHealthData["connection_timing"]> }) {
  const total = data.total_ms || 1;
  const segments = [
    { label: "DNS", ms: data.dns_ms, color: "var(--accent)" },
    { label: "TCP", ms: data.tcp_ms, color: "var(--success)" },
    { label: "TLS", ms: data.tls_ms, color: "var(--warning)" },
  ];

  // Calculate proportional widths with minimum 8%
  const rawWidths = segments.map((s) => (s.ms / total) * 100);
  const adjusted = rawWidths.map((w) => Math.max(w, 8));
  const adjustedTotal = adjusted.reduce((a, b) => a + b, 0);
  const normalizedWidths = adjusted.map((w) => (w / adjustedTotal) * 100);

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 0 }}>
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--surface-raised)",
          borderBottom: "1px solid var(--border-muted)",
        }}
      >
        <Tooltip text="Measures the time for DNS resolution, TCP handshake, and TLS negotiation separately. Tested from Fly.io edge infrastructure.">
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            Connection Timing
          </span>
        </Tooltip>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          {data.total_ms}ms
        </span>
      </div>

      {/* Stacked bar */}
      <div style={{ padding: "12px" }}>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "24px",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          {segments.map((seg, i) => (
            <div
              key={seg.label}
              style={{
                width: `${normalizedWidths[i]}%`,
                background: seg.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  fontWeight: 700,
                  color: "#fff",
                  textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                  whiteSpace: "nowrap",
                }}
              >
                {seg.label} {seg.ms}ms
              </span>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "16px",
            marginTop: "8px",
          }}
        >
          {segments.map((seg) => (
            <div
              key={seg.label}
              className="flex items-center gap-1.5"
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "2px",
                  background: seg.color,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: "10px",
                  color: "var(--dim)",
                }}
              >
                {seg.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Data rows */}
      <div style={{ padding: "0 0 4px 0" }}>
        <DataRow label="Total Time" value={`${data.total_ms}ms`} />
        {data.tls_version && (
          <DataRow
            label="TLS Version"
            value={
              <StatusBadge status="info" label={data.tls_version} />
            }
            mono={false}
            copyValue={data.tls_version}
          />
        )}
        {data.ip && <DataRow label="Connected IP" value={data.ip} />}
      </div>
    </div>
  );
}

/* ─── Section 3: RIPE Routing ────────────────────────────────────── */

function RipeRoutingSection({ data }: { data: NonNullable<NetworkHealthData["ripe_routing"]> }) {
  const stabilityStatus =
    data.routing_stability === "stable"
      ? "pass"
      : data.routing_stability === "moderate"
        ? "warn"
        : data.routing_stability === "unstable"
          ? "fail"
          : "neutral";

  const stabilityLabel = data.routing_stability
    ? data.routing_stability.charAt(0).toUpperCase() + data.routing_stability.slice(1)
    : "Unknown";

  const visColor =
    data.visibility
      ? data.visibility.percentage >= 90
        ? "var(--success)"
        : data.visibility.percentage >= 70
          ? "var(--warning)"
          : "var(--danger)"
      : "var(--dim)";

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          background: "var(--surface-raised)",
          borderBottom: "1px solid var(--border-muted)",
        }}
      >
        <Tooltip text="Route information from RIPE RIS. Shows the ASN (network operator), prefix (IP block), global visibility, and BGP route stability over the last 24 hours.">
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            BGP Routing
          </span>
        </Tooltip>
      </div>

      <div style={{ padding: "0 0 4px 0" }}>
        {/* ASN */}
        {data.asn != null && (
          <DataRow
            label="ASN"
            value={
              <span>
                <span style={{ fontFamily: "var(--font-mono)" }}>AS{data.asn}</span>
                {data.asn_name && (
                  <span
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: "11px",
                      color: "var(--dim)",
                      marginLeft: "6px",
                    }}
                  >
                    — {data.asn_name}
                  </span>
                )}
              </span>
            }
            mono={false}
            copyValue={data.asn_name ? `AS${data.asn} — ${data.asn_name}` : `AS${data.asn}`}
          />
        )}

        {/* Prefix */}
        {data.prefix && <DataRow label="Prefix" value={data.prefix} />}

        {/* Visibility */}
        {data.visibility && (
          <DataRow
            label="Visibility"
            value={
              <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                <div
                  style={{
                    flex: "0 0 60px",
                    height: "6px",
                    borderRadius: "3px",
                    background: "var(--surface-raised)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${data.visibility.percentage}%`,
                      height: "100%",
                      borderRadius: "3px",
                      background: visColor,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: visColor,
                    whiteSpace: "nowrap",
                  }}
                >
                  {data.visibility.seen_by}/{data.visibility.total} peers ({data.visibility.percentage}%)
                </span>
              </div>
            }
            mono={false}
            copyValue={`${data.visibility.seen_by}/${data.visibility.total} peers (${data.visibility.percentage}%)`}
          />
        )}

        {/* Stability */}
        {data.routing_stability && (
          <DataRow
            label="Stability"
            value={
              <div className="flex items-center gap-2">
                <StatusBadge status={stabilityStatus as "pass" | "warn" | "fail" | "neutral"} label={stabilityLabel} />
                {data.bgp_updates_24h != null && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      color: "var(--dim)",
                    }}
                  >
                    {data.bgp_updates_24h} updates/24h
                  </span>
                )}
              </div>
            }
            mono={false}
            copyValue={[stabilityLabel, data.bgp_updates_24h != null ? `${data.bgp_updates_24h} updates/24h` : null].filter(Boolean).join(" · ")}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Section 4: Outage Monitoring ───────────────────────────────── */

function OutageLinksSection({ data }: { data: NonNullable<NetworkHealthData["outage_links"]> }) {
  const links = [
    { label: "Downdetector", ...data.downdetector },
    { label: "IsItDown", ...data.isitdown },
  ];

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          background: "var(--surface-raised)",
          borderBottom: "1px solid var(--border-muted)",
        }}
      >
        <Tooltip text="Checks whether Downdetector and IsItDownRightNow have monitoring pages for this domain. Useful for checking reported outages.">
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            Outage Monitoring
          </span>
        </Tooltip>
      </div>

      {/* Badges */}
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        {links.map((link) => (
          <a
            key={link.label}
            href={link.exists ? link.url : undefined}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              borderRadius: "6px",
              fontFamily: "var(--font-ui)",
              fontSize: "11px",
              fontWeight: 600,
              textDecoration: "none",
              cursor: link.exists ? "pointer" : "default",
              background: link.exists
                ? "rgba(63, 185, 80, 0.1)"
                : "var(--surface-raised)",
              color: link.exists ? "var(--success)" : "var(--dim)",
              border: `1px solid ${link.exists ? "rgba(63, 185, 80, 0.25)" : "var(--border-muted)"}`,
              opacity: link.exists ? 1 : 0.5,
            }}
          >
            <Globe size={12} />
            {link.label}
            {link.exists && <ExternalLink size={10} />}
          </a>
        ))}
      </div>
    </div>
  );
}
