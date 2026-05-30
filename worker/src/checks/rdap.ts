import { checkRdap } from "../actions/analyze/dns";
import type { Check } from "./types";

export const rdapCheck: Check = {
  key: "rdap",
  label: "WHOIS / RDAP",
  default: null,
  run: (ctx) => checkRdap(ctx.domain, ctx.env),
};
