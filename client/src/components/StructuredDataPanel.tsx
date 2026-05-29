import { useState } from "react";
import { Code, Check, AlertTriangle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Panel, StatusBadge } from "./Panel";
import { CliButton, structuredDataCliCommands } from "./CliModal";
import type { AnalysisResult, SchemaValidationItem, FieldValidation } from "../utils/types";

// ─── Status Helpers ──────────────────────────────────────────────────

function validationStatusBadge(status: SchemaValidationItem["status"]) {
  switch (status) {
    case "complete": return <StatusBadge status="pass" label="Valid" />;
    case "partial": return <StatusBadge status="warn" label="Partial" />;
    case "missing_required": return <StatusBadge status="fail" label="Missing Required" />;
  }
}

function fieldStatusIcon(status: FieldValidation["status"]) {
  switch (status) {
    case "present":
      return <Check size={11} style={{ color: "var(--success)" }} />;
    case "missing":
      return <XCircle size={11} style={{ color: "var(--danger)" }} />;
    case "recommended":
      return <AlertTriangle size={11} style={{ color: "var(--warning)" }} />;
  }
}

function fieldStatusColor(status: FieldValidation["status"]): string {
  switch (status) {
    case "present": return "var(--success)";
    case "missing": return "var(--danger)";
    case "recommended": return "var(--warning)";
  }
}

// ─── Schema Type Item ────────────────────────────────────────────────

function SchemaTypeCard({ validation }: { validation: SchemaValidationItem }) {
  const [expanded, setExpanded] = useState(validation.status !== "complete");

  const requiredPresent = validation.required_fields.filter(f => f.status === "present").length;
  const requiredTotal = validation.required_fields.length;
  const recommendedPresent = validation.recommended_fields.filter(f => f.status === "present").length;
  const recommendedTotal = validation.recommended_fields.length;

  return (
    <div style={{ borderBottom: "1px solid var(--border-muted)" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full py-2.5 px-4"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
          fontSize: "12px",
          color: "var(--text)",
        }}
      >
        {expanded ? <ChevronDown size={12} style={{ color: "var(--dim)" }} /> : <ChevronRight size={12} style={{ color: "var(--dim)" }} />}
        <span style={{ fontWeight: 600 }}>{validation.type}</span>
        {validation.name && (
          <span style={{ color: "var(--dim)", fontSize: "11px", fontWeight: 400 }}>
            — {validation.name}
          </span>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {requiredTotal > 0 && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: requiredPresent === requiredTotal ? "var(--success)" : "var(--danger)",
            }}>
              {requiredPresent}/{requiredTotal} req
            </span>
          )}
          {recommendedTotal > 0 && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--dim)",
            }}>
              {recommendedPresent}/{recommendedTotal} rec
            </span>
          )}
          {validationStatusBadge(validation.status)}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3">
          {/* Required fields */}
          {validation.required_fields.length > 0 && (
            <div className="mb-2">
              <div style={{
                fontFamily: "var(--font-ui)",
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--dim)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 4,
              }}>
                Required Fields
              </div>
              {validation.required_fields.map(f => (
                <div
                  key={f.field}
                  className="flex items-center gap-2 py-1"
                  style={{ fontSize: "11px" }}
                >
                  {fieldStatusIcon(f.status)}
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    color: fieldStatusColor(f.status),
                    fontWeight: f.status === "missing" ? 600 : 400,
                  }}>
                    {f.field}
                  </span>
                  {f.value && (
                    <span style={{
                      fontFamily: "var(--font-ui)",
                      color: "var(--dim)",
                      fontSize: "10px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "min(200px, 40vw)",
                      minWidth: 0,
                    }}>
                      {f.value}
                    </span>
                  )}
                  {f.status === "missing" && (
                    <span style={{ fontFamily: "var(--font-ui)", color: "var(--danger)", fontSize: "10px" }}>
                      missing
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Recommended fields */}
          {validation.recommended_fields.length > 0 && (
            <div>
              <div style={{
                fontFamily: "var(--font-ui)",
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--dim)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 4,
              }}>
                Recommended Fields
              </div>
              {validation.recommended_fields.map(f => (
                <div
                  key={f.field}
                  className="flex items-center gap-2 py-0.5"
                  style={{ fontSize: "11px" }}
                >
                  {fieldStatusIcon(f.status)}
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    color: f.status === "present" ? "var(--text)" : "var(--dim)",
                  }}>
                    {f.field}
                  </span>
                  {f.value && (
                    <span style={{
                      fontFamily: "var(--font-ui)",
                      color: "var(--dim)",
                      fontSize: "10px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "min(200px, 40vw)",
                      minWidth: 0,
                    }}>
                      {f.value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Extra fields */}
          {validation.extra_fields.length > 0 && (
            <div className="mt-2 pt-1" style={{ borderTop: "1px solid var(--border-muted)" }}>
              <span style={{
                fontFamily: "var(--font-ui)",
                fontSize: "10px",
                color: "var(--dim)",
              }}>
                Extra fields: {validation.extra_fields.join(", ")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────

export function StructuredDataPanel({ data }: { data: AnalysisResult }) {
  const sd = data.structured_data;

  if (!sd || sd.total_items === 0) {
    return (
      <Panel title="Structured Data Validation" icon={<Code size={14} />}>
        <div className="p-4">
          <StatusBadge status="neutral" label="No structured data" />
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)", marginTop: 8 }}>
            No JSON-LD structured data found to validate.
          </p>
        </div>
      </Panel>
    );
  }

  const completeCount = sd.validations.filter(v => v.status === "complete").length;
  const issueCount = sd.validations.filter(v => v.status !== "complete").length;

  return (
    <Panel
      title="Structured Data Validation"
      icon={<Code size={14} />}
      badge={
        <div className="flex gap-1.5">
          <CliButton commands={structuredDataCliCommands(data.domain)} domain={data.domain} />
          {completeCount > 0 && <StatusBadge status="pass" label={`${completeCount} valid`} />}
          {issueCount > 0 && <StatusBadge status="warn" label={`${issueCount} issues`} />}
        </div>
      }
    >
      {/* Summary bar */}
      <div className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ borderBottom: "1px solid var(--border-muted)", fontSize: "11px", fontFamily: "var(--font-ui)", color: "var(--dim)" }}>
        <span>{sd.total_items} schema type{sd.total_items !== 1 ? "s" : ""} detected</span>
        <span style={{ color: "var(--border)" }}>|</span>
        <span style={{ wordBreak: "break-word" }}>Types: {sd.types_found.join(", ")}</span>
      </div>

      {/* Validations */}
      {sd.validations.map((v, i) => (
        <SchemaTypeCard key={`${v.type}-${i}`} validation={v} />
      ))}
    </Panel>
  );
}
