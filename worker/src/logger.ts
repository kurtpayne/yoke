// Structured JSON logging for Cloudflare Workers.
// All log entries include a timestamp, level, and optional domain context
// so they're filterable in the CF dashboard and wrangler tail.

export type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  msg: string;
  domain?: string;
  ts: number;
  [key: string]: unknown;
}

export function log(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    msg,
    ts: Date.now(),
    ...extra,
  };

  switch (level) {
    case "error":
      console.error(JSON.stringify(entry));
      break;
    case "warn":
      console.warn(JSON.stringify(entry));
      break;
    case "debug":
      console.debug(JSON.stringify(entry));
      break;
    default:
      console.log(JSON.stringify(entry));
  }
}

// Convenience wrappers
export const logInfo = (msg: string, extra?: Record<string, unknown>) => log("info", msg, extra);
export const logWarn = (msg: string, extra?: Record<string, unknown>) => log("warn", msg, extra);
export const logError = (msg: string, extra?: Record<string, unknown>) => log("error", msg, extra);
