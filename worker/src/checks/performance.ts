import type { Check } from "./types";
import { checkPageSpeed } from "../actions/analyze/performance";

export const performanceCheck: Check = {
  key: "performance",
  label: "Google PageSpeed",
  default: { score: null, fcp: null, lcp: null, tbt: null, cls: null, si: null, ttfb: null, strategy: "mobile", error: "PageSpeed timed out — site may be very slow", screenshot: null },
  timeout: 50_000,
  run: (ctx) => checkPageSpeed(ctx.domain, ctx.httpResponseTimeMs, ctx.env.DB, ctx.env.GOOGLE_PAGESPEED_API_KEY, ctx.env.FLY_AUTH_SECRET),
};
