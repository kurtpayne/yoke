import { checkSsl } from "../actions/analyze/network";
import type { Check } from "./types";

export const sslCheck: Check = {
  key: "ssl",
  label: "SSL / TLS",
  default: null,
  run: (ctx) => checkSsl(ctx.domain, ctx.env),
};
