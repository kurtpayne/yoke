import { Database, Clock, Globe, RefreshCw, AlertTriangle } from "lucide-react";
import { Panel, DataRow, StatusBadge } from "./Panel";
import { Tooltip } from "./Tooltip";
import type { AnalysisResult } from "../utils/types";

const DIRECTIVE_STYLES: Record<string, { color: "pass" | "warn" | "fail" | "info"; tooltip: string }> = {
  "public": { color: "pass", tooltip: "Response can be cached by browsers and CDNs" },
  "private": { color: "warn", tooltip: "Response can be cached by browsers but not shared CDN caches" },
  "immutable": { color: "pass", tooltip: "Response body will not change — browser can skip revalidation" },
  "no-store": { color: "fail", tooltip: "Response must not be stored in any cache" },
  "no-cache": { color: "warn", tooltip: "Cache must revalidate with the server before using a stored response" },
  "must-revalidate": { color: "info", tooltip: "Stale responses must not be used without revalidation" },
  "stale-while-revalidate": { color: "pass", tooltip: "Serve stale content while asynchronously revalidating in the background" },
  "no-transform": { color: "info", tooltip: "Intermediaries must not modify the response body" },
};

const VERDICT_COLORS: Record<string, "pass" | "warn" | "fail" | "neutral" | "info"> = {
  excellent: "pass",
  good: "pass",
  fair: "warn",
  poor: "fail",
  none: "neutral",
};

const CDN_STATUS_COLORS: Record<string, "pass" | "warn" | "fail" | "info"> = {
  HIT: "pass",
  MISS: "warn",
  DYNAMIC: "info",
  BYPASS: "fail",
  EXPIRED: "warn",
  STALE: "warn",
  REVALIDATED: "pass",
  UPDATING: "info",
};

export function CachePanel({ data }: { data: AnalysisResult }) {
  const cache = data.cache_analysis;
  if (!cache) return null;

  const directives = cache.cache_control.directives;
  const directiveKeys = Object.keys(directives);

  return (
    <Panel
      title="Cache Headers"
      icon={<Database size={14} />}
      badge={
        <StatusBadge
          status={VERDICT_COLORS[cache.verdict] ?? "neutral"}
          label={cache.verdict.charAt(0).toUpperCase() + cache.verdict.slice(1)}
        />
      }
    >
      {/* TTL */}
      {cache.cache_control.ttl_human && (
        <DataRow
          label={
            <span className="flex items-center gap-1">
              <Clock size={11} style={{ color: "var(--muted)" }} />
              Effective TTL
            </span>
          }
          value={
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>
              {cache.cache_control.ttl_human}
            </span>
          }
        />
      )}

      {/* Cache-Control directives */}
      {directiveKeys.length > 0 && (
        <DataRow
          label="Cache-Control"
          value={
            <div className="flex flex-wrap gap-1 justify-end">
              {directiveKeys.map((key) => {
                const style = DIRECTIVE_STYLES[key];
                const val = directives[key];
                const label = val === true ? key : `${key}=${val}`;
                return (
                  <Tooltip key={key} text={style?.tooltip ?? `Directive: ${key}`}>
                    <span
                      className={`badge badge-${style?.color ?? "info"}`}
                      style={{ fontSize: "9px", cursor: "help" }}
                    >
                      {label}
                    </span>
                  </Tooltip>
                );
              })}
            </div>
          }
        />
      )}

      {/* CDN Cache */}
      {(cache.cdn_cache.status || cache.cdn_cache.provider) && (
        <DataRow
          label={
            <span className="flex items-center gap-1">
              <Globe size={11} style={{ color: "var(--muted)" }} />
              CDN Cache
            </span>
          }
          value={
            <div className="flex items-center gap-1.5">
              {cache.cdn_cache.provider && (
                <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--muted)" }}>
                  {cache.cdn_cache.provider}
                </span>
              )}
              {cache.cdn_cache.status && (
                <StatusBadge
                  status={CDN_STATUS_COLORS[cache.cdn_cache.status] ?? "info"}
                  label={cache.cdn_cache.status}
                />
              )}
              {cache.cdn_cache.age_seconds !== null && (
                <Tooltip text={`Response has been in the CDN cache for ${cache.cdn_cache.age_seconds}s`}>
                  <span className="badge badge-info" style={{ fontSize: "9px", cursor: "help" }}>
                    age: {cache.cdn_cache.age_seconds}s
                  </span>
                </Tooltip>
              )}
            </div>
          }
        />
      )}

      {/* Conditional request support */}
      <DataRow
        label={
          <span className="flex items-center gap-1">
            <RefreshCw size={11} style={{ color: "var(--muted)" }} />
            Conditional Requests
          </span>
        }
        value={
          <div className="flex items-center gap-1.5">
            <Tooltip text="ETag allows efficient revalidation — server returns 304 Not Modified if content hasn't changed">
              <span className={`badge badge-${cache.conditional.etag ? "pass" : "neutral"}`} style={{ fontSize: "9px", cursor: "help" }}>
                ETag {cache.conditional.etag ? "✓" : "✗"}
              </span>
            </Tooltip>
            <Tooltip text="Last-Modified enables date-based revalidation via If-Modified-Since">
              <span className={`badge badge-${cache.conditional.last_modified ? "pass" : "neutral"}`} style={{ fontSize: "9px", cursor: "help" }}>
                Last-Modified {cache.conditional.last_modified ? "✓" : "✗"}
              </span>
            </Tooltip>
          </div>
        }
      />

      {/* Vary */}
      {cache.conditional.varies_on.length > 0 && (
        <DataRow
          label="Vary"
          value={
            <div className="flex flex-wrap gap-1 justify-end">
              {cache.conditional.varies_on.map((v) => (
                <Tooltip key={v} text={v === "*" ? "Vary: * effectively disables caching" : `Cache varies on the ${v} request header`}>
                  <span className={`badge badge-${v === "*" ? "fail" : "info"}`} style={{ fontSize: "9px", cursor: "help" }}>
                    {v}
                  </span>
                </Tooltip>
              ))}
            </div>
          }
        />
      )}

      {/* Verdict */}
      <div className="px-4 py-2" style={{ borderTop: "1px solid var(--border-muted)" }}>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--text-secondary)", lineHeight: "16px", margin: 0 }}>
          {cache.verdict_label}
        </p>
      </div>

      {/* Issues */}
      {cache.issues.length > 0 && (
        <div className="px-4 py-2" style={{ borderTop: "1px solid var(--border-muted)" }}>
          {cache.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-1.5" style={{ marginBottom: i < cache.issues.length - 1 ? "4px" : 0 }}>
              <AlertTriangle size={10} style={{ color: "var(--warning)", marginTop: "3px", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", lineHeight: "16px" }}>
                {issue}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
