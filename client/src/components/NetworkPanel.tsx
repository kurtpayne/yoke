import { MapPin, ShieldAlert, Wifi } from "lucide-react";
import { Panel, DataRow, StatusBadge, ErrorState } from "./Panel";
import { CliButton, ipInfoCliCommands, blocklistCliCommands, httpProtocolCliCommands } from "./CliModal";
import type { AnalysisResult } from "../utils/types";

export function IpInfoPanel({ data }: { data: AnalysisResult }) {
  const ip = data.ip_info;
  if (!ip) return (
    <Panel title="IP & Hosting" icon={<MapPin size={14} />}>
      <ErrorState message="IP geolocation unavailable" />
    </Panel>
  );

  return (
    <Panel title="IP & Hosting" icon={<MapPin size={14} />} badge={<CliButton commands={ipInfoCliCommands(ip.ip)} domain={data.domain} ip={ip.ip} />}>
      <DataRow label="IP Address" value={ip.ip} />
      {ip.ipv6 && <DataRow label="IPv6" value={ip.ipv6} />}
      {ip.isp && <DataRow label="ISP" value={ip.isp} />}
      {ip.org && ip.org !== ip.isp && <DataRow label="Organization" value={ip.org} />}
      {ip.asn && <DataRow label="ASN" value={ip.asn} />}
      {ip.city && <DataRow label="Location" value={`${ip.city}, ${ip.country ?? ""}`} />}
      {ip.country_code && <DataRow label="Country Code" value={ip.country_code} />}
      {ip.lat != null && ip.lon != null && <DataRow label="Coordinates" value={`${ip.lat.toFixed(4)}, ${ip.lon.toFixed(4)}`} />}
      {ip.reverse_dns && <DataRow label="Reverse DNS" value={ip.reverse_dns} />}
    </Panel>
  );
}

export function BlocklistPanel({ data }: { data: AnalysisResult }) {
  const lists = data.blocklists;
  if (!lists || lists.length === 0) return (
    <Panel title="DNS Blocklists" icon={<ShieldAlert size={14} />}>
      <ErrorState message="Blocklist checks unavailable" />
    </Panel>
  );

  const listedCount = lists.filter(l => l.listed).length;

  return (
    <Panel
      title="DNS Blocklists"
      icon={<ShieldAlert size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          {data.ip_info?.ip && <CliButton commands={blocklistCliCommands(data.ip_info.ip)} domain={data.domain} ip={data.ip_info.ip} />}
          {listedCount > 0 ? <StatusBadge status="fail" label={`${listedCount} LISTED`} /> : <StatusBadge status="pass" label="ALL CLEAN" />}
        </div>
      }
    >
      {lists.map((bl, i) => (
        <div key={`net-${i}`} className="data-row">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full" style={{ background: bl.listed ? "var(--danger)" : "var(--success)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: bl.listed ? "var(--danger)" : "var(--text)" }}>
              {bl.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--dim)" }}>{bl.zone}</span>
            <span className={bl.listed ? "badge badge-fail" : "badge badge-pass"} style={{ fontSize: "10px" }}>
              {bl.listed ? "LISTED" : "CLEAN"}
            </span>
          </div>
        </div>
      ))}
    </Panel>
  );
}

export function HttpProtocolsPanel({ data }: { data: AnalysisResult }) {
  const proto = data.http_protocols;
  if (!proto) return null;

  return (
    <Panel title="HTTP Protocols" icon={<Wifi size={14} />} badge={<CliButton commands={httpProtocolCliCommands(data.domain)} domain={data.domain} />}>
      <DataRow
        label="HTTP/2"
        value={<StatusBadge status={proto.http2 ? "pass" : "neutral"} label={proto.http2 ? "Supported" : "Not detected"} />}
      />
      <DataRow
        label="HTTP/3"
        value={<StatusBadge status={proto.http3 ? "pass" : "neutral"} label={proto.http3 ? "Supported" : "Not detected"} />}
      />
      {proto.alt_svc && (
        <DataRow label="Alt-Svc" value={<span style={{ fontSize: "10px" }} className="break-all">{proto.alt_svc.length > 80 ? proto.alt_svc.slice(0, 80) + "…" : proto.alt_svc}</span>} copyValue={proto.alt_svc} />
      )}
    </Panel>
  );
}
