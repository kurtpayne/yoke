import { checkConnectionTiming } from "../actions/analyze/network-health";
import type { Check } from "./types";

export const connectionTimingCheck: Check = {
  key: "connection_timing",
  label: "Connection Timing",
  default: null,
  run: (ctx) => checkConnectionTiming(ctx.domain, ctx.env),
};
