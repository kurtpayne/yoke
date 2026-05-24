import { ShieldAlert, ShieldCheck, ExternalLink, AlertTriangle } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { Panel } from "./Panel";
import type { AnalysisResult, BreachItem } from "../utils/types";

function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

// Color-code data classes by severity
const severeClasses = new Set([
  "Passwords", "Password hints", "Credit cards", "Bank account numbers",
  "Social security numbers", "Government issued IDs", "Passport numbers",
  "Credit card CVV", "PINs", "Security questions and answers",
  "Partial credit card data",
]);
const moderateClasses = new Set([
  "Email addresses", "Phone numbers", "Dates of birth", "Physical addresses",
  "IP addresses", "Genders", "Employers", "Job titles",
  "Income levels", "Family members' names", "Nationalities",
]);

function classColor(cls: string): string {
  if (severeClasses.has(cls)) return "var(--danger)";
  if (moderateClasses.has(cls)) return "var(--warning)";
  return "var(--dim)";
}

function classBg(cls: string): string {
  if (severeClasses.has(cls)) return "var(--danger-subtle)";
  if (moderateClasses.has(cls)) return "var(--warning-subtle)";
  return "var(--surface-2)";
}

function BreachCard({ breach }: { breach: BreachItem }) {
  const hibpUrl = `https://haveibeenpwned.com/PwnedWebsites#${breach.name}`;

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--danger-subtle)",
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {breach.logo_url && (
            <img
              src={breach.logo_url}
              alt=""
              style={{ width: 24, height: 24, borderRadius: 4, objectFit: "contain", background: "#fff" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
              {breach.title}
            </div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)" }}>
              {formatDate(breach.breach_date)} · {formatCount(breach.pwn_count)} accounts
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {breach.is_verified && (
            <span className="badge badge-fail" style={{ fontSize: "9px" }}>Verified</span>
          )}
          {breach.is_fabricated && (
            <span className="badge badge-warn" style={{ fontSize: "9px" }}>Fabricated</span>
          )}
          {breach.is_sensitive && (
            <span className="badge badge-warn" style={{ fontSize: "9px" }}>Sensitive</span>
          )}
          <a
            href={hibpUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)", opacity: 0.7 }}
            title="View on Have I Been Pwned"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Data classes exposed */}
      <div className="flex flex-wrap gap-1">
        {breach.data_classes.map((cls, i) => (
          <span
            key={cls}
            className="rounded px-1.5 py-0.5"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "10px",
              fontWeight: 500,
              color: classColor(cls),
              background: classBg(cls),
            }}
          >
            {cls}
          </span>
        ))}
      </div>

      {/* Description (HTML from HIBP — render safely truncated) */}
      {breach.description && (
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "11px",
            color: "var(--dim)",
            marginTop: "8px",
            lineHeight: "1.5",
            maxHeight: "60px",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {breach.description.replace(/<[^>]*>/g, '').slice(0, 300)}...
        </div>
      )}
    </div>
  );
}

export function BreachPanel({ data }: { data: AnalysisResult }) {
  const breaches = data.breaches;

  // No breach data available
  if (!breaches) return null;

  const { found, count, total_pwned, items } = breaches;

  const icon = found ? <ShieldAlert size={14} style={{ color: "var(--danger)" }} /> : <ShieldCheck size={14} style={{ color: "var(--success)" }} />;

  const badge = (
    <div className="flex items-center gap-2">
      {found ? (
        <>
          <span className="badge badge-fail">
            {count} breach{count > 1 ? "es" : ""}
          </span>
          <span className="badge badge-fail" style={{ opacity: 0.8 }}>
            {formatCount(total_pwned)} accounts
          </span>
        </>
      ) : (
        <span className="badge badge-pass">No known breaches</span>
      )}
    </div>
  );

  return (
    <Panel title="Data Breaches" icon={icon} badge={badge}>
      <div className="p-4">
        {found ? (
          <div className="space-y-2">
            {/* Summary warning */}
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 mb-3"
              style={{
                background: "var(--danger-subtle)",
                border: "1px solid rgba(248,81,73,0.2)",
              }}
            >
              <AlertTriangle size={14} style={{ color: "var(--danger)", marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--danger)", lineHeight: "1.5" }}>
                This domain has been involved in {count} known data breach{count > 1 ? "es" : ""}, exposing approximately {formatCount(total_pwned)} accounts total.
              </span>
            </div>

            {/* Individual breach cards */}
            {items.map((breach, i) => (
              <BreachCard key={breach.Name} breach={breach} />
            ))}

            {/* HIBP attribution */}
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)", textAlign: "center", marginTop: "8px" }}>
              Data from <a href="https://haveibeenpwned.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Have I Been Pwned</a>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <ShieldCheck size={24} style={{ color: "var(--success)", margin: "0 auto 8px" }} />
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "13px", color: "var(--success)", fontWeight: 500 }}>
              No known data breaches
            </div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", marginTop: "4px" }}>
              This domain does not appear in any known breach databases
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
