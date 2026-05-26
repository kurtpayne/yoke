import type { Check } from "./types";
import { checkRipeRouting } from "../actions/analyze/network-health";

export const ripeRoutingCheck: Check = {
  key: "ripe_routing",
  label: "RIPE Routing",
  default: null,
  run: (ctx) => ctx.ip ? checkRipeRouting(ctx.ip) : Promise.resolve(null),
};
