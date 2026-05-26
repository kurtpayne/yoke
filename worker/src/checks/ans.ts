import type { Check } from "./types";
import { checkAnsRecords } from "../actions/analyze/content";

export const ansCheck: Check = {
  key: "ans",
  label: "ANS / DNS-AID",
  default: null,
  run: (ctx) => checkAnsRecords(ctx.domain),
};
