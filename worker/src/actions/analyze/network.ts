import { fetchWithTimeout, getFlyProbeUrl, getFlyAuthHeaders, type Env } from "../../helpers";
import type { DnsRecord, IpInfo, BlocklistResult, SslResult, ShodanResult, DnssecResult } from "./types";

// ─── IP Geolocation ──────────────────────────────────────────────────

export async function checkIpInfo(_domain: string, dnsRecords: DnsRecord[], env: Env): Promise<IpInfo | null> {
  const aRecord = dnsRecords.find((r) => r.type === "A");
  if (!aRecord) return null;
  const ip = aRecord.data;

  // Try Fly probe first (MaxMind local DB + API fallbacks, no rate limits)
  try {
    const probeRes = await fetchWithTimeout(
      `${getFlyProbeUrl(env)}/probe-geo?ip=${encodeURIComponent(ip)}`,
      { timeout: 8000, headers: getFlyAuthHeaders(env) }
    );
    if (probeRes.ok) {
      const data = await probeRes.json() as { ip: string; city?: string | null; country?: string | null; country_code?: string | null; lat?: number | null; lon?: number | null; isp?: string | null; org?: string | null; asn?: string | null; source?: string; error?: string | null };
      if (!data.error) {
        const aaaaRecord = dnsRecords.find((r) => r.type === "AAAA");
        let reverseDns: string | null = null;
        try {
          const revRes = await fetchWithTimeout(`https://dns.google/resolve?name=${ip.split(".").reverse().join(".")}.in-addr.arpa&type=PTR`, { timeout: 3000 });
          const revData = await revRes.json() as { Answer?: Array<{ data: string }> };
          if (revData.Answer?.[0]) reverseDns = revData.Answer[0].data.replace(/\.$/, "");
        } catch { /* ignore */ }
        return { ip, isp: data.isp ?? null, org: data.org ?? null, asn: data.asn ?? null, city: data.city ?? null, country: data.country ?? null, country_code: data.country_code ?? null, lat: data.lat ?? null, lon: data.lon ?? null, reverse_dns: reverseDns, ipv6: aaaaRecord?.data ?? null };
      }
    }
  } catch { /* probe unreachable */ }

  // Fallback: direct ipwho.is from Worker
  try {
    const res = await fetchWithTimeout(`https://ipwho.is/${ip}`, { timeout: 5000 });
    const data = await res.json() as { success: boolean; country?: string; country_code?: string; city?: string; connection?: { isp?: string; org?: string; asn?: number; }; latitude?: number; longitude?: number; };
    if (!data.success) return null;
    const aaaaRecord = dnsRecords.find((r) => r.type === "AAAA");
    let reverseDns: string | null = null;
    try {
      const revRes = await fetchWithTimeout(`https://dns.google/resolve?name=${ip.split(".").reverse().join(".")}.in-addr.arpa&type=PTR`, { timeout: 3000 });
      const revData = await revRes.json() as { Answer?: Array<{ data: string }> };
      if (revData.Answer?.[0]) reverseDns = revData.Answer[0].data.replace(/\.$/, "");
    } catch { /* ignore */ }
    return { ip, isp: data.connection?.isp ?? null, org: data.connection?.org ?? null, asn: data.connection?.asn ? `AS${data.connection.asn}` : null, city: data.city ?? null, country: data.country ?? null, country_code: data.country_code ?? null, lat: data.latitude ?? null, lon: data.longitude ?? null, reverse_dns: reverseDns, ipv6: aaaaRecord?.data ?? null };
  } catch { return null; }
}

// ─── Blocklist Checks ────────────────────────────────────────────────

// ─── Blocklist Configuration ─────────────────────────────────────────
// Reliability notes (verified 2026-05-24):
//
// KEEP:
//   Barracuda (b.barracudacentral.org) — reliable, no false positives on major domains
//   SpamCop (bl.spamcop.net) — reliable, low false positive rate
//   SORBS (dnsbl.sorbs.net) — reliable, no false positives on major domains
//
// FIXED (were returning false positives):
//   Spamhaus ZEN (zen.spamhaus.org) — returns 127.255.255.254 when queried via
//     public resolvers (dns.google). This is NOT a real listing — it means
//     "query blocked, use Spamhaus DQS instead". Code now filters this out.
//
// REMOVED:
//   CBL (cbl.abuseat.org) — redundant with Spamhaus ZEN. CBL is the data source
//     for Spamhaus XBL, which is already included in ZEN. Also returns
//     127.255.255.254 via public resolvers (same issue as Spamhaus).
//
// DNSBL error response codes (NOT real listings):
//   127.255.255.254 = "query via public/open resolver — blocked"
//   127.255.255.255 = "query used incorrect DNSBL name"
//
// Spamhaus legitimate listing codes (these ARE real listings):
//   127.0.0.2    = SBL (Spamhaus Block List)
//   127.0.0.3    = SBL CSS
//   127.0.0.4-7  = XBL (Exploits Block List / CBL data)
//   127.0.0.10-11 = PBL (Policy Block List)
// ─────────────────────────────────────────────────────────────────────

const DNSBL_ERROR_CODES = new Set(["127.255.255.254", "127.255.255.255"]);

export const BLOCKLISTS = [
  { name: "Spamhaus ZEN", zone: "zen.spamhaus.org" },
  { name: "Barracuda", zone: "b.barracudacentral.org" },
  { name: "SpamCop", zone: "bl.spamcop.net" },
  { name: "SORBS", zone: "dnsbl.sorbs.net" },
] as const;

export async function checkBlocklists(dnsRecords: DnsRecord[]): Promise<BlocklistResult[]> {
  const aRecord = dnsRecords.find((r) => r.type === "A");
  if (!aRecord) return [];
  const reversed = aRecord.data.split(".").reverse().join(".");
  const results: BlocklistResult[] = [];
  const checks = BLOCKLISTS.map(async (bl) => {
    try {
      const res = await fetchWithTimeout(`https://dns.google/resolve?name=${reversed}.${bl.zone}&type=A`, { timeout: 4000 });
      const data = await res.json() as { Status: number; Answer?: Array<{ data: string }> };
      const returnIp = data.Answer?.[0]?.data ?? null;

      // Filter out DNSBL error responses — these are NOT real listings.
      // 127.255.255.254 = "queried via public resolver, blocked"
      // 127.255.255.255 = "incorrect DNSBL name"
      const isErrorResponse = returnIp !== null && DNSBL_ERROR_CODES.has(returnIp);
      const listed = data.Status === 0 && !!data.Answer?.length && !isErrorResponse;

      results.push({
        name: bl.name,
        zone: bl.zone,
        listed,
        detail: isErrorResponse ? "query blocked (public resolver)" : listed ? returnIp : null,
      });
    } catch { results.push({ name: bl.name, zone: bl.zone, listed: false, detail: "check failed" }); }
  });
  await Promise.allSettled(checks);
  return results;
}

// ─── SSL Labs + Direct TLS ───────────────────────────────────────────

export async function checkSsl(domain: string, env: Env): Promise<SslResult | null> {
  // Priority 1: Fly probe — direct TLS handshake, most reliable, works for any domain
  const probeResult = await tryFlyProbe(domain, env);
  if (probeResult && probeResult.grade) return probeResult;

  // Priority 2: SSL Labs — enrichment with grade/protocols when cached results exist
  const labsResult = await trySslLabs(domain);
  if (labsResult && labsResult.grade) return labsResult;

  // Priority 3: HTTPS connectivity + crt.sh cert lookup
  const httpsResult = await tryHttpsCrtsh(domain);
  if (httpsResult && httpsResult.grade) return httpsResult;

  // If all 3 fail, return what we got (prefer probe error > labs error > generic)
  return probeResult ?? labsResult ?? httpsResult ?? {
    grade: null, issuer: null, subject: null, valid_from: null, valid_to: null,
    protocols: [], key_exchange: null, error: "SSL check unavailable — all providers failed",
  };
}

// ─── SSL: Fly Probe (direct TLS handshake) ──────────────────────────

async function tryFlyProbe(domain: string, env: Env): Promise<SslResult | null> {
  try {
    const probeRes = await fetchWithTimeout(
      `${getFlyProbeUrl(env)}/probe-ssl?domain=${encodeURIComponent(domain)}`,
      { timeout: 12000, headers: getFlyAuthHeaders(env) }
    );
    if (!probeRes.ok) return null;

    const data = await probeRes.json() as {
      grade: string; issuer: string; subject: string;
      valid_from: string; valid_to: string;
      key_alg: string; key_size: number;
      protocols: string[]; chain_depth: number; chain_valid: boolean;
      sans: string[]; serial: string; error: string | null;
    };

    if (!data.grade) return null;

    return {
      grade: data.grade,
      issuer: data.issuer || null,
      subject: data.subject || null,
      valid_from: data.valid_from || null,
      valid_to: data.valid_to || null,
      protocols: data.protocols || [],
      key_exchange: data.key_alg ? `${data.key_alg} ${data.key_size || ""}`.trim() : null,
      error: data.grade === "T" ? (data.error || "Certificate trust issue") : null,
    };
  } catch { return null; }
}

// ─── SSL: SSL Labs (cached grade + protocol details) ────────────────

async function trySslLabs(domain: string): Promise<SslResult | null> {
  try {
    const url = `https://api.ssllabs.com/api/v3/analyze?host=${encodeURIComponent(domain)}&fromCache=on&maxAge=72&all=done`;
    const res = await fetchWithTimeout(url, { timeout: 10000 });
    if (!res.ok) return null;

    const data = JSON.parse(await res.text()) as {
      status: string;
      endpoints?: Array<{
        grade?: string;
        details?: {
          protocols?: Array<{ name: string; version: string }>;
          certChains?: Array<{ certIds?: string[] }>;
        };
      }>;
      certs?: Array<{
        id: string; subject?: string; issuerSubject?: string;
        notBefore?: number; notAfter?: number;
        keyAlg?: string; keySize?: number; commonNames?: string[];
      }>;
    };

    // SSL Labs only useful when it has cached READY results
    if (data.status !== "READY" || !data.endpoints?.length) return null;

    const ep = data.endpoints[0];
    if (!ep) return null;

    const protocols = (ep.details?.protocols ?? []).map((p) => `${p.name} ${p.version}`);

    let issuer: string | null = null;
    let validFrom: string | null = null;
    let validTo: string | null = null;
    let keyExchange: string | null = null;

    const leafCertId = ep.details?.certChains?.[0]?.certIds?.[0];
    const certs = data.certs ?? [];
    const leafCert = (leafCertId ? certs.find((c) => c.id === leafCertId) : null) ?? certs[0];

    if (leafCert) {
      issuer = leafCert.issuerSubject ?? null;
      validFrom = leafCert.notBefore ? new Date(leafCert.notBefore).toISOString() : null;
      validTo = leafCert.notAfter ? new Date(leafCert.notAfter).toISOString() : null;
      keyExchange = leafCert.keyAlg ? `${leafCert.keyAlg} ${leafCert.keySize ?? ""}`.trim() : null;
    }

    return { grade: ep.grade ?? null, issuer, subject: null, valid_from: validFrom, valid_to: validTo, protocols, key_exchange: keyExchange, error: null };
  } catch { return null; }
}

// ─── SSL: HTTPS fetch + crt.sh cert lookup ──────────────────────────

async function tryHttpsCrtsh(domain: string): Promise<SslResult | null> {
  try {
    const httpsRes = await fetchWithTimeout(`https://${domain}/`, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Yoke/1.0; +https://github.com/yokedotlol/yoke)" },
    });
    if (!httpsRes.ok && httpsRes.status === 0) return null;

    // HTTPS responded (any status code means TLS succeeded)
    let issuer: string | null = null;
    let validFrom: string | null = null;
    let validTo: string | null = null;

    try {
      const crtRes = await fetchWithTimeout(
        `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`,
        { timeout: 6000 }
      );
      if (crtRes.ok) {
        const certs = (await crtRes.json()) as Array<{
          issuer_name?: string; not_before?: string; not_after?: string;
          common_name?: string; name_value?: string;
        }>;
        const matching = certs
          .filter((c) => c.common_name === domain || c.name_value?.split("\n").includes(domain))
          .sort((a, b) => new Date(b.not_before ?? 0).getTime() - new Date(a.not_before ?? 0).getTime());
        const latest = matching[0];
        if (latest) {
          issuer = latest.issuer_name ?? null;
          validFrom = latest.not_before ? new Date(latest.not_before).toISOString() : null;
          validTo = latest.not_after ? new Date(latest.not_after).toISOString() : null;
        }
      }
    } catch { /* crt.sh unavailable — we still know HTTPS works */ }

    return { grade: "Valid", issuer, subject: null, valid_from: validFrom, valid_to: validTo, protocols: [], key_exchange: null, error: null };
  } catch { return null; }
}

// ─── Live Status Check ───────────────────────────────────────────────

export async function checkStatus(domain: string, env: Env): Promise<{ is_up: boolean; status_code: number | null; response_time_ms: number | null; error: string | null; status_label: string; http_blocked: boolean; http2?: boolean; http3?: boolean; alt_svc?: string | null }> {
  // Try Fly.io proxy first (avoids CF Worker IP blocks for sites like meta.com)
  try {
    const probeRes = await fetchWithTimeout(
      `${getFlyProbeUrl(env)}/probe-status?domain=${encodeURIComponent(domain)}`,
      { timeout: 15000, headers: getFlyAuthHeaders(env) }
    );
    if (probeRes.ok) {
      const data = await probeRes.json() as { is_up: boolean; status_code: number | null; response_time_ms: number; error: string | null; status_label: string; http_blocked: boolean; http2?: boolean; http3?: boolean; alt_svc?: string | null };
      return {
        is_up: data.is_up,
        status_code: data.status_code ?? null,
        response_time_ms: data.response_time_ms,
        error: data.error ?? null,
        status_label: data.status_label ?? "DOWN",
        http_blocked: data.http_blocked ?? false,
        http2: data.http2 ?? false,
        http3: data.http3 ?? false,
        alt_svc: data.alt_svc ?? null,
      };
    }
  } catch { /* Fly proxy unreachable — fall back to direct probe */ }

  // Fallback: direct probe from CF Worker
  const start = Date.now();
  try {
    // Use a realistic browser User-Agent and follow redirects manually to track final status
    let currentUrl = `https://${domain}`;
    let finalStatus = 0;
    for (let i = 0; i < 5; i++) {
      const res = await fetchWithTimeout(currentUrl, {
        timeout: 10000,
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      });
      finalStatus = res.status;
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (location) {
          currentUrl = location.startsWith("http") ? location : new URL(location, currentUrl).href;
          continue;
        }
      }
      break;
    }
    const elapsed = Date.now() - start;
    const isUp = finalStatus >= 200 && finalStatus < 400;
    const isBlocked = finalStatus === 403 || finalStatus === 503 || finalStatus === 502 || finalStatus === 429;
    return {
      is_up: isUp || isBlocked, // blocked means the site is UP, just blocking us
      status_code: finalStatus,
      response_time_ms: elapsed,
      error: isBlocked ? `Site returned HTTP ${finalStatus} — may be blocking automated requests` : null,
      status_label: isUp ? "UP" : isBlocked ? "RESTRICTED" : "DOWN",
      http_blocked: isBlocked,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    return { is_up: false, status_code: null, response_time_ms: elapsed > 100 ? elapsed : null, error: err instanceof Error ? err.message : "Connection failed", status_label: "DOWN", http_blocked: false };
  }
}

// ─── NEW: Shodan InternetDB ─────────────────────────────────────────

export async function checkShodan(ip: string): Promise<ShodanResult | null> {
  try {
    const res = await fetchWithTimeout(`https://internetdb.shodan.io/${ip}`, { timeout: 6000 });
    if (!res.ok) return null;
    const data = await res.json() as { cpes?: string[]; hostnames?: string[]; ip?: string; ports?: number[]; tags?: string[]; vulns?: string[] };
    return {
      ports: data.ports ?? [],
      cpes: data.cpes ?? [],
      vulns: data.vulns ?? [],
      tags: data.tags ?? [],
      hostnames: data.hostnames ?? [],
    };
  } catch { return null; }
}

// ─── NEW: DNSSEC Validation ─────────────────────────────────────────

export async function checkDnssec(domain: string): Promise<DnssecResult> {
  const result: DnssecResult = { enabled: false, has_dnskey: false, has_ds: false, validated: false };
  const [dnskeyRes, dsRes, adRes] = await Promise.allSettled([
    fetchWithTimeout(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=DNSKEY`, { timeout: 5000 }),
    fetchWithTimeout(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=DS`, { timeout: 5000 }),
    fetchWithTimeout(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A&cd=false`, { timeout: 5000 }),
  ]);

  if (dnskeyRes.status === "fulfilled" && dnskeyRes.value.ok) {
    try {
      const data = await dnskeyRes.value.json() as { Status: number; Answer?: Array<{ data: string }> };
      if (data.Status === 0 && data.Answer?.length) result.has_dnskey = true;
    } catch { /* ignore */ }
  }

  if (dsRes.status === "fulfilled" && dsRes.value.ok) {
    try {
      const data = await dsRes.value.json() as { Status: number; Answer?: Array<{ data: string }> };
      if (data.Status === 0 && data.Answer?.length) result.has_ds = true;
    } catch { /* ignore */ }
  }

  if (adRes.status === "fulfilled" && adRes.value.ok) {
    try {
      const data = await adRes.value.json() as { AD?: boolean };
      if (data.AD === true) result.validated = true;
    } catch { /* ignore */ }
  }

  result.enabled = result.has_dnskey || result.has_ds || result.validated;
  return result;
}

