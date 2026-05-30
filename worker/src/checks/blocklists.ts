import { checkBlocklists } from "../actions/analyze/network";
import type { Check } from "./types";

export const blocklistsCheck: Check = {
  key: "blocklists",
  label: "Blocklist Check",
  default: [],
  run: (ctx) => checkBlocklists(ctx.dnsRecords),
};
