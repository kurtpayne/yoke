import type { Check } from "./types";
import { checkCrux } from "../actions/analyze/performance";

export const cruxCheck: Check = {
  key: "crux",
  label: "Chrome UX Report",
  default: null,
  timeout: 15_000,
  run: (ctx) => checkCrux(ctx.domain, ctx.env.GOOGLE_PAGESPEED_API_KEY, ctx.env.REFERENCE_DATA, ctx.env.STATS_DB),
};
