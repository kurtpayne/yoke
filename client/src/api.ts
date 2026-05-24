// Simple fetch wrapper replacing @hatch/space-sdk/client's createActionClient.
// Each function calls the corresponding /api/* route.

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = `API error ${res.status}`;
    try { const j = JSON.parse(body); if (j.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  analyzeDomain: (args: { domain: string }) =>
    apiFetch<AnalysisResult>("/api/analyze", { method: "POST", body: JSON.stringify(args) }),

  getRecentLookups: (args: { limit: number }) =>
    apiFetch<RecentLookupsResult>(`/api/recent?limit=${args.limit}`),

  getSubdomains: (args: { domain: string }) =>
    apiFetch<SubdomainsResult>("/api/subdomains", { method: "POST", body: JSON.stringify(args) }),

  getCompanyInfo: (args: { domain: string }) =>
    apiFetch<CompanyInfoResult>("/api/company", { method: "POST", body: JSON.stringify(args) }),

  getNews: (args: { domain: string }) =>
    apiFetch<NewsResult>("/api/news", { method: "POST", body: JSON.stringify(args) }),

  getSocialAccounts: (args: { domain: string }) =>
    apiFetch<SocialResult>("/api/social", { method: "POST", body: JSON.stringify(args) }),

  getReverseIP: (args: { ip: string }) =>
    apiFetch<ReverseIPResult>("/api/reverse-ip", { method: "POST", body: JSON.stringify(args) }),

  checkAvailability: (args: { domain: string }) =>
    apiFetch<AvailabilityResult>("/api/availability", { method: "POST", body: JSON.stringify(args) }),

  getDomainSuggestions: (args: { domain: string }) =>
    apiFetch<DomainSuggestionsResult>("/api/suggestions", { method: "POST", body: JSON.stringify(args) }),
};

// ─── Type definitions (matching server response shapes) ──────────────

export interface AnalysisResult {
  domain: string;
  cached: boolean;
  analyzed_at: string;
  status: { is_up: boolean; status_code: number | null; response_time_ms: number | null; error: string | null; status_label?: string; http_blocked?: boolean } | null;
  not_registered?: boolean;
  http_probe_blocked?: boolean;
  is_subdomain?: boolean;
  dns: { records: DnsRecord[] } | null;
  rdap: {
    registrar: string | null; registration_date: string | null; expiration_date: string | null;
    last_changed: string | null; nameservers: string[]; status: string[];
    domain_age_days: number | null; days_until_expiry: number | null;
  } | null;
  ssl: { grade: string | null; issuer: string | null; valid_from: string | null; valid_to: string | null; protocols: string[]; key_exchange: string | null; error: string | null } | null;
  headers: { raw: Record<string, string>; security_audit: SecurityCheck[]; security_grade: string } | null;
  tech_stack: TechItem[] | null;
  ip_info: {
    ip: string; isp: string | null; org: string | null; asn: string | null;
    city: string | null; country: string | null; country_code: string | null;
    lat: number | null; lon: number | null; reverse_dns: string | null; ipv6: string | null;
  } | null;
  blocklists: BlocklistItem[] | null;
  performance: {
    score: number | null; fcp: number | null; lcp: number | null; tbt: number | null;
    cls: number | null; si: number | null; ttfb: number | null;
    strategy: string; error: string | null; screenshot: string | null;
  } | null;
  redirects: RedirectHop[] | null;
  meta: {
    robots_txt: string | null; robots_txt_exists: boolean;
    sitemap_detected: boolean; sitemap_url: string | null; sitemap_page_count: number | null;
    og_title: string | null; og_description: string | null; og_image: string | null; favicon_url: string | null;
  } | null;
  llms_txt: LlmsTxt | null;
  wayback: WaybackData | null;
  tranco_rank: number | null;
  observatory: ObservatoryData | null;
  screenshot_url: string | null;
  email_auth: EmailAuth | null;
  http_protocols: HttpProtocols | null;
  carbon: CarbonData | null;
  robots_parsed: RobotsParsed | null;
  json_ld: JsonLdItem[] | null;

  // New v2 fields
  shodan: ShodanData | null;
  dnssec: DnssecData | null;
  hosting: HostingData | null;
  social_meta: SocialMetaData | null;
  legal: LegalData | null;
  cookie_security: CookieSecurityData | null;
  compression: CompressionData | null;
  ai_readiness: AiReadinessData | null;
  health_score: HealthScoreData | null;
  wordpress: WordPressData | null;
  breaches: BreachData | null;

  // Tier 1 features
  cert_transparency: CertTransparencyData | null;
  security_txt: SecurityTxtData | null;
  green_hosting: GreenHostingData | null;
  well_known: WellKnownData | null;
  caa_analysis: CaaAnalysisData | null;
  greynoise: GreynoiseData | null;
}

export interface DnsRecord { type: string; name: string; ttl: number; data: string; }
export interface SecurityCheck { header: string; status: "pass" | "fail" | "warning"; value: string | null; recommendation: string | null; }
export interface TechItem { category: string; name: string; version: string | null; confidence: string; }
export interface BlocklistItem { name: string; zone: string; listed: boolean; detail: string | null; }
export interface RedirectHop { url: string; status_code: number; server: string | null; response_time_ms: number; }
export interface LlmsTxt { found: boolean; content: string | null; full_found: boolean; full_content: string | null; }
export interface WaybackData { first_snapshot: string | null; last_snapshot: string | null; total_snapshots: number | null; archive_url: string; }
export interface ObservatoryData { grade: string | null; score: number | null; tests_passed: number | null; tests_total: number | null; }
export interface EmailAuth {
  spf: { found: boolean; record: string | null; mechanisms: string[]; all_qualifier: string | null };
  dmarc: { found: boolean; record: string | null; policy: string | null; subdomain_policy: string | null; rua: string | null; ruf: string | null };
  dkim_selectors_found: string[];
  bimi?: { found: boolean; record: string | null; logo_url: string | null; authority_url: string | null };
  mta_sts?: { dns_found: boolean; policy_found: boolean; mode: string | null };
  tls_rpt?: { found: boolean; record: string | null; rua: string | null };
}
export interface HttpProtocols { http2: boolean; http3: boolean; alt_svc: string | null; }
export interface CarbonData { co2_per_view: number | null; cleaner_than: number | null; green: boolean; }
export interface RobotsParsed {
  blocks: Array<{ user_agent: string; disallow: string[]; allow: string[] }>;
  crawl_delay: number | null; sitemaps: string[]; interesting_blocked: string[];
  is_restrictive: boolean; is_missing: boolean;
}
export interface JsonLdItem { type: string; name: string | null; description: string | null; url: string | null; }

export interface RecentLookupsResult {
  lookups: Array<{ id: number; domain: string; analyzed_at: string; is_up: boolean | null; ssl_grade: string | null }>;
}
export interface SubdomainsResult { subdomains: string[]; cached: boolean; }
export interface CompanyInfoResult {
  company: {
    name: string | null; description: string | null; founded: string | null;
    ceo: string | null; hq: string | null; industry: string | null;
    employees: number | null; exchange: string | null; ticker: string | null;
    logo_url: string | null; wikidata_id: string | null;
    revenue: string | null;
    parent_org: string | null;
    social_links: { platform: string; url: string }[];
    source: string;
  } | null;
  stock: {
    price: number | null; change: number | null; change_percent: number | null;
    market_cap: number | null; volume: number | null;
    high_52w: number | null; low_52w: number | null; currency: string | null;
  } | null;
  crunchbase_url: string | null;
  cached: boolean;
}
export interface NewsResult {
  google_news: Array<{ title: string; link: string; source: string | null; pub_date: string | null }>;
  hacker_news: Array<{ title: string; url: string | null; points: number; num_comments: number; created_at: string }>;
  cached: boolean;
}
export interface SocialResult {
  accounts: Array<{ platform: string; url: string; username: string | null; found_via: string }>;
  cached: boolean;
}
export interface ReverseIPResult { domains: string[]; cached: boolean; }

// ─── New v2 types ────────────────────────────────────────────────────

export interface ShodanData { ports: number[]; cpes: string[]; vulns: string[]; tags: string[]; hostnames: string[]; }
export interface DnssecData { enabled: boolean; has_dnskey: boolean; has_ds: boolean; validated: boolean; }
export interface HostingData { provider: string | null; cdn: string | null; waf: string | null; }
export interface SocialMetaData {
  og: { title: string | null; description: string | null; image: string | null; type: string | null; url: string | null; site_name: string | null; locale: string | null };
  twitter: { card: string | null; site: string | null; creator: string | null; title: string | null; description: string | null; image: string | null };
  score: number; missing: string[];
}
export interface LegalData { pages_found: Array<{ name: string; url: string }>; cookie_consent_detected: boolean; consent_provider: string | null; }
export interface CookieSecurityData { cookies: Array<{ name: string; secure: boolean; httponly: boolean; samesite: string | null }>; issues: string[]; }
export interface CompressionData { encoding: string | null; vary_accept_encoding: boolean; }
export interface AiReadinessData { score: number; max_score: number; grade: string; checks: Array<{ name: string; passed: boolean; points: number }>; rss_feed: string | null; }
export interface HealthScoreData { score: number; max_score: number; grade: string; breakdown: Record<string, number>; }

export interface WordPressPlugin { slug: string; name: string; category: string | null; }
export interface WordPressData {
  detected: true;
  version: string | null;
  theme: { name: string; slug: string } | null;
  parent_theme: { name: string; slug: string } | null;
  plugins: WordPressPlugin[];
  page_builder: string | null;
  caching_plugin: string | null;
  seo_plugin: string | null;
  security_plugin: string | null;
  ecommerce: string | null;
  managed_hosting: string | null;
  api_exposed: boolean;
  block_editor: boolean;
  multisite: boolean;
}

export interface BreachItem {
  name: string;
  title: string;
  domain: string;
  breach_date: string;
  added_date: string;
  pwn_count: number;
  data_classes: string[];
  description: string;
  logo_url: string;
  is_verified: boolean;
  is_fabricated: boolean;
  is_sensitive: boolean;
  is_spam_list: boolean;
  is_malware: boolean;
}
export interface BreachData {
  found: boolean;
  count: number;
  total_pwned: number;
  items: BreachItem[];
}

export interface AvailabilityResult {
  results: Array<{
    node: string;
    location: { country_code: string; country: string; city: string; ip: string; asn: string };
    status: "up" | "down" | "pending" | "error";
    status_code: number | null;
    response_time_ms: number | null;
    ip: string | null;
    message: string | null;
  }>;
  request_id: string | null;
  permanent_link: string | null;
}

export interface DomainSuggestion {
  domain: string;
  available: boolean | null;
  registrable: boolean | null;
  pricing: { registration: string; renewal: string; currency: string } | null;
  source: "cf_search" | "cf_check" | "dns" | "rdap" | "generated";
}

export interface DomainSuggestionsResult {
  suggestions: DomainSuggestion[];
}

// ─── Tier 1 feature types ────────────────────────────────────────────

export interface CertTransparencyData {
  subdomains: string[];
  total_certs: number;
  has_wildcard: boolean;
  issuers: string[];
  error: string | null;
}

export interface SecurityTxtData {
  found: boolean;
  contact: string[];
  encryption: string | null;
  acknowledgments: string | null;
  policy: string | null;
  hiring: string | null;
  canonical: string | null;
  preferred_languages: string | null;
  expires: string | null;
  is_expired: boolean;
  has_bug_bounty: boolean;
  bug_bounty_platform: string | null;
  raw: string | null;
}

export interface GreenHostingData {
  green: boolean;
  hosted_by: string | null;
  hosted_by_website: string | null;
  error: string | null;
}

export interface WellKnownEndpointData {
  path: string;
  name: string;
  found: boolean;
  data: Record<string, unknown> | null;
}

export interface WellKnownData {
  endpoints: WellKnownEndpointData[];
  pwa_ready: boolean;
  has_mobile_apps: boolean;
  ads_partner_count: number | null;
}

export interface CaaRecord {
  flags: number;
  tag: string;
  value: string;
  ca_name: string;
}

export interface CaaAnalysisData {
  records: CaaRecord[];
  has_wildcard_policy: boolean;
  iodef: string | null;
  has_caa: boolean;
}

export interface GreynoiseData {
  ip: string;
  classification: string | null;
  name: string | null;
  link: string | null;
  noise: boolean;
  riot: boolean;
  error: string | null;
}
