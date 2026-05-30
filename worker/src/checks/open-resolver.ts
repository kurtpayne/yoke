// ─── Open Resolver Detection ────────────────────────────────────────
// Checks if the target domain's nameservers allow recursive queries.
// Open resolvers are a security risk — they can be abused for DNS
// amplification attacks.
//
// Approach: resolve each NS hostname to IPs via DoH, then attempt a
// DoH query to each NS for an external domain (example.com).
// If a NS responds with valid recursive results, it's flagged.
//
// Limitation: CF Workers can only make HTTP requests, so we can only
// detect NS servers that expose DoH endpoints. Most authoritative NS
// don't, so this is a best-effort heuristic. Full detection requires
// raw UDP/TCP socket access (future headless/proxy tier).

import type { Check } from "./types";
import { fetchWithTimeout } from "../helpers";

export interface OpenResolverResult {
  checked: boolean;
  ns_tested: number;
  open_resolvers: Array<{
    ns: string;
    ip: string;
    method: string; // "doh" or "doh-wireformat"
  }>;
}

/** Known public/managed NS providers that are NOT open resolvers (skip probing) */
const MANAGED_NS_PROVIDERS = [
  "cloudflare.com", "awsdns", "azure-dns", "googledomains.com",
  "google.com", "gandi.net", "domaincontrol.com", "registrar-servers.com",
  "ns.cloudflare.com", "dnsimple.com", "digitalocean.com", "linode.com",
  "hetzner.com", "ovh.net", "name-services.com", "nsone.net",
  "ultradns.com", "dynect.net", "dnsmadeeasy.com", "he.net",
  "godaddy.com", "squarespace.com", "wix.com", "shopify.com",
  "netlify.com", "vercel-dns.com", "bunny.net", "fastly.net",
];

function isManagedNs(nsName: string): boolean {
  const lower = nsName.toLowerCase();
  return MANAGED_NS_PROVIDERS.some(p => lower.includes(p));
}

async function probeNsForRecursion(nsHostname: string, nsIp: string): Promise<boolean> {
  // Try DoH JSON API on the NS hostname
  try {
    const res = await fetchWithTimeout(
      `https://${nsHostname}/dns-query?name=example.com&type=A`,
      {
        timeout: 3000,
        headers: { Accept: "application/dns-json" },
      },
    );
    if (res.ok) {
      const data = await res.json() as { Status?: number; Answer?: Array<{ type: number; data: string }> };
      // If we get a valid answer with A records for example.com, the NS is recursing
      if (data.Status === 0 && data.Answer?.some(a => a.type === 1)) {
        return true;
      }
    }
  } catch { /* NS doesn't support DoH — expected for most */ }

  return false;
}

async function resolveNsIp(nsHostname: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `https://dns.google/resolve?name=${encodeURIComponent(nsHostname)}&type=A`,
      { timeout: 3000 },
    );
    if (res.ok) {
      const data = await res.json() as { Answer?: Array<{ type: number; data: string }> };
      const a = data.Answer?.find(r => r.type === 1);
      return a?.data ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

export async function checkOpenResolver(
  dnsRecords: Array<{ type: string; data: string }>,
): Promise<OpenResolverResult> {
  const nsRecords = dnsRecords.filter(r => r.type === "NS");
  if (nsRecords.length === 0) {
    return { checked: false, ns_tested: 0, open_resolvers: [] };
  }

  // Filter out managed NS providers (known to not be open resolvers)
  const nsToTest = nsRecords
    .map(r => r.data.replace(/\.$/, ""))
    .filter(ns => !isManagedNs(ns));

  if (nsToTest.length === 0) {
    return { checked: true, ns_tested: nsRecords.length, open_resolvers: [] };
  }

  const openResolvers: OpenResolverResult["open_resolvers"] = [];

  // Test up to 4 NS servers in parallel
  const testPromises = nsToTest.slice(0, 4).map(async (ns) => {
    const ip = await resolveNsIp(ns);
    if (!ip) return;

    const isOpen = await probeNsForRecursion(ns, ip);
    if (isOpen) {
      openResolvers.push({ ns, ip, method: "doh" });
    }
  });

  await Promise.allSettled(testPromises);

  return {
    checked: true,
    ns_tested: nsToTest.length,
    open_resolvers: openResolvers,
  };
}

export const openResolverCheck: Check = {
  key: "open_resolver",
  label: "Open Resolver",
  default: null,
  timeout: 10000,
  run: async (ctx) => {
    return checkOpenResolver(ctx.dnsRecords);
  },
};
