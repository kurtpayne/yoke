import { AlertTriangle, Calendar, FileText } from "lucide-react";
import type { AnalysisResult } from "../utils/types";
import { CliButton, whoisCliCommands } from "./CliModal";
import { DataRow, ErrorState, Panel, StatusBadge } from "./Panel";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export function WhoisPanel({ data }: { data: AnalysisResult }) {
  const rdap = data.rdap;
  if (!rdap)
    return (
      <Panel title="WHOIS / RDAP" icon={<FileText size={14} />}>
        <ErrorState message="RDAP lookup failed — registration data unavailable" />
      </Panel>
    );

  const expiryBadge =
    rdap.days_until_expiry != null ? (
      rdap.days_until_expiry < 30 ? (
        <StatusBadge status="fail" label={`Expires in ${rdap.days_until_expiry}d`} />
      ) : rdap.days_until_expiry < 90 ? (
        <StatusBadge status="warn" label={`Expires in ${rdap.days_until_expiry}d`} />
      ) : (
        <StatusBadge status="pass" label={`Expires in ${rdap.days_until_expiry}d`} />
      )
    ) : undefined;

  return (
    <Panel
      title="WHOIS / RDAP"
      icon={<FileText size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          <CliButton commands={whoisCliCommands(data.domain)} domain={data.domain} />
          {expiryBadge}
        </div>
      }
    >
      <DataRow label="Registrar" value={rdap.registrar ?? "Unknown"} />
      <DataRow label="Registered" value={formatDate(rdap.registration_date)} />
      <DataRow label="Expires" value={formatDate(rdap.expiration_date)} />
      <DataRow label="Last Changed" value={formatDate(rdap.last_changed)} />
      {rdap.domain_age_days != null && (
        <DataRow
          label="Domain Age"
          value={
            rdap.domain_age_days > 365
              ? `${Math.floor(rdap.domain_age_days / 365)} years, ${Math.floor((rdap.domain_age_days % 365) / 30)} months`
              : `${rdap.domain_age_days} days`
          }
        />
      )}
      {rdap.nameservers.length > 0 && (
        <div>
          <div className="sub-section">Nameservers</div>
          {rdap.nameservers.map((ns, i) => (
            <DataRow key={ns} label={`NS ${i + 1}`} value={ns} />
          ))}
        </div>
      )}
      {rdap.status.length > 0 && (
        <div className="px-4 py-2.5 flex flex-wrap gap-1.5" style={{ borderTop: "1px solid var(--border-muted)" }}>
          {rdap.status.map((s, _i) => (
            <span key={s} className="badge badge-neutral" style={{ fontSize: "10px" }}>
              {s}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function DomainExpiryPanel({ data }: { data: AnalysisResult }) {
  const rdap = data.rdap;
  if (!rdap?.days_until_expiry) return null;

  const days = rdap.days_until_expiry;
  const color =
    days < 7 ? "var(--danger)" : days < 30 ? "var(--danger)" : days < 90 ? "var(--warning)" : "var(--success)";
  const label = days < 7 ? "CRITICAL" : days < 30 ? "EXPIRING SOON" : days < 90 ? "RENEW SOON" : "HEALTHY";
  const icon = days < 30 ? <AlertTriangle size={14} /> : <Calendar size={14} />;

  return (
    <Panel title="Domain Expiry" icon={icon}>
      <div className="flex items-center gap-4 p-4">
        <div
          className="flex flex-col items-center justify-center rounded-lg p-3"
          style={{ background: `color-mix(in srgb, ${color} 10%, transparent)`, minWidth: "80px" }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700, color, lineHeight: 1 }}>
            {days}
          </span>
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "10px",
              color: "var(--dim)",
              marginTop: "4px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            days left
          </span>
        </div>
        <div className="flex-1">
          <span
            className={`badge badge-${days < 30 ? "fail" : days < 90 ? "warn" : "pass"}`}
            style={{ marginBottom: "6px" }}
          >
            {label}
          </span>
          <p
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "12px",
              color: "var(--dim)",
              marginTop: "6px",
              lineHeight: "18px",
            }}
          >
            {rdap.expiration_date ? `Expires ${formatDate(rdap.expiration_date)}` : "Expiration date unknown"}
            {rdap.registrar ? ` · ${rdap.registrar}` : ""}
          </p>
        </div>
      </div>
    </Panel>
  );
}
