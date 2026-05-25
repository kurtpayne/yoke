import { useState } from "react";
import { Cookie, ShieldCheck, ShieldAlert, AlertTriangle, Check, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Panel, StatusBadge } from "./Panel";
import type { AnalysisResult, CookieInfoData } from "../utils/types";

// ─── Cookie row ──────────────────────────────────────────────────────

function CookieRow({ cookie }: { cookie: CookieInfoData }) {
  const [expanded, setExpanded] = useState(false);

  const categoryColors: Record<string, string> = {
    session: "var(--success)",
    persistent: "var(--warning)",
    "third-party": "var(--danger)",
  };

  return (
    <div style={{ borderBottom: "1px solid var(--border-muted)" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full py-1.5 px-4"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
          fontSize: "11px",
          color: "var(--text)",
        }}
      >
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 500,
          flex: 1,
          textAlign: "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}>
          {cookie.name}
        </span>
        <span style={{
          fontSize: "9px",
          fontWeight: 600,
          color: categoryColors[cookie.category] ?? "var(--dim)",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
          flexShrink: 0,
        }}>
          {cookie.category}
        </span>
        {expanded ? <ChevronDown size={10} style={{ color: "var(--dim)", flexShrink: 0 }} /> : <ChevronRight size={10} style={{ color: "var(--dim)", flexShrink: 0 }} />}
      </button>
      {expanded && (
        <div className="px-4 pb-2 flex flex-wrap gap-x-3 gap-y-1" style={{ paddingLeft: "1rem", fontSize: "10px" }}>
          <span style={{ color: "var(--dim)" }}>domain: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{cookie.domain}</span></span>
          <span style={{ color: cookie.secure ? "var(--success)" : "var(--danger)" }}>
            {cookie.secure ? "✓" : "✗"} Secure
          </span>
          <span style={{ color: cookie.httpOnly ? "var(--success)" : "var(--warning)" }}>
            {cookie.httpOnly ? "✓" : "✗"} HttpOnly
          </span>
          <span style={{ color: cookie.sameSite ? "var(--success)" : "var(--warning)" }}>
            SameSite: {cookie.sameSite ?? "none"}
          </span>
          {cookie.expires && (
            <span style={{ color: "var(--dim)" }}>expires: {cookie.expires}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Compliance flag row ─────────────────────────────────────────────

function ComplianceFlag({ flag }: { flag: string }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <AlertTriangle size={11} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", lineHeight: "16px" }}>
        {flag}
      </span>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────

export function CookieConsentPanel({ data }: { data: AnalysisResult }) {
  const cc = data.cookie_consent;

  if (!cc) {
    return (
      <Panel title="Cookie Consent" icon={<Cookie size={14} />}>
        <div className="p-4">
          <StatusBadge status="neutral" label="Not available" />
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)", marginTop: 8 }}>
            Cookie consent analysis requires a successful HTTP probe.
          </p>
        </div>
      </Panel>
    );
  }

  const hasCmp = !!cc.cmp_detected;
  const hasIssues = cc.compliance_flags.length > 0;
  const cookieCount = cc.cookies_set.length;

  return (
    <Panel
      title="Cookie Consent"
      icon={<Cookie size={14} />}
      badge={
        <div className="flex gap-1.5">
          {hasCmp ? (
            <StatusBadge status="pass" label={cc.cmp_detected!.name} />
          ) : (
            <StatusBadge status="warn" label="No CMP" />
          )}
          {cc.pre_consent_cookies > 0 && (
            <StatusBadge status="fail" label={`${cc.pre_consent_cookies} pre-consent`} />
          )}
        </div>
      }
    >
      {/* CMP detection header */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border-muted)" }}>
        {hasCmp ? (
          <ShieldCheck size={20} style={{ color: "var(--success)", flexShrink: 0 }} />
        ) : (
          <ShieldAlert size={20} style={{ color: "var(--warning)", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
            {hasCmp ? `${cc.cmp_detected!.name} detected` : "No consent platform detected"}
          </div>
          {hasCmp && (
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", marginTop: 1 }}>
              Confidence: {Math.round(cc.cmp_detected!.confidence * 100)}%
            </div>
          )}
          {!hasCmp && (
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", marginTop: 1 }}>
              Consider adding a Consent Management Platform for GDPR/CCPA compliance
            </div>
          )}
        </div>
      </div>

      {/* Quick stats row */}
      <div className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ borderBottom: "1px solid var(--border-muted)", fontSize: "11px", fontFamily: "var(--font-ui)", color: "var(--dim)" }}>
        <span>{cookieCount} cookie{cookieCount !== 1 ? "s" : ""} set</span>
        {cc.pre_consent_cookies > 0 && (
          <>
            <span style={{ color: "var(--border)" }}>|</span>
            <span style={{ color: "var(--danger)" }}>{cc.pre_consent_cookies} pre-consent tracking</span>
          </>
        )}
        {cc.has_cookie_policy && (
          <>
            <span style={{ color: "var(--border)" }}>|</span>
            <span style={{ color: "var(--success)" }}>
              <Check size={10} style={{ display: "inline", verticalAlign: "middle" }} /> Cookie policy found
            </span>
          </>
        )}
        {cc.p3p_present && (
          <>
            <span style={{ color: "var(--border)" }}>|</span>
            <span>P3P header (legacy)</span>
          </>
        )}
      </div>

      {/* Compliance flags */}
      {hasIssues && (
        <div className="px-4 py-2" style={{ borderBottom: "1px solid var(--border-muted)", background: "rgba(248, 81, 73, 0.04)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <ShieldAlert size={11} style={{ color: "var(--danger)" }} />
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", fontWeight: 600, color: "var(--danger)" }}>
              Compliance Flags
            </span>
          </div>
          {cc.compliance_flags.map((flag, i) => (
            <ComplianceFlag key={i} flag={flag} />
          ))}
        </div>
      )}

      {/* Cookie list */}
      {cookieCount > 0 && (
        <>
          <div className="px-4 py-1.5" style={{ borderBottom: "1px solid var(--border-muted)" }}>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Cookies Set ({cookieCount})
            </span>
          </div>
          {cc.cookies_set.map((cookie, i) => (
            <CookieRow key={`${cookie.name}-${i}`} cookie={cookie} />
          ))}
        </>
      )}

      {/* No cookies */}
      {cookieCount === 0 && !hasIssues && (
        <div className="p-4">
          <div className="flex items-center gap-2">
            <Check size={14} style={{ color: "var(--success)" }} />
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--text)" }}>
              No cookies set in the initial response
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}
