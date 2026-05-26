import type { Check } from "./types";
import { checkDnssec } from "../actions/analyze/network";

export const dnssecCheck: Check = {
  key: "dnssec",
  label: "DNSSEC",
  default: { enabled: false, has_dnskey: false, has_ds: false, validated: false },
  run: (ctx) => checkDnssec(ctx.domain),
};
