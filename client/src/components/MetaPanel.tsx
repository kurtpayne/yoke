import { Bot, FileSearch, Info } from "lucide-react";
import type { AnalysisResult } from "../utils/types";
import { CliButton, robotsCliCommands } from "./CliModal";
import { DataRow, ErrorState, Panel, StatusBadge } from "./Panel";

export function MetaPanel({ data }: { data: AnalysisResult }) {
  const meta = data.meta;
  if (!meta)
    return (
      <Panel title="Site Meta" icon={<Info size={14} />}>
        <ErrorState message="Meta information unavailable" />
      </Panel>
    );

  return (
    <Panel title="Site Meta" icon={<Info size={14} />}>
      {(meta.og_title || meta.og_description) && (
        <div>
          <div className="sub-section">Open Graph</div>
          {meta.og_title && <DataRow label="Title" value={meta.og_title} mono={false} />}
          {meta.og_description && (
            <DataRow
              label="Description"
              value={
                <span style={{ fontSize: "11px" }}>
                  {meta.og_description.length > 80 ? `${meta.og_description.slice(0, 80)}…` : meta.og_description}
                </span>
              }
              mono={false}
              copyValue={meta.og_description}
            />
          )}
          {meta.og_image && (
            <DataRow
              label="Image"
              value={<span style={{ fontSize: "10px", wordBreak: "break-all" }}>{meta.og_image}</span>}
              copyValue={meta.og_image}
            />
          )}
        </div>
      )}
      <DataRow
        label="Favicon"
        value={
          meta.favicon_url ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <img
                src={meta.favicon_url}
                alt="favicon"
                style={{ width: 16, height: 16, imageRendering: "pixelated" }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <span style={{ fontSize: "10px", wordBreak: "break-all" }}>
                {meta.favicon_url.length > 60 ? `${meta.favicon_url.slice(0, 60)}…` : meta.favicon_url}
              </span>
            </span>
          ) : (
            <StatusBadge status="warn" label="NOT FOUND" />
          )
        }
        copyValue={meta.favicon_url || undefined}
      />
      <DataRow
        label="robots.txt"
        value={
          meta.robots_txt_exists ? (
            <StatusBadge status="pass" label="PRESENT" />
          ) : (
            <StatusBadge status="warn" label="MISSING" />
          )
        }
      />
      <DataRow
        label="Sitemap"
        value={
          meta.sitemap_detected ? (
            <div className="flex items-center gap-2">
              <StatusBadge status="pass" label="FOUND" />
              {meta.sitemap_page_count != null && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--dim)" }}>
                  {meta.sitemap_page_count} entries
                </span>
              )}
            </div>
          ) : (
            <StatusBadge status="warn" label="NOT FOUND" />
          )
        }
      />
    </Panel>
  );
}

export function RobotsDeepPanel({ data }: { data: AnalysisResult }) {
  const parsed = data.robots_parsed;
  if (!parsed) return null;
  if (parsed.is_missing)
    return (
      <Panel title="robots.txt Analysis" icon={<FileSearch size={14} />}>
        <div className="p-4">
          <StatusBadge status="warn" label="robots.txt not found" />
          <p
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "12px",
              color: "var(--dim)",
              marginTop: "8px",
              lineHeight: "18px",
            }}
          >
            No robots.txt file was found. Search engines will crawl all accessible pages by default.
          </p>
        </div>
      </Panel>
    );

  return (
    <Panel
      title="robots.txt Analysis"
      icon={<FileSearch size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          <CliButton commands={robotsCliCommands(data.domain)} domain={data.domain} />
          {parsed.is_restrictive ? (
            <StatusBadge status="warn" label="RESTRICTIVE" />
          ) : (
            <StatusBadge status="pass" label="STANDARD" />
          )}
        </div>
      }
    >
      {parsed.blocks.length > 0 && (
        <div>
          {parsed.blocks.slice(0, 5).map((block, i) => (
            <div key={`meta-${i}`}>
              <div className="sub-section" style={{ fontSize: "10px" }}>
                User-Agent: {block.user_agent}
              </div>
              {block.disallow.slice(0, 8).map((path, j) => (
                <DataRow
                  key={`disallow-${j}`}
                  label={
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--danger)" }}>
                      Disallow
                    </span>
                  }
                  value={
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text)" }}>
                      {path}
                    </span>
                  }
                  copyValue={path}
                />
              ))}
              {block.disallow.length > 8 && (
                <div className="px-4 py-1" style={{ fontSize: "10px", color: "var(--dim)" }}>
                  +{block.disallow.length - 8} more rules
                </div>
              )}
              {block.allow.slice(0, 4).map((path, j) => (
                <DataRow
                  key={`allow-${j}`}
                  label={
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--success)" }}>
                      Allow
                    </span>
                  }
                  value={
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text)" }}>
                      {path}
                    </span>
                  }
                  copyValue={path}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {parsed.crawl_delay != null && <DataRow label="Crawl Delay" value={`${parsed.crawl_delay}s`} />}

      {parsed.sitemaps.length > 0 && (
        <div>
          <div className="sub-section">Referenced Sitemaps</div>
          {parsed.sitemaps.map((url, i) => (
            <DataRow
              key={`sitemap-${i}`}
              label={<span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--dim)" }}>URL</span>}
              value={
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--text)",
                    wordBreak: "break-all",
                  }}
                >
                  {url}
                </span>
              }
              copyValue={url}
            />
          ))}
        </div>
      )}

      {parsed.interesting_blocked.length > 0 && (
        <div>
          <div className="sub-section" style={{ color: "var(--warning)" }}>
            Interesting Blocked Paths
          </div>
          {parsed.interesting_blocked.map((path, i) => (
            <DataRow
              key={`blocked-${i}`}
              label={
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--warning)" }}>
                  Blocked
                </span>
              }
              value={
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--warning)" }}>
                  {path}
                </span>
              }
              copyValue={path}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

export function LlmsTxtPanel({ data }: { data: AnalysisResult }) {
  const llms = data.llms_txt;
  if (!llms) return null;

  if (!llms.found && !llms.full_found) {
    return (
      <Panel title="llms.txt" icon={<Bot size={14} />}>
        <div className="p-4 flex items-center gap-3">
          <StatusBadge status="neutral" label="Not found" />
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)" }}>
            This site hasn't adopted the llms.txt standard
          </span>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="llms.txt"
      icon={<Bot size={14} />}
      badge={
        <div className="flex gap-1.5">
          {llms.found && <StatusBadge status="pass" label="llms.txt" />}
          {llms.full_found && <StatusBadge status="pass" label="llms-full.txt" />}
        </div>
      }
    >
      {llms.content && (
        <div>
          {llms.full_found && <div className="sub-section">llms.txt</div>}
          <div className="p-4" style={{ maxHeight: "200px", overflowY: "auto" }}>
            <pre
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                lineHeight: "18px",
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
              }}
            >
              {llms.content}
            </pre>
          </div>
        </div>
      )}
      {llms.full_content && (
        <div>
          <div className="sub-section">llms-full.txt</div>
          <div className="p-4" style={{ maxHeight: "200px", overflowY: "auto" }}>
            <pre
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                lineHeight: "18px",
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: 0,
              }}
            >
              {llms.full_content}
            </pre>
          </div>
        </div>
      )}
    </Panel>
  );
}
