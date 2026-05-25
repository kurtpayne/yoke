import { Globe } from "lucide-react";
import { Panel, DataRow, StatusBadge, ErrorState } from "./Panel";
import { CliButton, dnsCliCommands } from "./CliModal";
import { Tooltip } from "./Tooltip";
import type { AnalysisResult } from "../utils/types";

const TYPE_ORDER = ["A", "AAAA", "CNAME", "MX", "NS", "TXT", "SOA", "CAA"];

const DNS_TYPE_TOOLTIPS: Record<string, string> = {
  A: "IPv4 address record — maps the domain to a 32-bit IP address",
  AAAA: "IPv6 address record — maps the domain to a 128-bit IP address",
  CNAME: "Canonical name — an alias pointing to another domain name",
  MX: "Mail exchange — specifies which servers accept email for this domain",
  NS: "Nameserver — authoritative DNS servers for this domain",
  TXT: "Text record — arbitrary text, often used for SPF, DKIM, domain verification",
  SOA: "Start of Authority — primary nameserver and zone timing parameters",
  CAA: "Certificate Authority Authorization — restricts which CAs can issue SSL certs for this domain",
  SRV: "Service record — defines the location of servers for specific services",
  PTR: "Pointer record — maps an IP address back to a domain name (reverse DNS)",
};

export function DnsPanel({ data }: { data: AnalysisResult }) {
  const dns = data.dns;
  if (!dns) return (
    <Panel title="DNS Records" icon={<Globe size={14} />}>
      <ErrorState message="DNS lookup failed or returned no records" />
    </Panel>
  );

  const grouped = new Map<string, typeof dns.records>();
  for (const rec of dns.records) {
    const existing = grouped.get(rec.type) ?? [];
    existing.push(rec);
    grouped.set(rec.type, existing);
  }

  const sortedTypes = [...grouped.keys()].sort(
    (a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b)
  );

  return (
    <Panel
      title="DNS Records"
      icon={<Globe size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          <CliButton commands={dnsCliCommands(data.domain)} domain={data.domain} />
          <StatusBadge status="info" label={`${dns.records.length} records`} />
        </div>
      }
    >
      {sortedTypes.map((type) => {
        const records = grouped.get(type) ?? [];
        const tooltip = DNS_TYPE_TOOLTIPS[type];
        return (
          <div key={type}>
            <div className="sub-section flex items-center gap-1.5">
              {type}
              {tooltip && <Tooltip text={tooltip} help />}
            </div>
            {records.map((rec, i) => {
              // Show the record name when it differs from the root domain (e.g., _ans.domain, _agents.domain)
              const isSubdomain = rec.name !== data.domain && rec.name !== data.domain.replace(/\.$/, "");
              return (
                <DataRow
                  key={`${type}-${i}`}
                  label={<span className="flex items-center gap-1">{isSubdomain && <span style={{ color: "var(--accent)", fontSize: "10px", fontFamily: "var(--font-mono)" }}>{rec.name}</span>}TTL {rec.ttl} <Tooltip text={`Time to Live: DNS resolvers cache this record for ${rec.ttl} seconds before re-querying`} help /></span>}
                  value={<span className="break-all" style={{ fontSize: "11px" }}>{rec.data}</span>}
                />
              );
            })}
          </div>
        );
      })}
    </Panel>
  );
}
