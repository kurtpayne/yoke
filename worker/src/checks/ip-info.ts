import { checkIpInfo } from "../actions/analyze/network";
import type { Check } from "./types";

export const ipInfoCheck: Check = {
  key: "ip_info",
  label: "IP Geolocation",
  default: null,
  run: (ctx) => checkIpInfo(ctx.domain, ctx.dnsRecords, ctx.env),
};
