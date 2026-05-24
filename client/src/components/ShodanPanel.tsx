import { Cpu, AlertTriangle, Tag, Server } from "lucide-react";
import { Panel, StatusBadge } from "./Panel";
import { CliButton, shodanCliCommands } from "./CliModal";
import { Tooltip } from "./Tooltip";
import type { AnalysisResult } from "../utils/types";

export function ShodanPanel({ data }: { data: AnalysisResult }) {
  const shodan = data.shodan;
  const ip = data.ip_info?.ip;
  if (!shodan) return null;

  const hasPorts = shodan.ports.length > 0;
  const hasVulns = shodan.vulns.length > 0;
  const hasCpes = shodan.cpes.length > 0;
  const hasTags = shodan.tags.length > 0;

  return (
    <Panel
      title="Shodan InternetDB"
      icon={<Cpu size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          {ip && <CliButton commands={shodanCliCommands(ip)} domain={data.domain} ip={ip} />}
          {hasVulns ? (
            <Tooltip text="Known CVE vulnerabilities found on this IP address by Shodan's automated scanning">
              <span style={{ cursor: "help" }}><StatusBadge status="fail" label={`${shodan.vulns.length} CVE${shodan.vulns.length > 1 ? "s" : ""}`} /></span>
            </Tooltip>
          ) : (
            <Tooltip text="No known CVE vulnerabilities detected on this IP">
              <span style={{ cursor: "help" }}><StatusBadge status="pass" label="No CVEs" /></span>
            </Tooltip>
          )}
          {hasPorts && (
            <Tooltip text="Number of TCP/UDP ports found open on this IP address">
              <span style={{ cursor: "help" }}><StatusBadge status="info" label={`${shodan.ports.length} ports`} /></span>
            </Tooltip>
          )}
        </div>
      }
    >
      {/* Open Ports */}
      {hasPorts && (
        <>
          <div className="sub-section flex items-center gap-1.5">
            Open Ports
            <Tooltip text="TCP/UDP ports detected as open by Shodan's network scanners. Common ports: 80 (HTTP), 443 (HTTPS), 22 (SSH), 25 (SMTP)." help />
          </div>
          <div className="px-4 py-2 flex flex-wrap gap-1.5">
            {shodan.ports.map((port, i) => {
              const portLabels: Record<number, string> = { 21: "FTP", 22: "SSH", 25: "SMTP", 53: "DNS", 80: "HTTP", 110: "POP3", 143: "IMAP", 443: "HTTPS", 587: "SMTP/TLS", 993: "IMAPS", 3306: "MySQL", 5432: "PostgreSQL", 6379: "Redis", 8080: "HTTP Alt", 8443: "HTTPS Alt", 27017: "MongoDB" };
              const label = portLabels[port];
              return (
                <Tooltip key={port} text={label ? `Port ${port} — typically used for ${label}` : `Port ${port}`}>
                  <span className="badge badge-info" style={{ fontSize: "11px", fontFamily: "var(--font-mono)", cursor: "help" }}>
                    {port}
                  </span>
                </Tooltip>
              );
            })}
          </div>
        </>
      )}

      {/* Vulnerabilities */}
      {hasVulns && (
        <>
          <div className="sub-section" style={{ color: "var(--danger)" }}>
            <AlertTriangle size={11} style={{ display: "inline", marginRight: "4px", verticalAlign: "-1px" }} />
            Vulnerabilities
            <span style={{ marginLeft: "4px" }}><Tooltip text="Known CVE (Common Vulnerabilities and Exposures) detected on this IP. Click a CVE to view details on the National Vulnerability Database." help /></span>
          </div>
          <div className="px-4 py-2 flex flex-wrap gap-1.5">
            {shodan.vulns.map((cve, i) => (
              <a
                key={cve}
                href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                target="_blank"
                rel="noopener noreferrer"
                className="badge badge-fail"
                style={{ fontSize: "11px", fontFamily: "var(--font-mono)", textDecoration: "none", cursor: "pointer" }}
                title={`View ${cve} on NVD`}
              >
                {cve}
              </a>
            ))}
          </div>
        </>
      )}

      {/* CPEs */}
      {hasCpes && (
        <>
          <div className="sub-section flex items-center gap-1.5">
            CPE Identifiers
            <Tooltip text="Common Platform Enumeration — standardized identifiers for software and hardware detected on this IP. Used for vulnerability matching." help />
          </div>
          <div className="px-4 py-2 space-y-1">
            {shodan.cpes.slice(0, 10).map((cpe, i) => (
              <div key={cpe} style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)", wordBreak: "break-all" }}>
                {cpe}
              </div>
            ))}
            {shodan.cpes.length > 10 && (
              <div style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>+{shodan.cpes.length - 10} more</div>
            )}
          </div>
        </>
      )}

      {/* Tags */}
      {hasTags && (
        <>
          <div className="sub-section">Tags</div>
          <div className="px-4 py-2 flex flex-wrap gap-1.5">
            {shodan.tags.map((tag, i) => (
              <span key={vuln} className="badge badge-neutral" style={{ fontSize: "11px" }}>
                <Tag size={9} style={{ marginRight: "3px" }} />{tag}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Co-hosted Domains (was "Hostnames") */}
      {shodan.hostnames.length > 0 && (
        <>
          <div className="sub-section flex items-center gap-1.5">
            Co-hosted Domains
            <Tooltip text="Other domains hosted on the same IP address, as detected by Shodan's network scanning. This is common on shared hosting." help />
          </div>
          <div className="px-4 py-2 flex flex-wrap gap-1.5">
            {shodan.hostnames.slice(0, 5).map((h, i) => (
              <span key={tag} className="badge badge-info" style={{ fontSize: "10px" }}>
                <Server size={9} style={{ marginRight: "3px" }} />{h}
              </span>
            ))}
            {shodan.hostnames.length > 5 && (
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>+{shodan.hostnames.length - 5} more</span>
            )}
          </div>
        </>
      )}

      {!hasPorts && !hasVulns && !hasCpes && !hasTags && (
        <div className="p-4">
          <StatusBadge status="neutral" label="No data found in Shodan InternetDB" />
        </div>
      )}
    </Panel>
  );
}
