import type { Check } from "./types";
import { checkGreynoise } from "../actions/analyze/tier1";

export const greynoiseCheck: Check = {
  key: "greynoise",
  label: "GreyNoise",
  default: null,
  run: (ctx) => ctx.ip ? checkGreynoise(ctx.ip) : Promise.resolve(null),
};
