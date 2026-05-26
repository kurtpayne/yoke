import type { Check } from "./types";
import { checkConnectionTiming } from "../actions/analyze/network-health";

export const connectionTimingCheck: Check = {
  key: "connection_timing",
  label: "Connection Timing",
  default: null,
  run: (ctx) => checkConnectionTiming(ctx.domain, ctx.env),
};
