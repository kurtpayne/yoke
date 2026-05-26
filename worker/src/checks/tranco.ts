import type { Check } from "./types";
import { checkTranco } from "../actions/analyze/content";

export const trancoCheck: Check = {
  key: "tranco_rank",
  label: "Tranco Ranking",
  default: null,
  run: (ctx) => checkTranco(ctx.domain),
};
