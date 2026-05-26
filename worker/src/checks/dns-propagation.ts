import type { Check } from "./types";
import { checkDnsPropagation } from "../actions/analyze/network-health";

export const dnsPropagationCheck: Check = {
  key: "dns_propagation",
  label: "DNS Propagation",
  default: null,
  run: (ctx) => checkDnsPropagation(ctx.domain),
};
