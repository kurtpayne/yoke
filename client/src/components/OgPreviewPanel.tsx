import { Share2, Image, AlertCircle, CheckCircle } from "lucide-react";
import { Panel, DataRow, StatusBadge } from "./Panel";
import type { AnalysisResult } from "../utils/types";

export function OgPreviewPanel({ data }: { data: AnalysisResult }) {
  const sm = data.social_meta;
  if (!sm) return null;

  const og = sm.og;
  const twitter = sm.twitter;
  const title = og.title || twitter.title || data.domain;
  const desc = og.description || twitter.description || "";
  const img = og.image || twitter.image;

  return (
    <Panel
      title="Social Share Preview"
      icon={<Share2 size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          <StatusBadge status={sm.score >= 80 ? "pass" : sm.score >= 50 ? "warn" : "fail"} label={`${sm.score}%`} />
        </div>
      }
    >
      {/* Facebook-style preview */}
      <div className="sub-section">Facebook / LinkedIn Preview</div>
      <div className="px-4 py-3">
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-muted)", maxWidth: "400px" }}>
          {img ? (
            <div style={{ height: "200px", overflow: "hidden", background: "var(--surface-raised)" }}>
              <img
                src={img}
                alt="OG Preview"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div style={{ height: "60px", background: "var(--surface-raised)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Image size={20} style={{ color: "var(--dim)", opacity: 0.3 }} />
            </div>
          )}
          <div className="p-3" style={{ background: "var(--surface-raised)" }}>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)", textTransform: "uppercase", marginBottom: "4px" }}>
              {og.site_name || data.domain}
            </div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "13px", color: "var(--text)", fontWeight: 600, lineHeight: "18px", marginBottom: "4px" }}>
              {title}
            </div>
            {desc && (
              <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", lineHeight: "16px" }}>
                {desc.length > 120 ? desc.slice(0, 120) + "…" : desc}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Twitter-style preview */}
      <div className="sub-section">Twitter / X Preview</div>
      <div className="px-4 py-3">
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-muted)", maxWidth: "400px" }}>
          {img && twitter.card !== "summary" ? (
            <div style={{ height: "180px", overflow: "hidden", background: "var(--surface-raised)" }}>
              <img
                src={img}
                alt="Twitter Preview"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}
          <div className="p-3" style={{ background: "var(--surface-raised)" }}>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "13px", color: "var(--text)", fontWeight: 500, lineHeight: "18px" }}>
              {twitter.title || title}
            </div>
            {(twitter.description || desc) && (
              <div style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)", lineHeight: "16px", marginTop: "2px" }}>
                {(twitter.description || desc).slice(0, 100)}
              </div>
            )}
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", marginTop: "4px" }}>
              🔗 {data.domain}
            </div>
          </div>
        </div>
      </div>

      {/* Tag details */}
      <div className="sub-section">Tag Audit</div>
      <DataRow label="og:type" value={og.type || <StatusBadge status="warn" label="Missing" />} />
      <DataRow label="og:url" value={og.url ? <span style={{ fontSize: "10px", wordBreak: "break-all" }}>{og.url}</span> : <StatusBadge status="warn" label="Missing" />} />
      <DataRow label="og:locale" value={og.locale || <StatusBadge status="neutral" label="Not set" />} />
      <DataRow label="og:site_name" value={og.site_name || <StatusBadge status="warn" label="Missing" />} />
      <DataRow label="twitter:card" value={twitter.card || <StatusBadge status="warn" label="Missing" />} />
      <DataRow label="twitter:site" value={twitter.site || <StatusBadge status="neutral" label="Not set" />} />
      <DataRow label="twitter:creator" value={twitter.creator || <StatusBadge status="neutral" label="Not set" />} />

      {/* Missing tags */}
      {sm.missing.length > 0 && (
        <>
          <div className="sub-section" style={{ color: "var(--warning)" }}>Missing Tags</div>
          <div className="px-4 py-2 flex flex-wrap gap-1.5">
            {sm.missing.map((tag, i) => (
              <span key={item} className="badge badge-warn" style={{ fontSize: "11px" }}>
                <AlertCircle size={9} style={{ marginRight: "3px" }} />{tag}
              </span>
            ))}
          </div>
        </>
      )}

      {sm.missing.length === 0 && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={14} style={{ color: "var(--success)" }} />
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--success)" }}>All essential social meta tags present</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
