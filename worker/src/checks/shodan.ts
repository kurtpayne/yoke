import type { Check } from "./types";
import { checkShodan } from "../actions/analyze/network";

export const shodanCheck: Check = {
  key: "shodan",
  label: "Shodan",
  default: null,
  run: (ctx) => ctx.ip ? checkShodan(ctx.ip) : Promise.resolve(null),
};
