import type { Check } from "./types";
import { checkOutagePages } from "../actions/analyze/network-health";

export const outageLinksCheck: Check = {
  key: "outage_links",
  label: "Outage Pages",
  default: null,
  run: (ctx) => checkOutagePages(ctx.domain),
};
