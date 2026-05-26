import type { Check } from "./types";
import { checkCarbon } from "../actions/analyze/performance";

export const carbonCheck: Check = {
  key: "carbon",
  label: "Carbon Footprint",
  default: null,
  run: (ctx) => checkCarbon(ctx.domain),
};
