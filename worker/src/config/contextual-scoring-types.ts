// Shared types for scoring — extracted to avoid circular imports
export type Axis = "security" | "speed" | "foundations" | "reputation" | "discoverability" | "email";
export type Severity = "critical" | "high" | "medium" | "low" | "info" | "good";
export type ArchetypeName =
  | "commerce"
  | "content"
  | "application"
  | "corporate"
  | "infrastructure"
  | "institutional"
  | "general";
