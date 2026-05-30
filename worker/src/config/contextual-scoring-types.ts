// Shared types for scoring — extracted to avoid circular imports
export type Axis = "security" | "performance" | "infrastructure" | "trust" | "visibility";
export type Severity = "critical" | "high" | "medium" | "low" | "info" | "good";
export type ArchetypeName =
  | "commerce"
  | "content"
  | "application"
  | "corporate"
  | "infrastructure"
  | "institutional"
  | "general";
