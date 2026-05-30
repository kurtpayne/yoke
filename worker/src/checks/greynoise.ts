import { checkGreynoise } from "../actions/analyze/tier1";
import type { Check } from "./types";

export const greynoiseCheck: Check = {
  key: "greynoise",
  label: "GreyNoise",
  default: null,
  run: (ctx) => (ctx.ip ? checkGreynoise(ctx.ip) : Promise.resolve(null)),
};
