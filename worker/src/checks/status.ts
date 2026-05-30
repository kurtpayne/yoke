import { checkStatus } from "../actions/analyze/network";
import type { Check } from "./types";

export const statusCheck: Check = {
  key: "_status",
  label: "HTTP Status",
  default: {
    is_up: false,
    status_code: null,
    response_time_ms: null,
    error: "Phase 2 promise rejected",
    status_label: "error",
    http_blocked: false,
  },
  run: (ctx) => checkStatus(ctx.domain, ctx.env),
};
