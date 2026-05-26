import type { Check } from "./types";
import { checkWayback } from "../actions/analyze/content";

export const waybackCheck: Check = {
  key: "wayback",
  label: "Wayback Machine",
  default: null,
  run: (ctx) => checkWayback(ctx.domain),
};
