import type { Check } from "./types";
import { checkIpInfo } from "../actions/analyze/network";

export const ipInfoCheck: Check = {
  key: "ip_info",
  label: "IP Geolocation",
  default: null,
  run: (ctx) => checkIpInfo(ctx.domain, ctx.dnsRecords, ctx.env),
};
