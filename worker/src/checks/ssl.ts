import type { Check } from "./types";
import { checkSsl } from "../actions/analyze/network";

export const sslCheck: Check = {
  key: "ssl",
  label: "SSL / TLS",
  default: null,
  run: (ctx) => checkSsl(ctx.domain, ctx.env),
};
