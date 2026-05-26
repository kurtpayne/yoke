import type { Check } from "./types";
import { checkRdap } from "../actions/analyze/dns";

export const rdapCheck: Check = {
  key: "rdap",
  label: "WHOIS / RDAP",
  default: null,
  run: (ctx) => checkRdap(ctx.domain, ctx.env),
};
