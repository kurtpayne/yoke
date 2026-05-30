import { checkShodan } from "../actions/analyze/network";
import type { Check } from "./types";

export const shodanCheck: Check = {
  key: "shodan",
  label: "Shodan",
  default: null,
  run: (ctx) => (ctx.ip ? checkShodan(ctx.ip, ctx.env.STATS_DB) : Promise.resolve(null)),
};
