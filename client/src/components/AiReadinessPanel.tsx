import { Bot, CheckCircle, XCircle, Rss, Cpu } from "lucide-react";
import { Panel, DataRow, GradeBadge, StatusBadge } from "./Panel";
import type { AnalysisResult } from "../utils/types";

export function AiReadinessPanel({ data }: { data: AnalysisResult }) {
  const ai = data.ai_readiness;
  if (!ai) return null;

  const ans = ai.ans;
  const hasAnyAgent = ans && (ans.ans_found || ans.agents_found || ans.agent_json_found);

  return (
    <Panel
      title="AI Readiness"
      icon={<Bot size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          <StatusBadge status="info" label={`${ai.score}/${ai.max_score}`} />
          <GradeBadge grade={ai.grade} />
        </div>
      }
    >
      {/* Score bar */}
      <div className="px-4 pt-3 pb-2">
        <div className="w-full h-2 rounded-full" style={{ background: "var(--surface-raised)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (ai.score / ai.max_score) * 100)}%`,
              background: ai.grade === "A" ? "var(--success)" : ai.grade === "B" ? "#7ee787" : ai.grade === "C" ? "var(--warning)" : "var(--danger)",
            }}
          />
        </div>
      </div>

      {/* Checklist */}
      <div className="sub-section">Checklist</div>
      {ai.checks.map((check, i) => (
        <div key={check.name} className="data-row" style={{ alignItems: "center" }}>
          <div className="flex items-center gap-2.5">
            {check.passed ? (
              <CheckCircle size={12} style={{ color: "var(--success)", flexShrink: 0 }} />
            ) : (
              <XCircle size={12} style={{ color: check.points < 0 ? "var(--danger)" : "var(--dim)", flexShrink: 0 }} />
            )}
            <span style={{
              fontFamily: "var(--font-ui)", fontSize: "12px",
              color: check.passed ? "var(--text)" : check.points < 0 ? "var(--danger)" : "var(--dim)",
            }}>
              {check.name}
            </span>
          </div>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: "11px",
            color: check.points > 0 ? "var(--success)" : check.points < 0 ? "var(--danger)" : "var(--dim)",
          }}>
            {check.points > 0 ? `+${check.points}` : check.points === 0 ? "0" : `${check.points}`}
          </span>
        </div>
      ))}

      {/* RSS Feed */}
      {ai.rss_feed && (
        <DataRow
          label="RSS Feed"
          value={
            <div className="flex items-center gap-1.5">
              <Rss size={11} style={{ color: "var(--accent)" }} />
              <a
                href={ai.rss_feed}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--accent)", textDecoration: "none", wordBreak: "break-all" }}
              >
                {ai.rss_feed.length > 50 ? ai.rss_feed.slice(0, 50) + "…" : ai.rss_feed}
              </a>
            </div>
          }
        />
      )}

      {/* Agent Discovery Details */}
      {hasAnyAgent && (
        <>
          <div className="sub-section">Agent Discovery</div>
          {ans.ans_found && (
            <DataRow
              label="ANS Record"
              value={
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text)", wordBreak: "break-all" }}>
                  {ans.ans_records.map((r, i) => <div key={i}>{r.length > 80 ? r.slice(0, 80) + "…" : r}</div>)}
                </div>
              }
            />
          )}
          {ans.agents_found && (
            <DataRow
              label="DNS-AID Record"
              value={
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text)", wordBreak: "break-all" }}>
                  {ans.agents_records.map((r, i) => <div key={i}>{r.length > 80 ? r.slice(0, 80) + "…" : r}</div>)}
                </div>
              }
            />
          )}
          {ans.agent_json_found && (
            <DataRow
              label="agent.json"
              value={
                <a
                  href={`https://${data.domain}/.well-known/agent.json`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--accent)", textDecoration: "none" }}
                >
                  /.well-known/agent.json
                </a>
              }
            />
          )}
        </>
      )}
    </Panel>
  );
}
