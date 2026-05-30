import { checkTranco } from "../actions/analyze/content";
import type { Check } from "./types";

export const trancoCheck: Check = {
  key: "tranco_rank",
  label: "Tranco Ranking",
  default: null,
  run: (ctx) => checkTranco(ctx.domain, ctx.env.STATS_DB),
};
