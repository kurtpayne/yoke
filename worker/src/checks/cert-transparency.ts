import type { Check } from "./types";
import { checkCertTransparency } from "../actions/analyze/tier1";

export const certTransparencyCheck: Check = {
  key: "cert_transparency",
  label: "Cert Transparency",
  default: { subdomains: [], total_certs: 0, has_wildcard: false, issuers: [], error: null },
  run: (ctx) => checkCertTransparency(ctx.domain),
};
