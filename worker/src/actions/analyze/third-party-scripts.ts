// ─── Third-Party Script Analysis ─────────────────────────────────────
// Categorize external JavaScript loaded on the page by origin and purpose.

export interface ScriptInfo {
  url: string;
  domain: string;
  async: boolean;
  defer: boolean;
}

export interface ScriptCategory {
  scripts: ScriptInfo[];
  count: number;
}

export interface ThirdPartyScriptsResult {
  total: number;
  first_party: number;
  third_party: number;
  categories: Record<string, ScriptCategory>;
  privacy_concerns: string[];
  render_blocking: number;
}

// ─── Category Patterns ──────────────────────────────────────────────

interface CategoryPattern {
  category: string;
  patterns: RegExp[];
}

const CATEGORY_PATTERNS: CategoryPattern[] = [
  {
    category: "Analytics",
    patterns: [
      /google-analytics\.com/i, /googletagmanager\.com/i, /gtag/i,
      /segment\.(com|io)/i, /mixpanel\.com/i, /hotjar\.com/i,
      /plausible\.io/i, /usefathom\.com/i, /fathom/i,
      /amplitude\.com/i, /heap(analytics)?\.com/i,
      /matomo\.(org|cloud)/i, /piwik/i, /umami\./i,
      /analytics\.google\.com/i, /ga\.js/i, /gtm\.js/i,
      /stats\.wp\.com/i, /parsely\.com/i, /chartbeat\.com/i,
      /clicky\.com/i, /statcounter\.com/i,
    ],
  },
  {
    category: "Advertising",
    patterns: [
      /doubleclick\.net/i, /googlesyndication\.com/i, /googleadservices\.com/i,
      /facebook\.net\/.*tr/i, /fbevents\.js/i,
      /ads-twitter\.com/i, /ads\.twitter\.com/i,
      /bat\.bing\.com/i,
      /criteo\.(com|net)/i, /taboola\.com/i, /outbrain\.com/i,
      /adroll\.com/i, /pubmatic\.com/i, /rubiconproject\.com/i,
      /amazon-adsystem\.com/i, /advertising\.com/i,
      /bidswitch\.net/i, /casalemedia\.com/i,
    ],
  },
  {
    category: "Social",
    patterns: [
      /platform\.twitter\.com/i, /platform\.x\.com/i,
      /connect\.facebook\.net/i,
      /platform\.linkedin\.com/i,
      /assets\.pinterest\.com/i, /pinimg\.com.*pinit/i,
      /apis\.google\.com\/.*plusone/i,
      /addthis\.com/i, /sharethis\.com/i,
      /addtoany\.com/i,
    ],
  },
  {
    category: "Chat / Support",
    patterns: [
      /widget\.intercom\.io/i, /intercomcdn\.com/i,
      /js\.driftt\.com/i, /drift\.com/i,
      /static\.zdassets\.com/i, /zendesk\.com/i,
      /embed\.tawk\.to/i, /tawk\.to/i,
      /client\.crisp\.chat/i, /crisp\.chat/i,
      /freshdesk\.com/i, /freshchat\.com/i,
      /js\.hs-scripts\.com/i, /hubspot\.com/i,
      /livechatinc\.com/i, /tidio\.co/i,
      /olark\.com/i,
    ],
  },
  {
    category: "Heatmaps / Session Recording",
    patterns: [
      /static\.hotjar\.com/i, /hotjar\.com/i,
      /cdn\.mouseflow\.com/i, /mouseflow\.com/i,
      /fullstory\.com/i, /edge\.fullstory\.com/i,
      /clarity\.ms/i,
      /script\.crazyegg\.com/i, /crazyegg\.com/i,
      /cdn\.logrocket\.(com|io)/i, /logrocket\.com/i,
      /smartlook\.com/i, /rec\.smartlook\.com/i,
      /cdn\.luckyorange\.com/i, /luckyorange\.com/i,
    ],
  },
  {
    category: "CDN / Libraries",
    patterns: [
      /cdnjs\.cloudflare\.com/i,
      /cdn\.jsdelivr\.net/i, /jsdelivr\.net/i,
      /unpkg\.com/i,
      /ajax\.googleapis\.com/i,
      /code\.jquery\.com/i,
      /stackpath\.bootstrapcdn\.com/i, /bootstrapcdn\.com/i,
      /cdn\.tailwindcss\.com/i,
      /polyfill\.io/i,
      /fonts\.googleapis\.com/i,
    ],
  },
  {
    category: "Performance / Monitoring",
    patterns: [
      /js-agent\.newrelic\.com/i, /newrelic\.com/i, /nr-data\.net/i,
      /datadoghq\.com/i, /datadog-rum/i,
      /browser\.sentry-cdn\.com/i, /sentry\.io/i,
      /bugsnag\.com/i, /d2wy8f7a9ursnm\.cloudfront\.net.*bugsnag/i,
      /cdn\.rollbar\.com/i, /rollbar\.com/i,
      /cdn\.speedcurve\.com/i, /rum\.speedcurve\.com/i,
      /raygun\.io/i,
    ],
  },
  {
    category: "Consent / Privacy",
    patterns: [
      /cookiebot\.com/i, /consent\.cookiebot/i,
      /cdn\.cookielaw\.org/i, /onetrust\.com/i, /optanon/i,
      /cookie-script\.com/i,
      /quantcast\.com.*choice/i, /quantcast\.mgr/i,
      /iubenda\.com/i,
      /consent\.trustarc\.com/i, /trustarc\.com/i, /truste\.com/i,
      /didomi\.io/i, /sdk\.privacy-center/i,
      /osano\.com/i,
      /complianz/i,
      /cookieyes\.com/i, /cdn-cookieyes\.com/i,
    ],
  },
  {
    category: "Payment",
    patterns: [
      /js\.stripe\.com/i, /m\.stripe\.(com|network)/i,
      /pay\.google\.com/i, /payments\.google\.com/i,
      /paypal\.com\/sdk/i, /paypalobjects\.com/i,
      /js\.braintreegateway\.com/i, /braintree/i,
      /checkout\.shopify\.com/i,
      /square\.com.*web-payments/i,
      /klarna\.com/i, /afterpay\.com/i,
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    // Handle protocol-relative URLs
    const fullUrl = url.startsWith("//") ? `https:${url}` : url;
    const parsed = new URL(fullUrl);
    return parsed.hostname;
  } catch { /* malformed URL */
    // Try basic extraction
    const match = url.match(/(?:https?:)?\/\/([^/]+)/);
    return match?.[1] ?? url;
  }
}

function categorizeScript(url: string): string {
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(url)) return category;
    }
  }
  return "Other";
}

function isFirstParty(scriptDomain: string, pageDomain: string): boolean {
  // Normalize domains for comparison
  const normalize = (d: string) => d.replace(/^www\./, "").toLowerCase();
  const sd = normalize(scriptDomain);
  const pd = normalize(pageDomain);

  // Exact match
  if (sd === pd) return true;

  // Subdomain of page domain
  if (sd.endsWith(`.${pd}`)) return true;

  // Same registered domain (basic check: compare last 2 parts)
  const sdParts = sd.split(".");
  const pdParts = pd.split(".");
  if (sdParts.length >= 2 && pdParts.length >= 2) {
    const sdRoot = sdParts.slice(-2).join(".");
    const pdRoot = pdParts.slice(-2).join(".");
    if (sdRoot === pdRoot) return true;
  }

  return false;
}

// ─── Main Analysis ──────────────────────────────────────────────────

export function analyzeThirdPartyScripts(html: string, domain: string): ThirdPartyScriptsResult {
  const categories: Record<string, ScriptCategory> = {};
  const privacyConcerns: string[] = [];
  let firstPartyCount = 0;
  let thirdPartyCount = 0;
  let renderBlocking = 0;

  // Extract all <script src="..."> tags
  const scriptMatches = [...html.matchAll(/<script[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)];

  // Also check for the tag attributes around the src
  for (const match of scriptMatches) {
    const fullTag = match[0];
    const url = match[1];
    if (!url) continue;

    // Skip inline data URIs and blobs
    if (url.startsWith("data:") || url.startsWith("blob:")) continue;

    // Determine if it's a relative URL (first party) or external
    const isRelative = !url.startsWith("http") && !url.startsWith("//");
    const scriptDomain = isRelative ? domain : extractDomain(url);
    const isAsync = /\basync\b/i.test(fullTag);
    const isDefer = /\bdefer\b/i.test(fullTag);
    const isModule = /\btype\s*=\s*["']module["']/i.test(fullTag);

    const script: ScriptInfo = {
      url: isRelative ? url : url,
      domain: scriptDomain,
      async: isAsync,
      defer: isDefer || isModule, // modules are deferred by default
    };

    if (isRelative || isFirstParty(scriptDomain, domain)) {
      firstPartyCount++;
      // Still categorize first-party scripts for completeness
      const cat = "First Party";
      if (!categories[cat]) categories[cat] = { scripts: [], count: 0 };
      categories[cat].scripts.push(script);
      categories[cat].count++;
    } else {
      thirdPartyCount++;
      const category = categorizeScript(url);
      if (!categories[category]) categories[category] = { scripts: [], count: 0 };
      categories[category].scripts.push(script);
      categories[category].count++;

      // Check for render-blocking
      if (!isAsync && !isDefer && !isModule) {
        renderBlocking++;
      }
    }
  }

  // ─── Privacy concerns ────────────────────────────────────────────

  // Check if consent scripts exist
  const hasConsent = !!categories["Consent / Privacy"];

  // Check for tracking before consent
  const trackingCategories = ["Analytics", "Advertising", "Heatmaps / Session Recording", "Social"];
  const hasTracking = trackingCategories.some(cat => !!categories[cat]);

  if (hasTracking && !hasConsent) {
    privacyConcerns.push("Tracking scripts loaded without any consent management platform detected");
  }

  if (categories["Advertising"] && categories["Advertising"].count > 0) {
    privacyConcerns.push(`${categories["Advertising"].count} advertising script(s) detected — may set third-party cookies`);
  }

  if (categories["Heatmaps / Session Recording"] && categories["Heatmaps / Session Recording"].count > 0) {
    privacyConcerns.push(`Session recording detected (${categories["Heatmaps / Session Recording"].scripts.map(s => s.domain).join(", ")}) — records user interactions`);
  }

  // Many third-party scripts = performance and privacy concern
  if (thirdPartyCount > 15) {
    privacyConcerns.push(`High third-party script count (${thirdPartyCount}) — significant performance and privacy impact`);
  }

  if (renderBlocking > 3) {
    privacyConcerns.push(`${renderBlocking} render-blocking scripts — delays page load for users`);
  }

  const total = firstPartyCount + thirdPartyCount;

  return {
    total,
    first_party: firstPartyCount,
    third_party: thirdPartyCount,
    categories,
    privacy_concerns: privacyConcerns,
    render_blocking: renderBlocking,
  };
}
