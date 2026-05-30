import { checkDnsPropagation } from "../actions/analyze/network-health";
import type { Check } from "./types";

export const dnsPropagationCheck: Check = {
  key: "dns_propagation",
  label: "DNS Propagation",
  default: null,
  run: (ctx) => checkDnsPropagation(ctx.domain),
};
