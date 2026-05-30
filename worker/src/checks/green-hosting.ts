import { checkGreenHosting } from "../actions/analyze/tier1";
import type { Check } from "./types";

export const greenHostingCheck: Check = {
  key: "green_hosting",
  label: "Green Hosting",
  default: { green: false, hosted_by: null, hosted_by_website: null, error: null },
  run: (ctx) => checkGreenHosting(ctx.domain),
};
