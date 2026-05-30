import { checkOutagePages } from "../actions/analyze/network-health";
import type { Check } from "./types";

export const outageLinksCheck: Check = {
  key: "outage_links",
  label: "Outage Pages",
  default: null,
  run: (ctx) => checkOutagePages(ctx.domain),
};
