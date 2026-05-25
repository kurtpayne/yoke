import { Activity, Clock, Globe, Lock, Server, Wifi, Zap, Hash } from "lucide-react";
import { Tooltip } from "./Tooltip";
import type { AnalysisResult } from "../utils/types";

const STATUS_TOOLTIPS: Record<string, string> = {
  UP: "Site responded with a successful HTTP status code (2xx/3xx)",
  RESTRICTED: "DNS resolves and SSL is valid, but our automated probe received a non-success response. The site is likely up but blocks bot requests.",
  DOWN: "DNS resolution failed or the server refused connections on ports 80 and 443",
  "NOT REGISTERED": "This domain does not exist — DNS returned NXDOMAIN (no such domain)",
};

export function VitalsStrip({ data }: { data: AnalysisResult }) {
  const hasStatus = data.status != null;
  const isUp = data.status?.is_up ?? false;
  const statusLabel = data.status?.status_label ?? (isUp ? "UP" : "DOWN");
  const isNotRegistered = data.not_registered === true || statusLabel === "NOT REGISTERED";
  const isRestricted = statusLabel === "RESTRICTED";
  const httpBlocked = data.http_probe_blocked === true;
  const responseTime = data.status?.response_time_ms;
  const ip = data.ip_info?.ip;
  const sslGrade = data.ssl?.grade;
  const domainAge = data.rdap?.domain_age_days;
  const secGrade = data.headers?.security_grade;
  const trancoRank = data.tranco_rank;
  const h3 = data.http_protocols?.http3;

  // Status color and label
  const statusColor = isNotRegistered ? "var(--dim)" : isRestricted ? "var(--warning)" : isUp ? "var(--success)" : "var(--danger)";
  const statusText = isNotRegistered ? "NOT REGISTERED" : isRestricted ? "RESTRICTED" : isUp ? "UP" : "DOWN";

  const statusTooltip = STATUS_TOOLTIPS[statusText] ?? "";
  const statusCodeNote = data.status?.status_code ? ` (HTTP ${data.status.status_code})` : "";

  return (
    <div className="flex flex-wrap gap-2 px-1">
      {hasStatus && (
      <Tooltip text={statusTooltip + statusCodeNote}>
        <div className="vital-pill" style={{ cursor: "help" }}>
          <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: statusColor }} />
          <span style={{ color: statusColor, fontWeight: 600 }}>{statusText}</span>
        </div>
      </Tooltip>
      )}

      {httpBlocked && !isNotRegistered && (
        <Tooltip text="Our automated HTTP probe was blocked by this site's bot protection. Data shown is based on DNS, SSL, and other non-HTTP sources. The site itself is accessible to regular browsers.">
          <div className="vital-pill" style={{ cursor: "help" }}>
            <span style={{ color: "var(--warning)", fontSize: "0.7rem" }}>⚠ HTTP probe blocked</span>
          </div>
        </Tooltip>
      )}

      {responseTime != null && (
        <Tooltip text={`Time to first byte from our probe server. Under 300ms is fast, 300-1000ms is average, over 1000ms is slow.`}>
          <div className="vital-pill" style={{ cursor: "help" }}>
            <Activity size={12} style={{ color: "var(--dim)" }} />
            <span style={{ color: responseTime < 500 ? "var(--success)" : responseTime < 2000 ? "var(--warning)" : "var(--danger)" }}>
              {responseTime}ms
            </span>
          </div>
        </Tooltip>
      )}

      {ip && (
        <Tooltip text="Primary IPv4 address this domain resolves to">
          <div className="vital-pill" style={{ cursor: "help" }}>
            <Server size={12} style={{ color: "var(--dim)" }} />
            <span style={{ color: "var(--text-secondary)" }}>{ip}</span>
          </div>
        </Tooltip>
      )}

      {sslGrade && (
        <Tooltip text={`SSL/TLS certificate grade from Qualys SSL Labs. A+ is the highest rating (strong config + HSTS). B or below indicates legacy cipher suites or configuration weaknesses.`}>
          <div className="vital-pill" style={{ cursor: "help" }}>
            <Lock size={12} style={{ color: "var(--dim)" }} />
            <span style={{ color: sslGrade.startsWith("A") ? "var(--success)" : sslGrade.startsWith("B") ? "#7ee787" : sslGrade.startsWith("C") ? "var(--warning)" : "var(--danger)" }}>
              SSL {sslGrade}
            </span>
          </div>
        </Tooltip>
      )}

      {secGrade && secGrade !== "N/A" && (
        <Tooltip text="Security headers grade based on the presence of protective HTTP headers like CSP, HSTS, X-Frame-Options, and others. A means most headers are present; lower grades indicate missing protections.">
          <div className="vital-pill" style={{ cursor: "help" }}>
            <Wifi size={12} style={{ color: "var(--dim)" }} />
            <span style={{ color: secGrade === "A" ? "var(--success)" : secGrade === "B" ? "#7ee787" : secGrade === "C" ? "var(--warning)" : "var(--danger)" }}>
              HDR {secGrade}
            </span>
          </div>
        </Tooltip>
      )}

      {trancoRank != null && (
        <Tooltip text="Tranco ranking — a research-grade list of the top 1 million websites by traffic, combining data from multiple sources. Lower number = more traffic.">
          <div className="vital-pill" style={{ cursor: "help" }}>
            <Hash size={12} style={{ color: "var(--dim)" }} />
            <span style={{ color: "var(--accent)" }}>#{trancoRank.toLocaleString()}</span>
          </div>
        </Tooltip>
      )}

      {domainAge != null && (
        <Tooltip text="How long ago this domain was first registered, based on WHOIS/RDAP data. Older domains generally have more established reputations.">
          <div className="vital-pill" style={{ cursor: "help" }}>
            <Clock size={12} style={{ color: "var(--dim)" }} />
            <span style={{ color: "var(--text-secondary)" }}>
              {domainAge > 365 ? `${Math.floor(domainAge / 365)}y ${Math.floor((domainAge % 365) / 30)}m` : `${domainAge}d`}
            </span>
          </div>
        </Tooltip>
      )}

      {data.ip_info?.isp && (
        <Tooltip text="Internet Service Provider or hosting organization that owns the IP address block this domain resolves to">
          <div className="vital-pill" style={{ cursor: "help" }}>
            <Globe size={12} style={{ color: "var(--dim)" }} />
            <span style={{ color: "var(--dim)" }}>{data.ip_info.isp}</span>
          </div>
        </Tooltip>
      )}

      {h3 && (
        <Tooltip text="This site supports HTTP/3 (QUIC), the latest HTTP protocol offering faster connections and improved performance on unreliable networks.">
          <div className="vital-pill" style={{ cursor: "help" }}>
            <Zap size={12} style={{ color: "var(--dim)" }} />
            <span style={{ color: "var(--success)" }}>HTTP/3</span>
          </div>
        </Tooltip>
      )}
    </div>
  );
}
