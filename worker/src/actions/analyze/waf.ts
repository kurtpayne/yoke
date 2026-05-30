// ─── WAF Detection ──────────────────────────────────────────────────
// Deep WAF detection from HTTP headers, cookies, and HTML patterns.
// Pure analysis — no HTTP requests. Operates on already-captured data.

export interface WafDetection {
  detected: boolean;
  provider: string | null;
  confidence: "high" | "medium" | "low";
  signals: string[];
}

interface WafSignal {
  provider: string;
  strength: number; // 3 = definitive, 2 = strong, 1 = suggestive
  signal: string;
}

// ─── Header-based detection ─────────────────────────────────────────

const HEADER_SIGNATURES: Array<{
  provider: string;
  checks: Array<{ header: string; pattern: RegExp; strength: number; signal: string }>;
}> = [
  {
    provider: "Cloudflare",
    checks: [
      { header: "server", pattern: /cloudflare/i, strength: 3, signal: "Server: cloudflare header" },
      { header: "cf-ray", pattern: /./, strength: 3, signal: "CF-Ray header present" },
      { header: "cf-cache-status", pattern: /./, strength: 2, signal: "CF-Cache-Status header" },
    ],
  },
  {
    provider: "Sucuri WAF",
    checks: [
      { header: "x-sucuri-id", pattern: /./, strength: 3, signal: "X-Sucuri-ID header" },
      { header: "x-sucuri-cache", pattern: /./, strength: 3, signal: "X-Sucuri-Cache header" },
      { header: "server", pattern: /sucuri/i, strength: 3, signal: "Server: Sucuri" },
    ],
  },
  {
    provider: "Imperva/Incapsula",
    checks: [
      { header: "x-cdn", pattern: /imperva|incapsula/i, strength: 3, signal: "X-CDN: Imperva header" },
      { header: "x-iinfo", pattern: /./, strength: 3, signal: "X-Iinfo header (Imperva)" },
    ],
  },
  {
    provider: "Akamai",
    checks: [
      { header: "server", pattern: /AkamaiGHost/i, strength: 3, signal: "Server: AkamaiGHost" },
      { header: "x-akamai-transformed", pattern: /./, strength: 3, signal: "X-Akamai-Transformed header" },
      { header: "x-akamai-request-id", pattern: /./, strength: 2, signal: "X-Akamai-Request-ID header" },
    ],
  },
  {
    provider: "AWS WAF",
    checks: [
      { header: "x-amzn-waf-action", pattern: /./, strength: 3, signal: "X-Amzn-WAF-Action header" },
      { header: "x-amzn-requestid", pattern: /./, strength: 1, signal: "X-Amzn-RequestId (AWS infrastructure)" },
    ],
  },
  {
    provider: "Barracuda WAF",
    checks: [{ header: "server", pattern: /barracuda/i, strength: 3, signal: "Server: Barracuda" }],
  },
  {
    provider: "F5 BIG-IP",
    checks: [
      { header: "server", pattern: /big-?ip/i, strength: 3, signal: "Server: BIG-IP" },
      { header: "x-cnection", pattern: /./, strength: 2, signal: "X-Cnection header (F5)" },
    ],
  },
  {
    provider: "DDoS-Guard",
    checks: [{ header: "server", pattern: /ddos-guard/i, strength: 3, signal: "Server: DDoS-Guard" }],
  },
  {
    provider: "StackPath",
    checks: [
      { header: "x-sp-waf", pattern: /./, strength: 3, signal: "X-SP-WAF header" },
      { header: "server", pattern: /stackpath/i, strength: 2, signal: "Server: StackPath" },
    ],
  },
  {
    provider: "Edgecast/Verizon",
    checks: [{ header: "server", pattern: /ecs|ecd/i, strength: 2, signal: "Server: ECS/ECD (Edgecast)" }],
  },
  {
    provider: "Reblaze",
    checks: [{ header: "server", pattern: /reblaze/i, strength: 3, signal: "Server: Reblaze" }],
  },
];

// Generic WAF signal headers (provider unknown)
const GENERIC_WAF_HEADERS: Array<{ header: string; pattern: RegExp; signal: string }> = [
  { header: "x-protected-by", pattern: /./, signal: "X-Protected-By header" },
  { header: "x-waf-status", pattern: /./, signal: "X-WAF-Status header" },
  { header: "x-waf-event-info", pattern: /./, signal: "X-WAF-Event-Info header" },
];

// ─── Cookie-based detection ─────────────────────────────────────────

const COOKIE_SIGNATURES: Array<{ provider: string; patterns: RegExp[]; strength: number; signal: string }> = [
  {
    provider: "Cloudflare",
    patterns: [/^__cf_bm=/i, /^__cfduid=/i, /^cf_clearance=/i],
    strength: 1,
    signal: "Cloudflare bot management cookie",
  },
  {
    provider: "Imperva/Incapsula",
    patterns: [/^visid_incap_/i, /^incap_ses_/i, /^nlbi_/i],
    strength: 2,
    signal: "Imperva/Incapsula session cookie",
  },
  { provider: "Sucuri WAF", patterns: [/^sucuri_cloudproxy_/i], strength: 2, signal: "Sucuri CloudProxy cookie" },
  {
    provider: "Akamai",
    patterns: [/^ak_bmsc=/i, /^bm_sz=/i, /^bm_sv=/i],
    strength: 1,
    signal: "Akamai Bot Manager cookie",
  },
  { provider: "Reblaze", patterns: [/^rbzid=/i, /^rbzsessionid=/i], strength: 2, signal: "Reblaze session cookie" },
  {
    provider: "PerimeterX",
    patterns: [/^_px[23]=/i, /^_pxhd=/i],
    strength: 2,
    signal: "PerimeterX bot detection cookie",
  },
  { provider: "DataDome", patterns: [/^datadome=/i], strength: 2, signal: "DataDome protection cookie" },
];

// ─── HTML-based detection ───────────────────────────────────────────

const HTML_SIGNATURES: Array<{ provider: string; patterns: RegExp[]; strength: number; signal: string }> = [
  {
    provider: "Wordfence",
    patterns: [/wordfence/i, /wf-resolve/i],
    strength: 2,
    signal: "Wordfence signature in HTML",
  },
  {
    provider: "ModSecurity",
    patterns: [/mod_security|modsecurity/i, /NOYB/],
    strength: 2,
    signal: "ModSecurity error page signature",
  },
  {
    provider: "Cloudflare",
    patterns: [/cf-browser-verification|Checking your browser/i, /challenges\.cloudflare\.com/i],
    strength: 2,
    signal: "Cloudflare challenge page",
  },
  { provider: "AWS WAF", patterns: [/aws-waf-token/i], strength: 2, signal: "AWS WAF token in HTML" },
  {
    provider: "Distil Networks",
    patterns: [/distil_r_blocked|x-distil-cs/i],
    strength: 2,
    signal: "Distil Networks block page",
  },
];

// ─── Main detection function ────────────────────────────────────────

export function checkWaf(
  headers: Record<string, string> | null,
  html: string,
  setCookieHeaders: string[],
): WafDetection {
  const signals: WafSignal[] = [];

  // Check response headers
  if (headers) {
    const lowerHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      lowerHeaders[k.toLowerCase()] = v;
    }

    for (const sig of HEADER_SIGNATURES) {
      for (const check of sig.checks) {
        const val = lowerHeaders[check.header];
        if (val && check.pattern.test(val)) {
          signals.push({ provider: sig.provider, strength: check.strength, signal: check.signal });
        }
      }
    }

    // Generic WAF headers
    for (const check of GENERIC_WAF_HEADERS) {
      const val = lowerHeaders[check.header];
      if (val && check.pattern.test(val)) {
        signals.push({ provider: `WAF (${val})`, strength: 1, signal: check.signal });
      }
    }
  }

  // Check cookies
  for (const cookie of setCookieHeaders) {
    for (const sig of COOKIE_SIGNATURES) {
      for (const pattern of sig.patterns) {
        if (pattern.test(cookie)) {
          signals.push({ provider: sig.provider, strength: sig.strength, signal: sig.signal });
          break; // don't match same cookie to same provider twice
        }
      }
    }
  }

  // Check HTML (first 5KB to avoid scanning huge pages)
  const htmlSnippet = html.slice(0, 5000);
  for (const sig of HTML_SIGNATURES) {
    for (const pattern of sig.patterns) {
      if (pattern.test(htmlSnippet)) {
        signals.push({ provider: sig.provider, strength: sig.strength, signal: sig.signal });
        break;
      }
    }
  }

  if (signals.length === 0) {
    return { detected: false, provider: null, confidence: "low", signals: [] };
  }

  // Pick best provider by total strength
  const providerScores = new Map<string, { total: number; signals: string[] }>();
  for (const s of signals) {
    const entry = providerScores.get(s.provider) ?? { total: 0, signals: [] };
    entry.total += s.strength;
    entry.signals.push(s.signal);
    providerScores.set(s.provider, entry);
  }

  let bestProvider = "";
  let bestScore = 0;
  for (const [provider, data] of providerScores) {
    if (data.total > bestScore) {
      bestProvider = provider;
      bestScore = data.total;
    }
  }

  // Determine confidence
  const maxStrength = Math.max(...signals.filter((s) => s.provider === bestProvider).map((s) => s.strength));
  const signalCount = providerScores.get(bestProvider)?.signals.length ?? 0;
  let confidence: "high" | "medium" | "low";
  if (maxStrength >= 3 || (signalCount >= 2 && maxStrength >= 2)) {
    confidence = "high";
  } else if (maxStrength >= 2 || signalCount >= 2) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  const allSignalStrings = providerScores.get(bestProvider)?.signals ?? [];

  return {
    detected: true,
    provider: bestProvider,
    confidence,
    signals: allSignalStrings,
  };
}
