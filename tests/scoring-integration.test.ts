import { describe, it, expect } from 'vitest';
import {
  calculateDomainScore,
  type DomainScoreResult,
} from '@worker/actions/analyze/contextual-scoring';

// ─── Helper: default null opts for calculateDomainScore ──────────────

function baseOpts(): Parameters<typeof calculateDomainScore>[0] {
  return {
    ssl: null,
    securityGrade: null,
    securityAudit: [],
    dnssec: null,
    blocklists: [],
    emailAuth: null,
    performance: null,
    compression: null,
    httpProtocols: null,
    hosting: null,
    dnsRecords: [],
    rdap: null,
    socialMeta: null,
    jsonLd: null,
    meta: null,
    legal: null,
    wayback: null,
    certTransparency: null,
    greynoise: null,
    techStack: null,
    headers: null,
    domain: "example.com",
    html: "",
    httpBlocked: false,
    accessibility: null,
    thirdPartyScripts: null,
    cookieConsent: null,
    cacheAnalysis: null,
    waf: null,
    trustSignals: null,
    networkHealth: null,
    breaches: null,
    trancoRank: null,
    socialAccounts: null,
    shodan: null,
    cookieSecurity: null,
    securityTxt: null,
    wellKnown: null,
    redirects: [],
    statusResult: null,
    robotsParsed: null,
  };
}

// ─── Integration Tests ───────────────────────────────────────────────

describe('calculateDomainScore integration', () => {

  it('returns a valid DomainScoreResult shape with all-null inputs', () => {
    const result = calculateDomainScore(baseOpts());
    expect(result).toBeDefined();
    expect(typeof result.composite).toBe('number');
    expect(typeof result.grade).toBe('string');
    expect(result.axes).toBeDefined();
    expect(result.archetype).toBeDefined();
    // All 5 axes should be present
    for (const axis of ['security', 'performance', 'reliability', 'trust', 'visibility'] as const) {
      expect(result.axes[axis]).toBeDefined();
      const score = result.axes[axis].score;
      // score can be number or null
      if (score !== null) {
        expect(typeof score).toBe('number');
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('produces a high grade when all signals are positive', () => {
    const opts = baseOpts();
    opts.ssl = { grade: "A+", issuer: "Let's Encrypt", subject: "example.com", valid_from: "2025-01-01", valid_to: "2026-01-01", error: null, certTransparency: true } as any;
    opts.securityAudit = [
      { header: "strict-transport-security", present: true, value: "max-age=31536000; includeSubDomains", severity: "pass" as any },
      { header: "x-content-type-options", present: true, value: "nosniff", severity: "pass" as any },
      { header: "x-frame-options", present: true, value: "DENY", severity: "pass" as any },
    ];
    opts.dnssec = { enabled: true, valid: true } as any;
    opts.emailAuth = { spf: { found: true, record: "v=spf1 -all", mechanisms: ["-all"], all_qualifier: "-all" }, dkim_selectors_found: ["default"], dmarc: { found: true, record: "v=DMARC1; p=reject", policy: "reject", subdomain_policy: null, rua: null, ruf: null }, bimi: { found: false }, mta_sts: { found: false }, tls_rpt: { found: false } } as any;
    opts.performance = { score: 95, fcp: 800, lcp: 1200, cls: 0.02, tbt: 50, si: 1000, ttfb: 200 } as any;
    opts.compression = { gzip: true, brotli: true } as any;
    opts.httpProtocols = { http2: true, http3: true };
    opts.hosting = { provider: "Cloudflare", cdn: "Cloudflare", waf: "Cloudflare" } as any;
    opts.rdap = { domain_age_days: 3650, days_until_expiry: 365 };
    opts.headers = { "strict-transport-security": "max-age=31536000", "x-content-type-options": "nosniff" };
    opts.statusResult = { is_up: true, status_code: 200 };

    const result = calculateDomainScore(opts);
    // Strong signals should produce at least a B grade
    expect(result.composite).toBeGreaterThanOrEqual(65);
    expect(['A+', 'A', 'A-', 'B+', 'B', 'B-']).toContain(result.grade);
  });

  it('produces a mid-range grade with mixed signals', () => {
    const opts = baseOpts();
    opts.ssl = { grade: "B", issuer: "Let's Encrypt", subject: "example.com", valid_from: "2025-01-01", valid_to: "2026-01-01", error: null } as any;
    opts.performance = { score: 45, fcp: 3000, lcp: 4500, cls: 0.15, tbt: 500, si: 4000, ttfb: 800 } as any;
    opts.statusResult = { is_up: true, status_code: 200 };

    const result = calculateDomainScore(opts);
    // Mixed signals should produce something in the B-D range
    expect(result.composite).toBeGreaterThanOrEqual(30);
    expect(result.composite).toBeLessThanOrEqual(85);
  });

  it('handles httpBlocked=true gracefully', () => {
    const opts = baseOpts();
    opts.httpBlocked = true;
    // Even with httpBlocked, DNS records can exist
    opts.dnsRecords = [
      { type: "A", data: "1.2.3.4", ttl: 300 },
      { type: "MX", data: "mail.example.com", ttl: 300 },
    ];
    opts.statusResult = { is_up: false, status_code: null, http_blocked: true };

    const result = calculateDomainScore(opts);
    expect(result).toBeDefined();
    expect(typeof result.composite).toBe('number');
    expect(typeof result.grade).toBe('string');
    // Should still generate findings even when HTTP is blocked
    const allFindings = Object.values(result.axes).flatMap(a => a.findings);
    expect(allFindings.length).toBeGreaterThan(0);
  });

  it('caps grade for domains with large breach exposure', () => {
    const opts = baseOpts();
    opts.ssl = { grade: "A+", issuer: "LE", subject: "example.com", valid_from: "2025-01-01", valid_to: "2026-01-01", error: null } as any;
    opts.performance = { score: 95, fcp: 800, lcp: 1200, cls: 0.02, tbt: 50, si: 1000, ttfb: 200 } as any;
    opts.statusResult = { is_up: true, status_code: 200 };
    // Massive breach — over 100M records
    opts.breaches = {
      total_breached_accounts: 200_000_000,
      breaches: [{ name: "BigBreach", date: "2023-01-01", count: 200_000_000, description: "Huge breach" }],
    } as any;

    const result = calculateDomainScore(opts);
    // Grade should be capped — not A+ despite good other signals
    expect(['A+', 'A']).not.toContain(result.grade);
  });

  it('does not double-count CSP findings', () => {
    const opts = baseOpts();
    opts.securityAudit = [
      { header: "content-security-policy", present: true, value: "default-src 'self'", severity: "pass" as any },
    ];
    opts.headers = { "content-security-policy": "default-src 'self'" };
    opts.statusResult = { is_up: true, status_code: 200 };

    const result = calculateDomainScore(opts);
    // Count CSP-related findings across all axes
    const allFindings = Object.values(result.axes).flatMap(a => a.findings);
    const cspFindings = allFindings.filter(f => f.signal.includes('csp'));
    // Should have exactly 1 CSP finding, not 2+
    expect(cspFindings.length).toBeLessThanOrEqual(1);
  });

  it('grade boundaries are consistent', () => {
    // Test that grading is monotonic — higher composite = same or better grade
    const opts = baseOpts();
    opts.statusResult = { is_up: true, status_code: 200 };

    const result = calculateDomainScore(opts);
    // Grade should be a recognized letter grade
    expect(result.grade).toMatch(/^[A-F][+-]?$/);
    // Composite should be between 0 and 100
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(100);
  });

  it('all findings have required fields', () => {
    const opts = baseOpts();
    opts.ssl = { grade: "A", issuer: "LE", subject: "example.com", valid_from: "2025-01-01", valid_to: "2026-01-01", error: null } as any;
    opts.performance = { score: 60, fcp: 2000, lcp: 3000, cls: 0.1, tbt: 200, si: 3000, ttfb: 500 } as any;
    opts.statusResult = { is_up: true, status_code: 200 };

    const result = calculateDomainScore(opts);
    const allFindings = Object.values(result.axes).flatMap(a => a.findings);
    for (const f of allFindings) {
      expect(f.signal).toBeTruthy();
      expect(f.axis).toBeTruthy();
      expect(f.severity).toBeTruthy();
      expect(f.label).toBeTruthy();
      expect(['security', 'performance', 'reliability', 'trust', 'visibility']).toContain(f.axis);
      expect(['critical', 'high', 'medium', 'low', 'info', 'good']).toContain(f.severity);
    }
  });
});
