import { checkRobotsSitemap } from "../actions/analyze/http";
import type { Check } from "./types";

export const robotsSitemapCheck: Check = {
  key: "_robots_sitemap",
  label: "Robots & Sitemap",
  default: {
    robots_txt: null,
    robots_txt_exists: false,
    sitemap_detected: false,
    sitemap_url: null,
    sitemap_page_count: null,
  },
  run: (ctx) => checkRobotsSitemap(ctx.domain, ctx.instanceHost, ctx.env),
};
