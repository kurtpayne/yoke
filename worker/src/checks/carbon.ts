import { checkCarbon } from "../actions/analyze/performance";
import type { Check } from "./types";

export const carbonCheck: Check = {
  key: "carbon",
  label: "Carbon Footprint",
  default: null,
  run: (ctx) => checkCarbon(ctx.domain),
};
