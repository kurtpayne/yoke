import type { Check } from "./types";
import { checkSecurityTxt } from "../actions/analyze/tier1";

export const securityTxtCheck: Check = {
  key: "security_txt",
  label: "Security.txt",
  default: { found: false, contact: [], encryption: null, acknowledgments: null, policy: null, hiring: null, canonical: null, preferred_languages: null, expires: null, is_expired: false, has_bug_bounty: false, bug_bounty_platform: null, raw: null },
  run: (ctx) => checkSecurityTxt(ctx.domain, ctx.instanceHost),
};
