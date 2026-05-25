import type { SslResult, DnssecResult, HealthScoreResult } from "./types";

// ─── NEW: Domain Health Score ───────────────────────────────────────

export function calculateHealthScore(opts: {
  ssl: SslResult | null;
  secGrade: string | null;
  dnssec: DnssecResult | null;
  headers: Record<string, string> | null;
  spf: boolean;
  dmarcPolicy: string | null;
  dkim: boolean;
  blocklistListedCount: number;
  perfScore: number | null;
  legalPagesCount: number;
  ogScore: number;
  statusCode: number | null;
  finalUrl: string | null;
  httpBlocked?: boolean;
  isSubdomain?: boolean;
}): HealthScoreResult {
  const breakdown: Record<string, number> = {};
  let score = 0;
  let maxScore = 0;

  // SSL (max 20)
  maxScore += 20;
  const sslGrade = opts.ssl?.grade;
  if (sslGrade) {
    const sslPoints = sslGrade === "Valid" ? 14 : sslGrade.startsWith("A") ? 20 : sslGrade.startsWith("B") ? 15 : sslGrade.startsWith("C") ? 10 : sslGrade.startsWith("D") ? 5 : 0;
    score += sslPoints;
    breakdown["SSL Certificate"] = sslPoints;
  } else {
    // SSL Labs didn't return — give partial credit if the site serves over HTTPS
    const servesHttps = !!opts.finalUrl?.startsWith("https://");
    const fallbackSsl = servesHttps ? 12 : 0;
    score += fallbackSsl;
    breakdown["SSL Certificate"] = fallbackSsl;
  }

  // Security headers (max 15) — skip if HTTP was blocked (we have no real headers)
  if (!opts.httpBlocked) {
    maxScore += 15;
    const sg = opts.secGrade;
    if (sg && sg !== "N/A") {
      const secPoints = sg === "A" ? 15 : sg === "B" ? 10 : sg === "C" ? 7 : sg === "D" ? 3 : 0;
      score += secPoints;
      breakdown["Security Headers"] = secPoints;
    } else {
      breakdown["Security Headers"] = 0;
    }
  }

  // DNSSEC (max 5)
  maxScore += 5;
  const dnssecPoints = opts.dnssec?.enabled ? 5 : 0;
  score += dnssecPoints;
  breakdown["DNSSEC"] = dnssecPoints;

  // HSTS (max 5) — skip if HTTP was blocked
  if (!opts.httpBlocked) {
    maxScore += 5;
    const hstsPoints = opts.headers?.["strict-transport-security"] ? 5 : 0;
    score += hstsPoints;
    breakdown["HSTS"] = hstsPoints;
  }

  // Email auth (max 11) — skip for subdomains (email is managed at parent level)
  if (!opts.isSubdomain) {
    maxScore += 11;
    let emailPoints = 0;
    if (opts.spf) emailPoints += 3;
    if (opts.dmarcPolicy === "reject") emailPoints += 5;
    else if (opts.dmarcPolicy === "quarantine") emailPoints += 4;
    else if (opts.dmarcPolicy === "none") emailPoints += 2;
    if (opts.dkim) emailPoints += 3;
    score += emailPoints;
    breakdown["Email Auth"] = emailPoints;
  }

  // Blocklists (max 5)
  maxScore += 5;
  const blPoints = Math.max(0, 5 - opts.blocklistListedCount * 2);
  score += blPoints;
  breakdown["Blocklists"] = blPoints;

  // Performance (max 5)
  maxScore += 5;
  const perfPoints = (opts.perfScore ?? 0) > 80 ? 5 : (opts.perfScore ?? 0) > 50 ? 3 : (opts.perfScore ?? 0) > 30 ? 1 : 0;
  score += perfPoints;
  breakdown["Performance"] = perfPoints;

  // Legal pages (max 3) — skip if HTTP was blocked
  if (!opts.httpBlocked) {
    maxScore += 3;
    const legalPoints = opts.legalPagesCount >= 2 ? 3 : opts.legalPagesCount === 1 ? 2 : 0;
    score += legalPoints;
    breakdown["Legal Pages"] = legalPoints;
  }

  // OG tags (max 2) — skip if HTTP was blocked
  if (!opts.httpBlocked) {
    maxScore += 2;
    const ogPoints = opts.ogScore >= 80 ? 2 : opts.ogScore >= 50 ? 1 : 0;
    score += ogPoints;
    breakdown["Social Meta"] = ogPoints;
  }

  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const grade = pct >= 90 ? "A" : pct >= 75 ? "B" : pct >= 55 ? "C" : pct >= 35 ? "D" : "F";

  return { score, max_score: maxScore, grade, breakdown };
}

// ─── Screenshot URL ──────────────────────────────────────────────────

export function getScreenshotUrl(domain: string): string {
  return `https://api.microlink.io?url=https://${encodeURIComponent(domain)}&screenshot=true&meta=false&embed=screenshot.url`;
}
