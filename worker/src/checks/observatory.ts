import type { Check } from "./types";
import { checkObservatory } from "../actions/analyze/content";

export const observatoryCheck: Check = {
  key: "observatory",
  label: "Observatory",
  default: null,
  run: (ctx) => checkObservatory(ctx.domain, ctx.env.STATS_DB),
};
