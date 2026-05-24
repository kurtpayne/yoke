import { fetchWithTimeout, MULTI_PART_TLDS } from "../../helpers";
import type { DnsRecord, RdapResult } from "./types";

// ─── DNS ─────────────────────────────────────────────────────────────

export const DNS_TYPES = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA", "CAA"] as const;

export async function checkDns(domain: string): Promise<DnsRecord[]> {
  const results: DnsRecord[] = [];
  const queries = DNS_TYPES.map(async (type) => {
    try {
      const res = await fetchWithTimeout(
        `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`,
        { timeout: 5000 },
      );
      const data = await res.json() as {
        Status: number;
        Answer?: Array<{ name: string; type: number; TTL: number; data: string }>;
      };
      if (data.Status === 0 && data.Answer) {
        for (const ans of data.Answer) {
          results.push({ type, name: ans.name.replace(/\.$/, ""), ttl: ans.TTL, data: ans.data });
        }
      }
    } catch { /* individual type failure is fine */ }
  });
  await Promise.allSettled(queries);
  return results;
}

// ─── Subdomain Detection ─────────────────────────────────────────────

export function getParentDomain(domain: string): string | null {
  const parts = domain.split(".");
  // Handles multi-part TLDs: .co.uk, .com.au, etc.
  const multiPartTlds = MULTI_PART_TLDS;
  const domainLower = domain.toLowerCase();
  for (const mpt of multiPartTlds) {
    if (domainLower.endsWith("." + mpt)) {
      // e.g. blog.example.co.uk → parts = [blog, example, co, uk] → need 4+ parts
      if (parts.length > mpt.split(".").length + 1) {
        return parts.slice(1).join(".");
      }
      return null; // It's already a base domain for this multi-part TLD
    }
  }
  // Standard TLDs: blog.example.com → parts = [blog, example, com]
  if (parts.length > 2) return parts.slice(1).join(".");
  return null;
}

export function isSubdomain(domain: string): boolean {
  return getParentDomain(domain) !== null;
}

// ─── RDAP ────────────────────────────────────────────────────────────

// Known RDAP endpoints for TLDs that don't work via rdap.org
export const RDAP_ENDPOINTS: Record<string, string> = {
  "com": "https://rdap.verisign.com/com/v1",
  "net": "https://rdap.verisign.com/net/v1",
  "org": "https://rdap.publicinterestregistry.org/rdap",
  "io": "https://rdap.nic.io",
  "app": "https://pubapi.registry.google/rdap",
  "dev": "https://pubapi.registry.google/rdap",
  "page": "https://pubapi.registry.google/rdap",
  "xyz": "https://rdap.nic.xyz",
  "me": "https://rdap.nic.me",
  "info": "https://rdap.org",
  "co": "https://rdap.nic.co",
  "us": "https://rdap.nic.us",
  "uk": "https://rdap.nominet.uk/uk",
  "de": "https://rdap.denic.de",
  "fr": "https://rdap.nic.fr",
  "nl": "https://rdap.sidn.nl",
  "au": "https://rdap.auda.org.au",
  "ca": "https://rdap.ca.fury.ca/rdap",
  "eu": "https://rdap.eurid.eu",
  "so": "https://rdap.nic.so",
  "gov": "https://rdap.nic.gov/rdap",
  "be": "https://rdap.dns.be",
  "se": "https://rdap.iis.se",
  "ch": "https://rdap.nic.ch",
  "at": "https://rdap.nic.at",
  "nz": "https://rdap.nzrs.net.nz",
  "jp": "https://rdap.jprs.jp/rdap",
};

export async function tryRdap(domain: string): Promise<RdapResult | null> {
  const tld = domain.split(".").pop()?.toLowerCase() ?? "";
  const knownEndpoint = RDAP_ENDPOINTS[tld];
  
  // Try known endpoint first, then rdap.org as fallback
  const urls: string[] = [];
  if (knownEndpoint) urls.push(`${knownEndpoint}/domain/${encodeURIComponent(domain)}`);
  if (!knownEndpoint || knownEndpoint !== "https://rdap.org") {
    urls.push(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  }

  for (const rdapUrl of urls) {
    try {
      const res = await fetchWithTimeout(rdapUrl, { timeout: 5000 });
      if (!res.ok) continue;
    const data = await res.json() as {
      events?: Array<{ eventAction: string; eventDate: string }>;
      nameservers?: Array<{ ldhName: string }>;
      status?: string[];
      entities?: Array<{
        roles: string[];
        vcardArray?: [string, Array<[string, Record<string, unknown>, string, string]>];
      }>;
    };

    let registrar: string | null = null;
    if (data.entities) {
      for (const entity of data.entities) {
        if (entity.roles?.includes("registrar") && entity.vcardArray) {
          const fn = entity.vcardArray[1]?.find((v) => v[0] === "fn");
          if (fn) registrar = fn[3] ?? null;
        }
      }
    }

    const events = data.events ?? [];
    const regEvent = events.find((e) => e.eventAction === "registration");
    const expEvent = events.find((e) => e.eventAction === "expiration");
    const chgEvent = events.find((e) => e.eventAction === "last changed");

    const now = Date.now();
    let domainAgeDays: number | null = null;
    let daysUntilExpiry: number | null = null;
    if (regEvent?.eventDate) domainAgeDays = Math.floor((now - new Date(regEvent.eventDate).getTime()) / 86400000);
    if (expEvent?.eventDate) daysUntilExpiry = Math.floor((new Date(expEvent.eventDate).getTime() - now) / 86400000);

    return {
      registrar,
      registration_date: regEvent?.eventDate ?? null,
      expiration_date: expEvent?.eventDate ?? null,
      last_changed: chgEvent?.eventDate ?? null,
      nameservers: (data.nameservers ?? []).map((ns) => ns.ldhName),
      status: data.status ?? [],
      domain_age_days: domainAgeDays,
      days_until_expiry: daysUntilExpiry,
    };
    } catch { continue; }
  }
  return null;
}

export async function checkRdap(domain: string): Promise<RdapResult | null> {
  // For subdomains, skip the subdomain RDAP lookup entirely — go straight to parent
  const parent = getParentDomain(domain);
  if (parent) {
    return tryRdap(parent);
  }
  
  // For base domains, try RDAP directly
  return tryRdap(domain);
}

