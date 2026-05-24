// Global Availability Check — direct HTTP probing from the Worker edge
// check-host.net blocks CF Worker IPs, so we probe directly from the edge
// and use multiple DNS resolvers for regional perspective

import { fetchWithTimeout } from "../helpers";

interface AvailabilityNode {
  country_code: string;
  country: string;
  city: string;
  ip: string;
  asn: string;
}

interface AvailabilityResult {
  node: string;
  location: AvailabilityNode;
  status: "up" | "down" | "pending" | "error";
  status_code: number | null;
  response_time_ms: number | null;
  ip: string | null;
  message: string | null;
}

// Public DNS resolvers for A-record lookups to get diverse IPs
const DNS_RESOLVERS = [
  { name: "Cloudflare", ip: "1.1.1.1", country_code: "US", country: "United States", city: "Cloudflare Edge" },
  { name: "Google", ip: "8.8.8.8", country_code: "US", country: "United States", city: "Google DNS" },
  { name: "Quad9", ip: "9.9.9.9", country_code: "CH", country: "Switzerland", city: "Quad9 DNS" },
];

async function resolveViaDoH(domain: string, resolverUrl: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      `${resolverUrl}?name=${encodeURIComponent(domain)}&type=A`,
      { timeout: 8000, headers: { Accept: "application/dns-json" } }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    return (data.Answer ?? [])
      .filter((a: any) => a.type === 1) // A records only
      .map((a: any) => a.data);
  } catch {
    return [];
  }
}

async function probeHttp(url: string, timeoutMs: number = 8000): Promise<{
  ok: boolean; status: number | null; time_ms: number; error: string | null;
}> {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(url, {
      method: "HEAD",
      timeout: timeoutMs,
      redirect: "follow",
      headers: { "User-Agent": "Yoke/1.0 (Domain Intelligence)" },
    });
    return { ok: res.ok, status: res.status, time_ms: Date.now() - start, error: null };
  } catch (e) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, status: null, time_ms: elapsed, error: msg.includes("abort") ? "Timeout" : msg };
  }
}

export async function checkGlobalAvailability(domain: string): Promise<{
  results: AvailabilityResult[];
  request_id: string | null;
  permanent_link: string | null;
}> {
  // 1. Resolve domain IPs via multiple DNS resolvers
  const dnsResults = await Promise.allSettled(
    DNS_RESOLVERS.map(r => {
      const urls: Record<string, string> = {
        "Cloudflare": "https://cloudflare-dns.com/dns-query",
        "Google": "https://dns.google/resolve",
        "Quad9": "https://dns.quad9.net/dns-query",
      };
      return resolveViaDoH(domain, urls[r.name] ?? "https://cloudflare-dns.com/dns-query");
    })
  );

  // Get unique IPs
  const allIps = new Set<string>();
  for (const r of dnsResults) {
    if (r.status === "fulfilled") {
      for (const ip of r.value) allIps.add(ip);
    }
  }

  // 2. Probe HTTP and HTTPS from the Worker edge
  const protocols = ["https", "http"];
  const targets = protocols.map(proto => `${proto}://${domain}`);

  // Also probe by IP with Host header for each unique IP
  const ipTargets = [...allIps].slice(0, 4).map(ip => ({ ip, url: `https://${ip}`, host: domain }));

  const results: AvailabilityResult[] = [];

  // Direct probes (HTTPS + HTTP)
  const directProbes = await Promise.allSettled(
    targets.map(async (url) => {
      const probe = await probeHttp(url);
      return { url, probe };
    })
  );

  for (const r of directProbes) {
    if (r.status !== "fulfilled") continue;
    const { url, probe } = r.value;
    const proto = url.startsWith("https") ? "HTTPS" : "HTTP";
    results.push({
      node: `direct-${proto.toLowerCase()}`,
      location: { country_code: "🌐", country: "Direct", city: `${proto} from Edge`, ip: "", asn: "" },
      status: probe.ok ? "up" : probe.error ? "error" : "down",
      status_code: probe.status,
      response_time_ms: probe.time_ms,
      ip: [...allIps][0] ?? null,
      message: probe.error,
    });
  }

  // DNS resolver perspective probes
  for (let i = 0; i < DNS_RESOLVERS.length; i++) {
    const resolver = DNS_RESOLVERS[i];
    const dnsResult = dnsResults[i];
    const ips = dnsResult.status === "fulfilled" ? dnsResult.value : [];
    results.push({
      node: `dns-${resolver.name.toLowerCase()}`,
      location: { country_code: resolver.country_code, country: resolver.country, city: resolver.city, ip: resolver.ip, asn: "" },
      status: ips.length > 0 ? "up" : "down",
      status_code: null,
      response_time_ms: null,
      ip: ips[0] ?? null,
      message: ips.length > 0 ? `Resolves to ${ips.join(", ")}` : "DNS resolution failed",
    });
  }

  // Per-IP HTTPS probes
  const ipProbes = await Promise.allSettled(
    ipTargets.map(async ({ ip, host }) => {
      const start = Date.now();
      try {
        const res = await fetchWithTimeout(`https://${host}`, {
          method: "HEAD",
          timeout: 8000,
          redirect: "follow",
          headers: { "User-Agent": "Yoke/1.0", Host: host },
        });
        return { ip, ok: res.ok, status: res.status, time_ms: Date.now() - start, error: null as string | null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown";
        return { ip, ok: false, status: null as number | null, time_ms: Date.now() - start, error: msg.includes("abort") ? "Timeout" : msg };
      }
    })
  );

  for (const r of ipProbes) {
    if (r.status !== "fulfilled") continue;
    const { ip, ok, status, time_ms, error } = r.value;
    results.push({
      node: `ip-${ip}`,
      location: { country_code: "🌐", country: "IP Probe", city: ip, ip, asn: "" },
      status: ok ? "up" : error ? "error" : "down",
      status_code: status,
      response_time_ms: time_ms,
      ip,
      message: error,
    });
  }

  return {
    results,
    request_id: null,
    permanent_link: null,
  };
}
