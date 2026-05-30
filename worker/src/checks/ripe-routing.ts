import { checkRipeRouting } from "../actions/analyze/network-health";
import type { Check } from "./types";

export const ripeRoutingCheck: Check = {
  key: "ripe_routing",
  label: "RIPE Routing",
  default: null,
  run: (ctx) => (ctx.ip ? checkRipeRouting(ctx.ip) : Promise.resolve(null)),
};
