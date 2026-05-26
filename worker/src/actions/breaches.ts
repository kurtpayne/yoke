import { fetchWithTimeout, getFromCache, setCache, MULTI_PART_TLDS } from "../helpers";
import { BREACH_CATALOG_CACHE_TTL_MS, BREACH_RESULT_CACHE_TTL_MS } from "../config/cache";
import { logApiError } from "../api-errors";
import { logError } from "../logger";

// ─── Types ───────────────────────────────────────────────────────────

export interface HibpBreach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  ModifiedDate: string;
  PwnCount: number;
  Description: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsFabricated: boolean;
  IsSensitive: boolean;
  IsRetired: boolean;
  IsSpamList: boolean;
  IsMalware: boolean;
  IsSubscriptionFree: boolean;
  LogoPath: string;
}

export interface BreachResult {
  found: boolean;
  count: number;
  total_pwned: number;
  items: BreachItem[];
  check_failed?: boolean;
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

// 24-hour cache for the full HIBP breach catalog
// TTLs imported from config/cache.ts
// 6-hour cache for per-domain breach results

// ─── Fetch HIBP Breach Catalog ───────────────────────────────────────

let catalogCache: { data: HibpBreach[]; fetchedAt: number } | null = null;

async function getBreachCatalog(db: D1Database): Promise<HibpBreach[]> {
  // In-memory cache first (survives within a single Worker invocation chain)
  if (catalogCache && Date.now() - catalogCache.fetchedAt < BREACH_CATALOG_CACHE_TTL_MS) {
    return catalogCache.data;
  }

  // D1 cache
  const cached = await getFromCache(db, "_global_", "hibp_breaches", BREACH_CATALOG_CACHE_TTL_MS);
  if (cached) {
    const data = cached as HibpBreach[];
    catalogCache = { data, fetchedAt: Date.now() };
    return data;
  }

  // Fetch from HIBP
  try {
    const res = await fetchWithTimeout("https://haveibeenpwned.com/api/v3/breaches", {
      timeout: 10000,
      headers: {
        "User-Agent": "Yoke-Domain-Intelligence",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      logError("HIBP API error", { status: res.status, api: "hibp" });
      logApiError(db, { api: "hibp", status: res.status, message: `Breach catalog fetch failed` });
      return [];
    }

    const data = (await res.json()) as HibpBreach[];

    // Cache in D1
    try {
      await setCache(db, "_global_", "hibp_breaches", data);
    } catch (e) { console.warn('[yoke:breaches] catalog cache write failed:', e instanceof Error ? e.message : e); }

    catalogCache = { data, fetchedAt: Date.now() };
    return data;
  } catch (err) {
    logError("Failed to fetch HIBP catalog", { error: err instanceof Error ? err.message : String(err), api: "hibp" });
    logApiError(db, { api: "hibp", status: 0, message: String(err).slice(0, 100) });
    return [];
  }
}

// ─── Match Domain Against Breaches ───────────────────────────────────

function extractBaseDomain(domain: string): string {
  // Remove subdomains for matching: mail.yahoo.com → yahoo.com
  const parts = domain.split(".");
  // Handle multi-part TLDs
  const multiTlds = MULTI_PART_TLDS;
  for (const mt of multiTlds) {
    if (domain.endsWith("." + mt) || domain === mt) {
      const mtParts = mt.split(".").length;
      if (parts.length > mtParts + 1) {
        return parts.slice(parts.length - mtParts - 1).join(".");
      }
      return domain;
    }
  }
  if (parts.length > 2) {
    return parts.slice(-2).join(".");
  }
  return domain;
}

export async function checkBreaches(domain: string, db: D1Database): Promise<BreachResult> {
  // Check per-domain cache first
  const cached = await getFromCache(db, domain, "breaches", BREACH_RESULT_CACHE_TTL_MS);
  if (cached) return cached as BreachResult;

  const catalog = await getBreachCatalog(db);
  if (catalog.length === 0) {
    return { found: false, count: 0, total_pwned: 0, items: [], check_failed: true };
  }

  const normalizedDomain = domain.toLowerCase();
  const baseDomain = extractBaseDomain(normalizedDomain);

  // Match: exact domain OR base domain (for subdomain lookups)
  const matches = catalog.filter((b) => {
    if (!b.Domain) return false;
    const breachDomain = b.Domain.toLowerCase();
    const breachBase = extractBaseDomain(breachDomain);
    return (
      breachDomain === normalizedDomain ||
      breachDomain === baseDomain ||
      breachBase === baseDomain
    );
  });

  // Filter out retired, spam lists, and fabricated breaches for cleaner results
  // but keep fabricated visible with a flag
  const filtered = matches
    .filter((b) => !b.IsRetired && !b.IsSpamList)
    .sort((a, b) => new Date(b.BreachDate).getTime() - new Date(a.BreachDate).getTime());

  const items: BreachItem[] = filtered.map((b) => ({
    name: b.Name,
    title: b.Title,
    domain: b.Domain,
    breach_date: b.BreachDate,
    added_date: b.AddedDate,
    pwn_count: b.PwnCount,
    data_classes: b.DataClasses,
    description: b.Description,
    logo_url: b.LogoPath || "",
    is_verified: b.IsVerified,
    is_fabricated: b.IsFabricated,
    is_sensitive: b.IsSensitive,
    is_spam_list: b.IsSpamList,
    is_malware: b.IsMalware,
  }));

  const totalPwned = items.reduce((sum, b) => sum + b.pwn_count, 0);

  const result: BreachResult = {
    found: items.length > 0,
    count: items.length,
    total_pwned: totalPwned,
    items,
    check_failed: false,
  };

  // Cache
  try {
    await setCache(db, domain, "breaches", result);
  } catch (e) { console.warn(`[yoke:breaches] result cache write failed for ${domain}:`, e instanceof Error ? e.message : e); }

  return result;
}
