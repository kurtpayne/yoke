import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Globe, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import type { ResolvedSubdomain, SubdomainScanResult } from "../utils/types";
import { CliButton, subdomainCliCommands } from "./CliModal";
import { Panel } from "./Panel";

const CATEGORY_ICONS: Record<string, string> = {
  "Web & App": "🌐",
  "API & Services": "⚡",
  "Mail & Communication": "📧",
  "Development & Staging": "🔧",
  "Infrastructure & CDN": "🏗️",
  "Admin & Internal": "🔒",
  "Monitoring & Ops": "📊",
  Commerce: "🛒",
  "Documentation & Support": "📚",
  "Marketing & Analytics": "📈",
  Security: "🛡️",
  "Cloud & DNS": "☁️",
};

// Category order for display
const CATEGORY_ORDER = [
  "Web & App",
  "API & Services",
  "Mail & Communication",
  "Commerce",
  "Development & Staging",
  "Infrastructure & CDN",
  "Admin & Internal",
  "Monitoring & Ops",
  "Documentation & Support",
  "Marketing & Analytics",
  "Security",
  "Cloud & DNS",
];

function CategoryGroup({ category, subdomains }: { category: string; subdomains: ResolvedSubdomain[] }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full py-1.5 px-2 rounded-md"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--accent)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>
          {CATEGORY_ICONS[category] || "📁"} {category}
        </span>
        <span className="badge badge-info" style={{ fontSize: "9px", padding: "1px 6px" }}>
          {subdomains.length}
        </span>
      </button>

      {expanded && (
        <div className="ml-2">
          {subdomains.map((sub) => (
            <div
              key={sub.hostname}
              className="flex items-center gap-2 py-1 px-3"
              style={{
                borderBottom: "1px solid var(--border-muted)",
                fontSize: "12px",
                minWidth: 0,
              }}
            >
              <Globe size={11} style={{ color: "var(--dim)", flexShrink: 0 }} />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--text)",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {sub.hostname}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--dim)", flexShrink: 0 }}>
                {sub.ips.slice(0, 2).join(", ")}
                {sub.ips.length > 2 && ` +${sub.ips.length - 2}`}
              </span>
              {sub.sameAsApex && (
                <span
                  className="badge badge-neutral"
                  style={{ fontSize: "9px", padding: "1px 5px" }}
                  title="Points to same IP as apex domain"
                >
                  apex
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SubdomainScanPanel({ domain }: { domain: string }) {
  const scan = useMutation({
    mutationFn: () => api.scanSubdomains({ domain }),
  });

  const data = scan.data as SubdomainScanResult | undefined;

  return (
    <Panel
      title="Subdomain Scan"
      icon={<Search size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          <CliButton commands={subdomainCliCommands(domain)} domain={domain} />
          {data ? (
            <span className="badge badge-info" style={{ fontSize: "10px" }}>
              {data.total_found} found
            </span>
          ) : null}
        </div>
      }
    >
      {!data && !scan.isPending && (
        <div className="p-4 flex flex-col items-center gap-3">
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)", textAlign: "center" }}>
            Probes ~150 common subdomain prefixes via DNS resolution.
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
            Scan Subdomains
          </button>
        </div>
      )}

      {scan.isPending && (
        <div className="p-4 flex flex-col items-center gap-2">
          <Loader2 size={18} className="animate-spin" style={{ color: "var(--accent)" }} />
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)" }}>Scanning subdomains…</p>
        </div>
      )}

      {scan.error && (
        <div className="p-4">
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--danger)" }}>
            Scan failed: {String(scan.error)}
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
          {/* Summary bar */}
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 mb-2"
            style={{ fontSize: "11px", fontFamily: "var(--font-ui)", color: "var(--dim)" }}
          >
            <span>
              <strong style={{ color: "var(--text)" }}>{data.total_found}</strong> subdomains found
            </span>
            <span style={{ color: "var(--border)" }}>|</span>
            <span>{data.total_scanned} prefixes scanned</span>
            {data.apex_ips.length > 0 && (
              <>
                <span style={{ color: "var(--border)" }}>|</span>
                <span>Apex: {data.apex_ips.slice(0, 2).join(", ")}</span>
              </>
            )}
            {data.cached && (
              <span className="badge badge-neutral" style={{ fontSize: "9px", padding: "1px 5px" }}>
                cached
              </span>
            )}
          </div>

          {/* Categories */}
          {data.total_found === 0 ? (
            <div
              className="px-2 py-3"
              style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)", textAlign: "center" }}
            >
              No subdomains found from the scanned prefixes.
            </div>
          ) : (
            <div className="space-y-1">
              {CATEGORY_ORDER.filter((cat) => data.categories[cat]?.length > 0).map((cat) => (
                <CategoryGroup key={cat} category={cat} subdomains={data.categories[cat]} />
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
