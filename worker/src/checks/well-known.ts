import { checkWellKnownEndpoints } from "../actions/analyze/tier1";
import type { Check } from "./types";

export const wellKnownCheck: Check = {
  key: "well_known",
  label: "Well-Known",
  default: { endpoints: [], pwa_ready: false, has_mobile_apps: false, ads_partner_count: null },
  run: (ctx) => checkWellKnownEndpoints(ctx.domain),
};
