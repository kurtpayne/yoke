// Domain Suggestions — CF Registrar API + DNS-over-HTTPS fallback + smart name generation

import { type Env, fetchWithTimeout } from "../helpers";

// TLDs to fan across for our own generation
const FAN_TLDS = ["com", "net", "org", "io", "dev", "ai", "co", "app", "xyz", "lol", "me", "tech", "site", "tools"];
// Prefixes and suffixes for compound generation
const PREFIXES = ["get", "try", "my", "go", "use", "hey", "the"];
const SUFFIXES = ["app", "hq", "dev", "hub", "lab", "run", "now", "pro"];

export interface DomainSuggestion {
  domain: string;
  available: boolean | null; // null = unknown/unsupported
  registrable: boolean | null;
  pricing: { registration: string; renewal: string; currency: string } | null;
  source: "cf_search" | "cf_check" | "dns" | "generated";
}

/** Extract meaningful keywords from a domain name */
function extractKeywords(domain: string): string[] {
  const base = domain.replace(/\.[a-z]+(\.[a-z]+)?$/, "");
  const raw = base
    .replace(/[-_.]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  return [...new Set(raw)];
}

/** Generate domain name variations from keywords */
function generateVariations(keywords: string[]): string[] {
  const variations = new Set<string>();
  const base = keywords.join("");
  const baseDash = keywords.join("-");

  // 1. Base keyword(s) across TLDs
  for (const tld of FAN_TLDS) {
    variations.add(`${base}.${tld}`);
    if (keywords.length > 1) {
      variations.add(`${baseDash}.${tld}`);
    }
  }

  // 2. Prefix combos (.com and .io)
  for (const prefix of PREFIXES) {
    variations.add(`${prefix}${base}.com`);
    variations.add(`${prefix}${base}.io`);
  }

  // 3. Suffix combos
  for (const suffix of SUFFIXES) {
    variations.add(`${base}${suffix}.com`);
  }

  // 4. If multiple keywords, try reversed order
  if (keywords.length === 2) {
    const reversed = keywords[1] + keywords[0];
    variations.add(`${reversed}.com`);
    variations.add(`${reversed}.io`);
  }

  // 5. First keyword only across premium TLDs
  if (keywords.length > 1 && keywords[0].length >= 3) {
    for (const tld of ["com", "io", "dev", "ai", "co", "app"]) {
      variations.add(`${keywords[0]}.${tld}`);
    }
  }

  return [...variations];
}

/** Call CF Registrar Search API */
async function cfSearch(query: string, env: Env, limit = 15): Promise<DomainSuggestion[]> {
  try {
    const res = await fetchWithTimeout(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/registrar/domain-search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { timeout: 8000, headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` } }
    );
    if (!res.ok) return [];
    // CF Search API response shape (external API — type narrowly)
    const data = (await res.json()) as { success: boolean; result?: { domains?: Array<{ name: string; registrable: boolean; pricing?: { registration_cost: string; renewal_cost: string; currency: string } }> } };
    if (!data.success) return [];
    return (data.result?.domains ?? []).map((d) => ({
      domain: d.name,
      available: d.registrable === true,
      registrable: d.registrable,
      pricing: d.pricing
        ? { registration: d.pricing.registration_cost, renewal: d.pricing.renewal_cost, currency: d.pricing.currency }
        : null,
      source: "cf_search" as const,
    }));
  } catch {
    return [];
  }
}

/** Call CF Registrar Check API (authoritative, supports batch) */
async function cfCheck(domains: string[], env: Env): Promise<Map<string, DomainSuggestion>> {
  const map = new Map<string, DomainSuggestion>();
  if (domains.length === 0) return map;

  // CF Check API has a batch limit; chunk into groups of 10
  const chunks: string[][] = [];
  for (let i = 0; i < domains.length; i += 10) {
    chunks.push(domains.slice(i, i + 10));
  }

  const results = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const res = await fetchWithTimeout(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/registrar/domain-check`,
        {
          method: "POST",
          timeout: 8000,
          headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ domains: chunk }),
        }
      );
      if (!res.ok) return [];
      // CF Check API response shape (external API)
      const data = (await res.json()) as { success: boolean; result?: { domains?: Array<{ name: string; registrable: boolean; reason?: string; pricing?: { registration_cost: string; renewal_cost: string; currency: string } }> } };
      if (!data.success) return [];
      return data.result?.domains ?? [];
    })
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const d of result.value) {
      map.set(d.name, {
        domain: d.name,
        available: d.reason === "extension_not_supported_via_api" ? null : d.registrable === true,
        registrable: d.registrable,
        pricing: d.pricing
          ? { registration: d.pricing.registration_cost, renewal: d.pricing.renewal_cost, currency: d.pricing.currency }
          : null,
        source: "cf_check",
      });
    }
  }
  return map;
}

/** DNS-over-HTTPS availability check via Cloudflare (works great from Workers) */
async function dohCheck(domain: string): Promise<boolean | null> {
  try {
    const res = await fetchWithTimeout(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
      { timeout: 8000, headers: { Accept: "application/dns-json" } }
    );
    if (!res.ok) return null;
    // DoH JSON response shape
    const data = (await res.json()) as { Status: number; Answer?: unknown[] };
    // NXDOMAIN (status 3) = domain doesn't exist = likely available
    if (data.Status === 3) return true;
    // NOERROR (status 0) with Answer = has NS records = taken
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) return false;
    // NOERROR but no NS — could be parked or just have no NS. Check A record.
    if (data.Status === 0) {
      const aRes = await fetchWithTimeout(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`,
        { timeout: 8000, headers: { Accept: "application/dns-json" } }
      );
      if (aRes.ok) {
        // DoH JSON response shape
        const aData = (await aRes.json()) as { Status: number; Answer?: unknown[] };
        if (aData.Answer && aData.Answer.length > 0) return false;
      }
      // No NS, no A — probably available but not certain
      return true;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getDomainSuggestions(domain: string, env: Env): Promise<{ suggestions: DomainSuggestion[] }> {
  const keywords = extractKeywords(domain);
  if (keywords.length === 0) return { suggestions: [] };

  const query = keywords.join(" ");

  // 1. CF Search for smart suggestions + generate our own variations in parallel
  const [cfResults] = await Promise.all([cfSearch(query, env, 15)]);
  const generated = generateVariations(keywords);

  // 2. Collect all unique domains
  const allDomains = new Map<string, DomainSuggestion>();

  for (const s of cfResults) {
    allDomains.set(s.domain, s);
  }

  for (const d of generated) {
    if (!allDomains.has(d)) {
      allDomains.set(d, { domain: d, available: null, registrable: null, pricing: null, source: "generated" });
    }
  }

  // Remove the input domain itself
  allDomains.delete(domain);

  // 3. Batch check unchecked domains via CF Check API
  const unchecked = [...allDomains.values()].filter((s) => s.available === null).map((s) => s.domain);
  const cfChecked = await cfCheck(unchecked, env);

  for (const [name, result] of cfChecked) {
    const existing = allDomains.get(name);
    if (existing && existing.available === null) {
      existing.available = result.available;
      existing.registrable = result.registrable;
      existing.pricing = result.pricing;
      existing.source = result.available !== null ? "cf_check" : existing.source;
    }
  }

  // 4. DNS-over-HTTPS fallback for domains CF couldn't check
  const stillUnknown = [...allDomains.values()].filter((s) => s.available === null);
  const dohBatch = stillUnknown.slice(0, 20); // DoH is fast, can do more
  const dohResults = await Promise.allSettled(
    dohBatch.map(async (s) => {
      const available = await dohCheck(s.domain);
      return { domain: s.domain, available };
    })
  );

  for (const result of dohResults) {
    if (result.status === "fulfilled" && result.value.available !== null) {
      const existing = allDomains.get(result.value.domain);
      if (existing) {
        existing.available = result.value.available;
        existing.source = "dns";
      }
    }
  }

  // 5. Sort: available first, then by source quality, then alphabetical
  const suggestions = [...allDomains.values()]
    .sort((a, b) => {
      const avScore = (s: DomainSuggestion) => (s.available === true ? 0 : s.available === null ? 1 : 2);
      const diff = avScore(a) - avScore(b);
      if (diff !== 0) return diff;
      if (a.pricing && !b.pricing) return -1;
      if (!a.pricing && b.pricing) return 1;
      return a.domain.localeCompare(b.domain);
    })
    .slice(0, 30);

  return { suggestions };
}
