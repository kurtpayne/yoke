import { describe, it, expect } from 'vitest';

// ─── Import production code (single source of truth) ─────────────────
import type { Axis, Severity } from '@worker/config/contextual-scoring-types';
import { SEVERITY_SCORES } from '@worker/config/scoring-thresholds';
import {
  type ArchetypeName,
  type Finding,
  ARCHETYPE_WEIGHTS,
  computeAxisScore,
  computeComposite,
  gradeFromComposite,
  contextualSeverity,
} from '@worker/actions/analyze/contextual-scoring';

type SeverityMap = Partial<Record<ArchetypeName, Severity>>;

// ─── Archetype Weight Tests ──────────────────────────────────────────

describe('Archetype Weight Profiles', () => {
  it('weights should sum to 1.0 for every archetype', () => {
    for (const [name, weights] of Object.entries(ARCHETYPE_WEIGHTS)) {
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });

  it('all archetypes should use the same fixed weights', () => {
    const archetypes: ArchetypeName[] = ["commerce", "content", "application", "corporate", "infrastructure", "institutional", "general"];
    for (const arch of archetypes) {
      const w = ARCHETYPE_WEIGHTS[arch];
      expect(w.security).toBe(0.28);
      expect(w.reliability).toBe(0.25);
      expect(w.trust).toBe(0.12);
      expect(w.performance).toBe(0.20);
      expect(w.visibility).toBe(0.15);
    }
  });

  it('security should be weighted highest', () => {
    const w = ARCHETYPE_WEIGHTS.general;
    expect(w.security).toBeGreaterThan(w.trust);
    expect(w.security).toBeGreaterThan(w.performance);
    expect(w.security).toBeGreaterThan(w.visibility);
    expect(w.security).toBeGreaterThan(w.reliability);
    expect(w.reliability).toBeGreaterThan(w.trust);
    expect(w.reliability).toBeGreaterThan(w.visibility);
  });
});

// ─── Severity Score Mapping ──────────────────────────────────────────

describe('Severity Score Mapping', () => {
  it('critical should map to 0', () => {
    expect(SEVERITY_SCORES.critical).toBe(0);
  });

  it('good should map to 100', () => {
    expect(SEVERITY_SCORES.good).toBe(100);
  });

  it('severities should be monotonically increasing', () => {
    const order: Severity[] = ["critical", "high", "medium", "low", "info", "good"];
    for (let i = 1; i < order.length; i++) {
      expect(SEVERITY_SCORES[order[i]]).toBeGreaterThan(SEVERITY_SCORES[order[i - 1]]);
    }
  });
});

// ─── Axis Score Computation ──────────────────────────────────────────

describe('Axis Score Computation', () => {
  it('should return 65 for empty findings', () => {
    expect(computeAxisScore([])).toBe(65);
  });

  it('should return 100 for all-good findings', () => {
    const findings: Finding[] = [
      { signal: "a", axis: "security", severity: "good", label: "A", tradeoff: null, weight: 5 },
      { signal: "b", axis: "security", severity: "good", label: "B", tradeoff: null, weight: 3 },
    ];
    expect(computeAxisScore(findings)).toBe(100);
  });

  it('should return 0 for all-critical findings', () => {
    const findings: Finding[] = [
      { signal: "a", axis: "security", severity: "critical", label: "A", tradeoff: null, weight: 5 },
      { signal: "b", axis: "security", severity: "critical", label: "B", tradeoff: null, weight: 3 },
    ];
    expect(computeAxisScore(findings)).toBe(0);
  });

  it('should weight findings correctly', () => {
    // One good (100) with weight 5, one critical (0) with weight 5 → 50
    const findings: Finding[] = [
      { signal: "a", axis: "security", severity: "good", label: "A", tradeoff: null, weight: 5 },
      { signal: "b", axis: "security", severity: "critical", label: "B", tradeoff: null, weight: 5 },
    ];
    expect(computeAxisScore(findings)).toBe(50);
  });

  it('should respect higher weights', () => {
    // Good (100) weight 9, Critical (0) weight 1 → should be 90
    const findings: Finding[] = [
      { signal: "a", axis: "security", severity: "good", label: "A", tradeoff: null, weight: 9 },
      { signal: "b", axis: "security", severity: "critical", label: "B", tradeoff: null, weight: 1 },
    ];
    expect(computeAxisScore(findings)).toBe(90);
  });

  it('should produce score in 0-100 range', () => {
    const severities: Severity[] = ["critical", "high", "medium", "low", "info", "good"];
    for (const s of severities) {
      const findings: Finding[] = [
        { signal: "a", axis: "security", severity: s, label: "A", tradeoff: null, weight: 3 },
      ];
      const score = computeAxisScore(findings);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ─── Composite Score Computation ─────────────────────────────────────

describe('Composite Score Computation', () => {
  it('should return 100 when all axes are 100', () => {
    const axes = { security: 100, performance: 100, reliability: 100, trust: 100, visibility: 100 };
    expect(computeComposite(axes, "general")).toBe(100);
    expect(computeComposite(axes, "commerce")).toBe(100);
  });

  it('should return 0 when all axes are 0', () => {
    const axes = { security: 0, performance: 0, reliability: 0, trust: 0, visibility: 0 };
    expect(computeComposite(axes, "general")).toBe(0);
  });

  it('should produce the same score regardless of archetype', () => {
    // With fixed weights, archetype no longer affects composite
    const axes = { security: 100, performance: 30, reliability: 30, trust: 30, visibility: 30 };
    const commerceScore = computeComposite(axes, "commerce");
    const contentScore = computeComposite(axes, "content");
    expect(commerceScore).toBe(contentScore);
  });

  it('all archetypes should produce the same composite for the same inputs', () => {
    // With fixed weights, archetype no longer changes composite
    const axes = { security: 30, performance: 30, reliability: 30, trust: 30, visibility: 100 };
    const generalScore = computeComposite(axes, "general");
    const contentScore = computeComposite(axes, "content");
    const commerceScore = computeComposite(axes, "commerce");
    expect(contentScore).toBe(generalScore);
    expect(commerceScore).toBe(generalScore);
  });

  it('should use fixed weights (Sec=0.28, Rel=0.25, Trust=0.12, Perf=0.20, Vis=0.15)', () => {
    const axes = { security: 60, performance: 80, reliability: 70, trust: 90, visibility: 50 };
    const expected = Math.round(60*0.28 + 80*0.20 + 70*0.25 + 90*0.12 + 50*0.15);
    expect(computeComposite(axes, "general")).toBe(expected);
  });

  it('composite should always be in 0-100 range', () => {
    const archetypes: ArchetypeName[] = ["commerce", "content", "application", "corporate", "infrastructure", "institutional", "general"];
    for (const arch of archetypes) {
      const score = computeComposite(
        { security: 50, performance: 50, reliability: 50, trust: 50, visibility: 50 },
        arch,
      );
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ─── Grade Assignment ────────────────────────────────────────────────

describe('Grade Assignment', () => {
  it('should assign correct grades (production thresholds)', () => {
    expect(gradeFromComposite(100)).toBe("A");
    expect(gradeFromComposite(95)).toBe("A");
    expect(gradeFromComposite(90)).toBe("A");
    expect(gradeFromComposite(89)).toBe("B+");
    expect(gradeFromComposite(85)).toBe("B+");
    expect(gradeFromComposite(84)).toBe("B");
    expect(gradeFromComposite(80)).toBe("B");
    expect(gradeFromComposite(79)).toBe("C");
    expect(gradeFromComposite(65)).toBe("C");
    expect(gradeFromComposite(64)).toBe("D");
    expect(gradeFromComposite(50)).toBe("D");
    expect(gradeFromComposite(49)).toBe("F");
    expect(gradeFromComposite(0)).toBe("F");
  });
});

// ─── Contextual Severity Rules ───────────────────────────────────────

describe('Contextual Severity', () => {
  it('should return base severity when no override exists', () => {
    expect(contextualSeverity("medium", "general", {})).toBe("medium");
  });

  it('should return overridden severity for matching archetype', () => {
    expect(contextualSeverity("medium", "commerce", { commerce: "critical" })).toBe("critical");
  });

  it('should not apply override for non-matching archetype', () => {
    expect(contextualSeverity("medium", "content", { commerce: "critical" })).toBe("medium");
  });

  // ─── Key contextual rules from the design doc ───────────────────

  it('HSTS: critical for commerce, low for content', () => {
    const overrides: SeverityMap = { commerce: "critical", application: "high", content: "low", corporate: "medium" };
    expect(contextualSeverity("medium", "commerce", overrides)).toBe("critical");
    expect(contextualSeverity("medium", "content", overrides)).toBe("low");
    expect(contextualSeverity("medium", "application", overrides)).toBe("high");
    expect(contextualSeverity("medium", "infrastructure", overrides)).toBe("medium"); // falls to base
  });

  it('CSP: high for applications, medium for content, low for corporate', () => {
    const overrides: SeverityMap = { application: "high", content: "medium", corporate: "low" };
    expect(contextualSeverity("medium", "application", overrides)).toBe("high");
    expect(contextualSeverity("medium", "content", overrides)).toBe("medium");
    expect(contextualSeverity("medium", "corporate", overrides)).toBe("low");
  });

  it('SSL grade: harsher for commerce and institutional', () => {
    const overrides: SeverityMap = { commerce: "high", institutional: "high" };
    expect(contextualSeverity("medium", "commerce", overrides)).toBe("high");
    expect(contextualSeverity("medium", "institutional", overrides)).toBe("high");
    expect(contextualSeverity("medium", "content", overrides)).toBe("medium");
  });
});

// ─── Archetype Detection (simplified inline tests) ───────────────────

describe('Archetype Detection Logic', () => {
  it('.gov domain should strongly signal institutional', () => {
    const domain = "example.gov";
    const isInstitutional = /\.(gov|edu|mil)$/i.test(domain);
    expect(isInstitutional).toBe(true);
  });

  it('.edu domain should signal institutional', () => {
    expect(/\.(gov|edu|mil)$/i.test("harvard.edu")).toBe(true);
  });

  it('.com domain should not signal institutional', () => {
    expect(/\.(gov|edu|mil)$/i.test("example.com")).toBe(false);
  });

  it('Shopify tech should signal commerce', () => {
    const tech = [{ name: "Shopify", category: "E-commerce" }];
    const commerceTech = ["shopify", "woocommerce", "magento"];
    const isCommerce = tech.some(t => commerceTech.some(c => t.name.toLowerCase().includes(c)));
    expect(isCommerce).toBe(true);
  });

  it('WordPress tech should signal content', () => {
    const tech = [{ name: "WordPress", category: "CMS" }];
    const contentTech = ["wordpress", "ghost", "hugo", "jekyll"];
    const isContent = tech.some(t => contentTech.some(c => t.name.toLowerCase().includes(c)));
    expect(isContent).toBe(true);
  });

  it('React + login paths should signal application', () => {
    const tech = [{ name: "React", category: "JavaScript Framework" }];
    const html = '<div id="root"></div><a href="/login">Log in</a>';
    const appTech = ["react", "vue", "angular"];
    const hasAppFramework = tech.some(t => appTech.some(c => t.name.toLowerCase().includes(c)));
    const hasAuth = html.includes("/login") || html.includes("/signin");
    expect(hasAppFramework).toBe(true);
    expect(hasAuth).toBe(true);
  });

  it('Organization schema should signal corporate', () => {
    const jsonLd = [{ type: "Organization" }];
    const isCorporate = jsonLd.some(j => j.type === "Organization" || j.type === "Corporation");
    expect(isCorporate).toBe(true);
  });

  it('minimal HTML should signal infrastructure', () => {
    const html = '{"status":"ok"}';
    expect(html.length < 500).toBe(true);
    expect(!html.includes("<html")).toBe(true);
  });
});

// ─── Managed Platform Detection ──────────────────────────────────────

describe('Managed Platform Detection', () => {
  const platformChecks: [RegExp, string][] = [
    [/shopify/i, "Shopify"], [/wix/i, "Wix"], [/squarespace/i, "Squarespace"],
    [/wordpress\.com/i, "WordPress.com"], [/vercel/i, "Vercel"],
    [/netlify/i, "Netlify"], [/cloudflare pages/i, "Cloudflare Pages"],
  ];

  function detectPlatform(provider: string, tech: { name: string }[]): string | null {
    for (const [re, name] of platformChecks) {
      if (re.test(provider) || tech.some(t => re.test(t.name))) return name;
    }
    return null;
  }

  it('should detect Shopify', () => {
    expect(detectPlatform("", [{ name: "Shopify" }])).toBe("Shopify");
  });

  it('should detect Vercel from hosting provider', () => {
    expect(detectPlatform("Vercel", [])).toBe("Vercel");
  });

  it('should detect Netlify', () => {
    expect(detectPlatform("Netlify", [])).toBe("Netlify");
  });

  it('should return null for custom hosting', () => {
    expect(detectPlatform("nginx", [{ name: "React" }])).toBeNull();
  });
});
