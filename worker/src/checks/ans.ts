import { checkAnsRecords } from "../actions/analyze/content";
import type { Check } from "./types";

export const ansCheck: Check = {
  key: "ans",
  label: "ANS / DNS-AID",
  default: null,
  run: (ctx) => checkAnsRecords(ctx.domain),
};
