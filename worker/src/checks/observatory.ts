import { checkObservatory } from "../actions/analyze/content";
import type { Check } from "./types";

export const observatoryCheck: Check = {
  key: "observatory",
  label: "Observatory",
  default: null,
  run: (ctx) => checkObservatory(ctx.domain, ctx.env.STATS_DB),
};
