// ─── Subdomain DNS Scan ──────────────────────────────────────────────
// Active DNS probing with curated prefix list, grouped by category.
// On-demand only (not automatic), results cached 24h in D1.

import { normalizeDomain, fetchWithTimeout, getFromCache, setCache } from "../helpers";

// ─── Curated Prefix List ─────────────────────────────────────────────

interface PrefixEntry {
  prefix: string;
  category: string;
}

const SUBDOMAIN_PREFIXES: PrefixEntry[] = [
  // Web & App
  ...["www","www2","www3","app","apps","web","portal","dashboard","my","account","login","signin","auth","sso","oauth","register","signup"].map(p => ({ prefix: p, category: "Web & App" })),
  // API & Services
  ...["api","api2","api3","apis","graphql","rest","ws","wss","gateway","webhook","webhooks","rpc","grpc"].map(p => ({ prefix: p, category: "API & Services" })),
  // Mail & Communication
  ...["mail","mail2","smtp","imap","pop","pop3","webmail","mx","mx1","mx2","email","newsletter","lists","mailman"].map(p => ({ prefix: p, category: "Mail & Communication" })),
  // Development & Staging
  ...["dev","dev2","develop","staging","stage","stg","test","testing","qa","uat","sandbox","demo","beta","alpha","preview","canary","next","pre","preprod"].map(p => ({ prefix: p, category: "Development & Staging" })),
  // Infrastructure & DevOps
  ...["cdn","cdn1","cdn2","assets","static","media","img","images","files","storage","s3","upload","downloads","ftp","sftp"].map(p => ({ prefix: p, category: "Infrastructure & CDN" })),
  // Admin & Internal
  ...["admin","administrator","panel","manage","management","cms","cp","cpanel","whm","plesk","backoffice","internal","intranet"].map(p => ({ prefix: p, category: "Admin & Internal" })),
  // Monitoring & Ops
  ...["status","health","monitor","monitoring","metrics","grafana","kibana","logs","sentry","uptime"].map(p => ({ prefix: p, category: "Monitoring & Ops" })),
  // Commerce
  ...["shop","store","cart","checkout","pay","payment","payments","billing","orders","inventory"].map(p => ({ prefix: p, category: "Commerce" })),
  // Documentation & Support
  ...["docs","doc","documentation","help","support","kb","knowledgebase","wiki","faq","community","forum"].map(p => ({ prefix: p, category: "Documentation & Support" })),
  // Marketing & Analytics
  ...["blog","news","landing","promo","analytics","tracking","pixel","ads","marketing","go","links","link"].map(p => ({ prefix: p, category: "Marketing & Analytics" })),
  // Security
  ...["security","cert","certs","vpn","proxy","waf","firewall"].map(p => ({ prefix: p, category: "Security" })),
  // Cloud & Hosting
  ...["ns1","ns2","ns3","ns4","dns","dns1","dns2","relay","relay2","origin","edge","lb","lb1","node1","node2","cluster"].map(p => ({ prefix: p, category: "Cloud & DNS" })),
];

// ─── DNS Resolution ──────────────────────────────────────────────────

interface ResolvedSubdomain {
  prefix: string;
  hostname: string;
  category: string;
  ips: string[];
  sameAsApex: boolean;
}

interface SubdomainScanResult {
  domain: string;
  total_found: number;
  total_scanned: number;
  categories: Record<string, ResolvedSubdomain[]>;
  apex_ips: string[];
  cached: boolean;
}

async function resolveHost(hostname: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
      { timeout: 3000 },
    );
    if (!res.ok) return [];
    const data = await res.json() as { Status: number; Answer?: Array<{ type: number; data: string }> };
    if (data.Status !== 0 || !data.Answer) return [];
    return data.Answer.filter(a => a.type === 1).map(a => a.data);
  } catch {
    return [];
  }
}

async function resolveApex(domain: string): Promise<string[]> {
  const ips = await resolveHost(domain);
  return ips;
}

// ─── Main Scan Function ──────────────────────────────────────────────

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const BATCH_SIZE = 15;
const BATCH_DELAY = 50; // ms between batches

export async function scanSubdomains(kv: KVNamespace, rawDomain: string): Promise<SubdomainScanResult> {
  const domain = normalizeDomain(rawDomain);

  // Check cache
  const cached = await getFromCache(kv, domain, "subdomain_scan", CACHE_TTL);
  if (cached) return { ...(cached as SubdomainScanResult), cached: true };

  // Resolve apex IPs first
  const apexIps = await resolveApex(domain);
  const apexIpSet = new Set(apexIps);

  // Batch DNS resolution
  const results: ResolvedSubdomain[] = [];
  const batches: PrefixEntry[][] = [];
  for (let i = 0; i < SUBDOMAIN_PREFIXES.length; i += BATCH_SIZE) {
    batches.push(SUBDOMAIN_PREFIXES.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map(async ({ prefix, category }) => {
        const hostname = `${prefix}.${domain}`;
        const ips = await resolveHost(hostname);
        if (ips.length > 0) {
          const sameAsApex = ips.some(ip => apexIpSet.has(ip));
          return { prefix, hostname, category, ips, sameAsApex };
        }
        return null;
      })
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value) {
        results.push(r.value);
      }
    }

    // Small delay between batches
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  // Group by category
  const categories: Record<string, ResolvedSubdomain[]> = {};
  for (const r of results) {
    if (!categories[r.category]) categories[r.category] = [];
    categories[r.category].push(r);
  }

  const result: SubdomainScanResult = {
    domain,
    total_found: results.length,
    total_scanned: SUBDOMAIN_PREFIXES.length,
    categories,
    apex_ips: apexIps,
    cached: false,
  };

  // Cache
  try {
    await setCache(kv, domain, "subdomain_scan", result, CACHE_TTL);
  } catch { /* ignore */ }

  return result;
}
