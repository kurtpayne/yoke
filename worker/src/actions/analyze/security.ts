import type { DnsRecord, IpInfo, HostingResult, CookieAudit, CookieSecurityResult } from "./types";

// ─── Cloudflare Worker Header Sanitization ──────────────────────────
// CF Workers inject their own headers (server: cloudflare, cf-ray, cf-cache-status, etc.)
// into ALL fetch responses, even for non-CF origins. We must strip these when the target
// site is NOT actually behind Cloudflare to avoid false CDN/security/tech detection.

export const CF_INJECTED_HEADERS = [
  "cf-ray",
  "cf-cache-status",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-visitor",
  "cf-worker",
  "nel",
  "report-to",
];

/** Check if a domain is genuinely behind Cloudflare (not just Worker fetch pollution) */
export function isActuallyCloudflare(dnsRecords: DnsRecord[], ipInfo: IpInfo | null): boolean {
  // Check 1: NS records point to Cloudflare nameservers
  const nsRecords = dnsRecords.filter((r) => r.type === "NS");
  const hasCfNameservers = nsRecords.some((r) =>
    /\.ns\.cloudflare\.com\.?$/i.test(r.data)
  );
  if (hasCfNameservers) return true;

  // Check 2: IP belongs to Cloudflare ASN (AS13335)
  if (ipInfo?.asn && /AS13335/i.test(ipInfo.asn)) return true;

  // Check 3: Reverse DNS points to Cloudflare
  if (ipInfo?.reverse_dns && /cloudflare/i.test(ipInfo.reverse_dns)) return true;

  return false;
}

/** Strip CF Worker-injected headers from a response header map */
export function sanitizeCfHeaders(headers: Record<string, string>): Record<string, string> {
  const cleaned = { ...headers };
  for (const key of CF_INJECTED_HEADERS) {
    delete cleaned[key];
  }
  // Remove the injected `server: cloudflare` header — restore original if possible
  if (cleaned["server"] && /^cloudflare$/i.test(cleaned["server"])) {
    delete cleaned["server"];
  }
  return cleaned;
}

// ─── NEW: Hosting Provider / WAF / CDN Detection ────────────────────

export const HOSTING_PATTERNS: Array<{ name: string; type: "provider" | "cdn" | "waf"; patterns: { org?: RegExp[]; rdns?: RegExp[]; headers?: Record<string, RegExp> } }> = [
  // CDN / WAF (check first as they front the real host)
  // NOTE: Cloudflare detection is handled separately via isActuallyCloudflare() + nameserver/ASN check.
  // The header-only pattern is kept but will only match when headers haven't been sanitized (i.e., site IS behind CF).
  { name: "Cloudflare", type: "cdn", patterns: { headers: { server: /cloudflare/i } } },
  { name: "AWS CloudFront", type: "cdn", patterns: { headers: { "x-amz-cf-id": /./, via: /CloudFront/i }, rdns: [/cloudfront\.net$/] } },
  { name: "Akamai", type: "cdn", patterns: { headers: { "x-akamai-transformed": /./ }, rdns: [/akamai/i] } },
  { name: "Fastly", type: "cdn", patterns: { headers: { "x-served-by": /cache/, via: /varnish/i }, rdns: [/fastly/i] } },
  { name: "Sucuri WAF", type: "waf", patterns: { headers: { "x-sucuri-id": /./, server: /sucuri/i } } },
  { name: "Imperva/Incapsula", type: "waf", patterns: { headers: { "x-iinfo": /./, "x-cdn": /incapsula/i } } },
  // Hosting providers
  { name: "AWS", type: "provider", patterns: { org: [/amazon|aws/i], rdns: [/amazonaws\.com$/, /\.aws\./i] } },
  { name: "Google Cloud", type: "provider", patterns: { org: [/google cloud/i], rdns: [/googleusercontent\.com$/, /1e100\.net$/] } },
  { name: "Microsoft Azure", type: "provider", patterns: { org: [/microsoft/i], rdns: [/azure/i, /\.microsoft\.com$/] } },
  { name: "Vercel", type: "provider", patterns: { headers: { "x-vercel-id": /./, server: /vercel/i } } },
  { name: "Netlify", type: "provider", patterns: { headers: { server: /netlify/i, "x-nf-request-id": /./ } } },
  { name: "DigitalOcean", type: "provider", patterns: { org: [/digitalocean/i], rdns: [/digitalocean/i] } },
  { name: "Hetzner", type: "provider", patterns: { org: [/hetzner/i], rdns: [/hetzner/i] } },
  { name: "OVH", type: "provider", patterns: { org: [/ovh/i], rdns: [/ovh\./i] } },
  { name: "GoDaddy", type: "provider", patterns: { org: [/godaddy/i], rdns: [/secureserver\.net$/] } },
  { name: "Shopify", type: "provider", patterns: { headers: { "x-shopify-stage": /./ }, rdns: [/shopify/i] } },
  { name: "WP Engine", type: "provider", patterns: { headers: { "x-powered-by": /WP Engine/i }, rdns: [/wpengine/i] } },
  { name: "Squarespace", type: "provider", patterns: { headers: { "x-servedby": /squarespace/i }, rdns: [/squarespace/i] } },
  { name: "Wix", type: "provider", patterns: { headers: { "x-wix-request-id": /./ } } },
  { name: "Fly.io", type: "provider", patterns: { headers: { "fly-request-id": /./ }, rdns: [/fly\.dev$/] } },
  { name: "Railway", type: "provider", patterns: { rdns: [/railway\.app$/] } },
  { name: "Render", type: "provider", patterns: { rdns: [/onrender\.com$/] } },
  { name: "GitHub Pages", type: "provider", patterns: { headers: { server: /GitHub\.com/i }, rdns: [/github\.io$/] } },
  { name: "Linode/Akamai", type: "provider", patterns: { org: [/linode|akamai/i], rdns: [/linode/i] } },
];

export function detectHosting(ipInfo: IpInfo | null, headers: Record<string, string> | null): HostingResult {
  const result: HostingResult = { provider: null, cdn: null, waf: null };
  if (!headers && !ipInfo) return result;

  for (const hp of HOSTING_PATTERNS) {
    let matched = false;

    if (hp.patterns.headers && headers) {
      for (const [key, regex] of Object.entries(hp.patterns.headers)) {
        if (headers[key] && regex.test(headers[key])) { matched = true; break; }
      }
    }
    if (!matched && hp.patterns.rdns && ipInfo?.reverse_dns) {
      for (const regex of hp.patterns.rdns) {
        if (regex.test(ipInfo.reverse_dns)) { matched = true; break; }
      }
    }
    if (!matched && hp.patterns.org && ipInfo?.org) {
      for (const regex of hp.patterns.org) {
        if (regex.test(ipInfo.org)) { matched = true; break; }
      }
    }

    if (matched) {
      if (hp.type === "cdn" && !result.cdn) result.cdn = hp.name;
      else if (hp.type === "waf" && !result.waf) result.waf = hp.name;
      else if (hp.type === "provider" && !result.provider) result.provider = hp.name;
    }
  }

  return result;
}

// ─── NEW: Open Graph + Twitter Card Audit ───────────────────────────

function extractSocialMeta(html: string): OgTwitterResult {
  const extractMeta = (html: string, attr: string, name: string): string | null => {
    const r1 = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]+content=["']([^"']+)["']`, "i");
    const r2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${name}["']`, "i");
    return html.match(r1)?.[1] ?? html.match(r2)?.[1] ?? null;
  };

  const og = {
    title: extractMeta(html, "property", "og:title"),
    description: extractMeta(html, "property", "og:description"),
    image: extractMeta(html, "property", "og:image"),
    type: extractMeta(html, "property", "og:type"),
    url: extractMeta(html, "property", "og:url"),
    site_name: extractMeta(html, "property", "og:site_name"),
    locale: extractMeta(html, "property", "og:locale"),
  };

  const twitter = {
    card: extractMeta(html, "name", "twitter:card"),
    site: extractMeta(html, "name", "twitter:site"),
    creator: extractMeta(html, "name", "twitter:creator"),
    title: extractMeta(html, "name", "twitter:title"),
    description: extractMeta(html, "name", "twitter:description"),
    image: extractMeta(html, "name", "twitter:image"),
  };

  const missing: string[] = [];
  const essential = [
    ["og:title", og.title], ["og:description", og.description], ["og:image", og.image],
    ["og:type", og.type], ["og:url", og.url],
    ["twitter:card", twitter.card], ["twitter:title", twitter.title ?? og.title],
    ["twitter:description", twitter.description ?? og.description],
  ] as const;

  let filled = 0;
  for (const [name, val] of essential) {
    if (val) filled++;
    else missing.push(name);
  }
  const score = Math.round((filled / essential.length) * 100);

  return { og, twitter, score, missing };
}

// ─── NEW: Legal Pages Detection ─────────────────────────────────────

const LEGAL_PATTERNS: Array<{ name: string; patterns: RegExp[] }> = [
  { name: "Privacy Policy", patterns: [/\/privacy/i, /privacy[_-]?policy/i] },
  { name: "Terms of Service", patterns: [/\/terms/i, /terms[_-]?of[_-]?service/i, /terms[_-]?of[_-]?use/i, /\/tos\b/i] },
  { name: "Cookie Policy", patterns: [/cookie[_-]?policy/i, /\/cookies\b/i] },
  { name: "Accessibility", patterns: [/\/accessibility/i, /\/a11y\b/i] },
  { name: "GDPR", patterns: [/\/gdpr/i, /data[_-]?protection/i] },
  { name: "Imprint", patterns: [/\/imprint/i, /\/impressum/i] },
];

const CONSENT_PROVIDERS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Cookiebot", pattern: /cookiebot/i },
  { name: "OneTrust", pattern: /onetrust|optanon/i },
  { name: "Quantcast", pattern: /quantcast.*choice|__tcfapi/i },
  { name: "TrustArc", pattern: /trustarc|truste/i },
  { name: "Osano", pattern: /osano/i },
  { name: "CookieYes", pattern: /cookieyes/i },
  { name: "Didomi", pattern: /didomi/i },
  { name: "Usercentrics", pattern: /usercentrics/i },
];

function detectLegalPages(html: string, domain: string): LegalResult {
  const pagesFound: Array<{ name: string; url: string }> = [];
  const seen = new Set<string>();

  // Extract all <a href="..."> links
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1] ?? "";
    const text = (match[2] ?? "").replace(/<[^>]+>/g, "").trim().toLowerCase();

    for (const lp of LEGAL_PATTERNS) {
      if (seen.has(lp.name)) continue;
      const hrefMatch = lp.patterns.some((p) => p.test(href));
      const textMatch = lp.patterns.some((p) => p.test(text));
      if (hrefMatch || textMatch) {
        seen.add(lp.name);
        let url = href;
        if (url && !url.startsWith("http")) {
          try { url = new URL(url, `https://${domain}`).href; } catch { /* keep as-is */ }
        }
        pagesFound.push({ name: lp.name, url });
      }
    }
  }

  let cookieConsentDetected = false;
  let consentProvider: string | null = null;
  for (const cp of CONSENT_PROVIDERS) {
    if (cp.pattern.test(html)) {
      cookieConsentDetected = true;
      consentProvider = cp.name;
      break;
    }
  }

  return { pages_found: pagesFound, cookie_consent_detected: cookieConsentDetected, consent_provider: consentProvider };
}

// ─── NEW: Cookie Security Audit ─────────────────────────────────────

export function auditCookies(headers: Record<string, string> | null): CookieSecurityResult | null {
  if (!headers) return null;
  const setCookieHeader = headers["set-cookie"];
  if (!setCookieHeader) return null;

  // set-cookie headers can be combined with commas, but cookies can contain commas in dates
  // Split on lines that look like new cookie names
  const cookieStrings = setCookieHeader.split(/,(?=\s*[a-zA-Z0-9_-]+=)/);
  const cookies: CookieAudit[] = [];
  const issues: string[] = [];

  for (const cs of cookieStrings) {
    const trimmed = cs.trim();
    if (!trimmed) continue;
    const nameMatch = trimmed.match(/^([^=]+)=/);
    if (!nameMatch) continue;
    const name = nameMatch[1]?.trim() ?? "";
    const lower = trimmed.toLowerCase();
    const secure = lower.includes("secure");
    const httponly = lower.includes("httponly");
    const sameSiteMatch = lower.match(/samesite=(strict|lax|none)/);
    const samesite = sameSiteMatch?.[1] ?? null;

    cookies.push({ name, secure, httponly, samesite });

    if (!secure) issues.push(`${name}: missing Secure flag`);
    if (!httponly && !name.startsWith("__Host-") && !name.startsWith("_ga")) {
      issues.push(`${name}: missing HttpOnly flag`);
    }
    if (!samesite) issues.push(`${name}: missing SameSite attribute`);
    if (samesite === "none" && !secure) issues.push(`${name}: SameSite=None requires Secure flag`);
  }

  if (cookies.length === 0) return null;
  return { cookies, issues };
}

