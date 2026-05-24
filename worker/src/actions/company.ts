import { normalizeDomain, fetchWithTimeout, getFromCache, setCache } from "../helpers";

interface CompanyData {
  name: string | null; description: string | null; founded: string | null;
  ceo: string | null; hq: string | null; industry: string | null;
  employees: number | null; exchange: string | null; ticker: string | null;
  logo_url: string | null; wikidata_id: string | null;
  // New enriched fields
  revenue: string | null;
  parent_org: string | null;
  social_links: { platform: string; url: string }[];
  source: string;
}

interface StockData {
  price: number | null; change: number | null; change_percent: number | null;
  market_cap: number | null; volume: number | null;
  high_52w: number | null; low_52w: number | null; currency: string | null;
}

interface CrunchbaseData {
  name: string | null;
  short_description: string | null;
  founded_on: string | null;
  hq_location: string | null;
  num_employees_enum: string | null;
  total_funding_usd: number | null;
  last_funding_type: string | null;
  last_funding_date: string | null;
  ipo_status: string | null;
  categories: string[];
  crunchbase_url: string | null;
  logo_url: string | null;
}

// Try to extract the brand name from the domain
function domainToBrandName(domain: string): string {
  // Remove TLD and common prefixes
  const parts = domain.split(".");
  if (parts.length >= 2) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  return domain;
}

async function enrichFromBrandfetch(domain: string): Promise<{ name: string | null; logo_url: string | null }> {
  try {
    const res = await fetchWithTimeout(`https://api.brandfetch.io/v2/search/${encodeURIComponent(domain)}`, {
      timeout: 5000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; YokeBot/1.0)" },
    });
    if (!res.ok) return { name: null, logo_url: null };
    const data = (await res.json()) as Array<{ domain?: string; name?: string; icon?: string; qualityScore?: number; claimed?: boolean }>;
    // Find exact domain match or best match
    const exact = data.find(d => d.domain === domain);
    const best = exact ?? data[0];
    if (best) {
      return {
        name: best.name ?? null,
        logo_url: best.icon ?? null,
      };
    }
  } catch { /* brandfetch failed */ }
  return { name: null, logo_url: null };
}

async function enrichFromWikidata(domain: string): Promise<CompanyData | null> {
  // Build URL variants for matching
  const variants = [
    `<https://${domain}>`,
    `<https://${domain}/>`,
    `<https://www.${domain}>`,
    `<https://www.${domain}/>`,
    `<http://${domain}>`,
    `<http://${domain}/>`,
    `<http://www.${domain}>`,
    `<http://www.${domain}/>`,
  ];
  const urlFilter = variants.map(u => `{ ?item wdt:P856 ${u} }`).join(" UNION ");

  const sparql = `SELECT ?item ?itemLabel ?itemDescription ?inception ?ceoLabel ?hqLabel ?industryLabel ?employees ?exchangeLabel ?ticker ?logo ?parentLabel ?revenue WHERE {
  ${urlFilter}
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P169 ?ceo . ?ceo rdfs:label ?ceoLabel . FILTER(LANG(?ceoLabel)="en") }
  OPTIONAL { ?item wdt:P159 ?hqEntity . ?hqEntity rdfs:label ?hqLabel . FILTER(LANG(?hqLabel)="en") }
  OPTIONAL { ?item wdt:P452 ?industryEntity . ?industryEntity rdfs:label ?industryLabel . FILTER(LANG(?industryLabel)="en") }
  OPTIONAL { ?item wdt:P1128 ?employees }
  OPTIONAL { ?item wdt:P414 ?exchangeEntity . ?exchangeEntity rdfs:label ?exchangeLabel . FILTER(LANG(?exchangeLabel)="en") }
  OPTIONAL { ?item wdt:P249 ?ticker }
  OPTIONAL { ?item wdt:P154 ?logo }
  OPTIONAL { ?item wdt:P749 ?parent . ?parent rdfs:label ?parentLabel . FILTER(LANG(?parentLabel)="en") }
  OPTIONAL { ?item wdt:P2139 ?revenue }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT 1`;

  try {
    const wdRes = await fetchWithTimeout(
      `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,
      { timeout: 10000, headers: { Accept: "application/sparql-results+json", "User-Agent": "YokeBot/1.0 (domain-intelligence)" } }
    );
    if (!wdRes.ok) return null;
    const wdData = await wdRes.json() as { results?: { bindings?: Array<Record<string, { value: string; type: string }>> } };
    const binding = wdData.results?.bindings?.[0];
    if (!binding) return null;

    const wikidataId = binding.item?.value?.split("/").pop() ?? null;

    // Get social links from Wikidata
    const socialLinks: { platform: string; url: string }[] = [];
    if (wikidataId) {
      try {
        const socialSparql = `SELECT ?prop ?propLabel ?value WHERE {
  wd:${wikidataId} ?directClaim ?value .
  ?prop wikibase:directClaim ?directClaim .
  FILTER(?directClaim IN (wdt:P2002, wdt:P2003, wdt:P2013, wdt:P4003, wdt:P6634, wdt:P3789))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT 10`;
        const socialRes = await fetchWithTimeout(
          `https://query.wikidata.org/sparql?query=${encodeURIComponent(socialSparql)}&format=json`,
          { timeout: 5000, headers: { Accept: "application/sparql-results+json", "User-Agent": "YokeBot/1.0" } }
        );
        if (socialRes.ok) {
          const socialData = await socialRes.json() as { results?: { bindings?: Array<Record<string, { value: string }>> } };
          for (const b of (socialData.results?.bindings ?? [])) {
            const propId = b.prop?.value?.split("/").pop() ?? "";
            const val = b.value?.value ?? "";
            const platformMap: Record<string, { name: string; urlPrefix: string }> = {
              P2002: { name: "Twitter/X", urlPrefix: "https://x.com/" },
              P2003: { name: "Instagram", urlPrefix: "https://instagram.com/" },
              P2013: { name: "Facebook", urlPrefix: "https://facebook.com/" },
              P4003: { name: "LinkedIn", urlPrefix: "https://linkedin.com/company/" },
              P6634: { name: "LinkedIn (personal)", urlPrefix: "https://linkedin.com/in/" },
              P3789: { name: "Telegram", urlPrefix: "https://t.me/" },
            };
            if (platformMap[propId]) {
              socialLinks.push({
                platform: platformMap[propId].name,
                url: val.startsWith("http") ? val : platformMap[propId].urlPrefix + val,
              });
            }
          }
        }
      } catch { /* social query failed */ }
    }

    return {
      name: binding.itemLabel?.value ?? null,
      description: binding.itemDescription?.value ?? null,
      founded: binding.inception?.value?.slice(0, 10) ?? null,
      ceo: binding.ceoLabel?.value ?? null,
      hq: binding.hqLabel?.value ?? null,
      industry: binding.industryLabel?.value ?? null,
      employees: binding.employees?.value ? parseInt(binding.employees.value) : null,
      exchange: binding.exchangeLabel?.value ?? null,
      ticker: binding.ticker?.value ?? null,
      logo_url: binding.logo?.value ?? null,
      wikidata_id: wikidataId,
      revenue: binding.revenue?.value ?? null,
      parent_org: binding.parentLabel?.value ?? null,
      social_links: socialLinks,
      source: "wikidata",
    };
  } catch { return null; }
}

// Fallback: search Wikidata by name if URL match fails
async function searchWikidataByName(domain: string): Promise<CompanyData | null> {
  const brandName = domainToBrandName(domain);
  try {
    const searchRes = await fetchWithTimeout(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(brandName)}&language=en&limit=5&format=json`,
      { timeout: 5000, headers: { "User-Agent": "YokeBot/1.0" } }
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json() as { search?: Array<{ id: string; label: string; description?: string }> };
    const candidates = searchData.search ?? [];

    // Find a candidate that's a company/business
    for (const c of candidates) {
      const desc = (c.description ?? "").toLowerCase();
      if (desc.includes("company") || desc.includes("corporation") || desc.includes("technology") ||
          desc.includes("enterprise") || desc.includes("platform") || desc.includes("service") ||
          desc.includes("software") || desc.includes("business") || desc.includes("inc.") ||
          desc.includes("startup")) {
        // Verify this entity has P856 (official website) matching our domain
        try {
          const claimsRes = await fetchWithTimeout(
            `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${c.id}&property=P856&format=json`,
            { timeout: 5000, headers: { "User-Agent": "YokeBot/1.0" } }
          );
          if (claimsRes.ok) {
            const claimsData = await claimsRes.json() as { claims?: Record<string, Array<{ mainsnak: { datavalue: { value: string } } }>> };
            const websites = claimsData.claims?.P856 ?? [];
            for (const ws of websites) {
              const url = ws.mainsnak?.datavalue?.value ?? "";
              if (url.includes(domain)) {
                // Match found! Now fetch full data
                return enrichFromWikidata(domain);
              }
            }
          }
        } catch { continue; }
      }
    }
  } catch { /* search failed */ }
  return null;
}

export async function getCompanyInfo(db: D1Database, rawDomain: string) {
  const domain = normalizeDomain(rawDomain);

  // Check company cache (24h)
  const cachedCompany = await getFromCache(db, domain, "company_info", 24 * 60 * 60 * 1000);
  if (cachedCompany) {
    const c = cachedCompany as { company: CompanyData | null; stock: StockData | null; crunchbase_url: string | null };
    const cachedStock = await getFromCache(db, domain, "stock_quote", 15 * 60 * 1000) as StockData | null;
    return { company: c.company, stock: cachedStock ?? c.stock, crunchbase_url: c.crunchbase_url, cached: true };
  }

  // Parallel: Wikidata + Brandfetch
  const [wdCompany, brandfetch] = await Promise.allSettled([
    enrichFromWikidata(domain),
    enrichFromBrandfetch(domain),
  ]);

  let company: CompanyData | null = wdCompany.status === "fulfilled" ? wdCompany.value : null;
  const bf = brandfetch.status === "fulfilled" ? brandfetch.value : null;

  // If Wikidata URL match failed, try name-based search
  if (!company) {
    company = await searchWikidataByName(domain);
  }

  // Merge Brandfetch data (logo, name) as fallback/supplement
  if (company) {
    if (!company.logo_url && bf?.logo_url) company.logo_url = bf.logo_url;
    if (!company.name && bf?.name) company.name = bf.name;
  } else if (bf?.name) {
    // Create minimal company data from Brandfetch
    company = {
      name: bf.name, description: null, founded: null, ceo: null, hq: null,
      industry: null, employees: null, exchange: null, ticker: null,
      logo_url: bf.logo_url, wikidata_id: null, revenue: null,
      parent_org: null, social_links: [], source: "brandfetch",
    };
  }

  // Build Crunchbase URL (slug is typically the lowercase brand name)
  const crunchbaseSlug = domain.split(".")[0].toLowerCase();
  const crunchbase_url = `https://www.crunchbase.com/organization/${crunchbaseSlug}`;

  let stock: StockData | null = null;

  // Fetch stock quote if ticker found
  if (company?.ticker) {
    try {
      const symbol = company.ticker;
      const yfRes = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } });
      if (yfRes.ok) {
        const yfData = await yfRes.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number; regularMarketVolume?: number; marketCap?: number; currency?: string } }> } };
        const meta = yfData.chart?.result?.[0]?.meta;
        if (meta) {
          const price = meta.regularMarketPrice ?? null;
          const prevClose = meta.previousClose ?? null;
          const change = price != null && prevClose != null ? price - prevClose : null;
          const changePct = change != null && prevClose ? (change / prevClose) * 100 : null;
          stock = {
            price, change: change ? parseFloat(change.toFixed(2)) : null,
            change_percent: changePct ? parseFloat(changePct.toFixed(2)) : null,
            market_cap: meta.marketCap ?? null, volume: meta.regularMarketVolume ?? null,
            high_52w: meta.fiftyTwoWeekHigh ?? null, low_52w: meta.fiftyTwoWeekLow ?? null,
            currency: meta.currency ?? null,
          };
          await setCache(db, domain, "stock_quote", stock);
        }
      }
    } catch { /* stock fetch failed */ }
  }

  const result = { company, stock, crunchbase_url };
  await setCache(db, domain, "company_info", result);
  return { ...result, cached: false };
}
