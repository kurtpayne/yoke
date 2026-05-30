import { checkWayback } from "../actions/analyze/content";
import type { Check } from "./types";

export const waybackCheck: Check = {
  key: "wayback",
  label: "Wayback Machine",
  default: null,
  run: (ctx) => checkWayback(ctx.domain),
};
