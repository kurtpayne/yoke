// ─── Phase 2 Check Registry ─────────────────────────────────────────
// Ordered array of all parallel analysis checks.
// The orchestrator in core.ts iterates this registry to run Phase 2.
//
// ## Adding a new check
//
// 1. Create `worker/src/checks/your-check.ts` exporting a Check object
// 2. Import it below and add it to the `registry` array
// 3. Run `bun test` — the registry order test will verify consistency
//
// ORDER MATTERS: some downstream code references checks by index position
// in the results array. Append new checks at the end unless you have a
// specific reason to reorder.

import type { Check } from "./types";

import { rdapCheck } from "./rdap";
import { robotsSitemapCheck } from "./robots-sitemap";
import { ipInfoCheck } from "./ip-info";
import { blocklistsCheck } from "./blocklists";
import { sslCheck } from "./ssl";
import { performanceCheck, performanceDesktopCheck } from "./performance";
import { cruxCheck } from "./crux";
import { statusCheck } from "./status";
import { llmsTxtCheck } from "./llms-txt";
import { waybackCheck } from "./wayback";
import { trancoCheck } from "./tranco";
import { observatoryCheck } from "./observatory";
import { emailAuthCheck } from "./email-auth";
import { carbonCheck } from "./carbon";
import { shodanCheck } from "./shodan";
import { dnssecCheck } from "./dnssec";
import { breachesCheck } from "./breaches";
import { certTransparencyCheck } from "./cert-transparency";
import { securityTxtCheck } from "./security-txt";
import { greenHostingCheck } from "./green-hosting";
import { wellKnownCheck } from "./well-known";
import { greynoiseCheck } from "./greynoise";
import { ansCheck } from "./ans";
import { dnsPropagationCheck } from "./dns-propagation";
import { ripeRoutingCheck } from "./ripe-routing";
import { outageLinksCheck } from "./outage-links";
import { connectionTimingCheck } from "./connection-timing";
import { socialAccountsCheck } from "./social-accounts";

/**
 * The canonical ordered list of Phase 2 parallel checks.
 * This order must match the original hardcoded order in core.ts.
 */
export const registry: readonly Check[] = [
  rdapCheck,
  robotsSitemapCheck,
  ipInfoCheck,
  blocklistsCheck,
  sslCheck,
  performanceCheck,
  performanceDesktopCheck,
  cruxCheck,
  statusCheck,
  llmsTxtCheck,
  waybackCheck,
  trancoCheck,
  observatoryCheck,
  emailAuthCheck,
  carbonCheck,
  shodanCheck,
  dnssecCheck,
  breachesCheck,
  certTransparencyCheck,
  securityTxtCheck,
  greenHostingCheck,
  wellKnownCheck,
  greynoiseCheck,
  ansCheck,
  dnsPropagationCheck,
  ripeRoutingCheck,
  outageLinksCheck,
  connectionTimingCheck,
  socialAccountsCheck,
] as const;
