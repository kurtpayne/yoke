import type { Check } from "./types";
import { checkBlocklists } from "../actions/analyze/network";

export const blocklistsCheck: Check = {
  key: "blocklists",
  label: "Blocklist Check",
  default: [],
  run: (ctx) => checkBlocklists(ctx.dnsRecords),
};
