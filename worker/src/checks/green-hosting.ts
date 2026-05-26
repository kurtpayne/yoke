import type { Check } from "./types";
import { checkGreenHosting } from "../actions/analyze/tier1";

export const greenHostingCheck: Check = {
  key: "green_hosting",
  label: "Green Hosting",
  default: { green: false, hosted_by: null, hosted_by_website: null, error: null },
  run: (ctx) => checkGreenHosting(ctx.domain),
};
