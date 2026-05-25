import { describe, it, expect } from 'vitest';

// ─── Test the Contextual Scoring Engine ──────────────────────────────
// We inline key logic here because the worker module has CF-specific imports.
// This tests the scoring math, archetype detection, and contextual severity.

// ─── Types (mirrors contextual-scoring.ts) ───────────────────────────

type Axis = "security" | "performance" | "reliability" | "trust" | "visibility";
type Severity = "critical" | "high" | "medium" | "low" | "info" | "good";
type ArchetypeName = "commerce" | "content" | "application" | "corporate" | "infrastructure" | "institutional" | "general";

interface Finding {
  signal: string;
  axis: Axis;
  severity: Severity;
  label: string;
  tradeoff: string | null;
  weight: number;
}

const SEVERITY_SCORE: Record<Severity, number> = {
  critical: 0, high: 25, medium: 50, low: 75, info: 90, good: 100,
};

const ARCHETYPE_WEIGHTS: Record<ArchetypeName, Record<Axis, number>> = {
  commerce:       { security: 0.35, performance: 0.25, reliability: 0.20, trust: 0.10, visibility: 0.10 },
  content:        { security: 0.15, performance: 0.25, reliability: 0.15, trust: 0.15, visibility: 0.30 },
  application:    { security: 0.30, performance: 0.25, reliability: 0.20, trust: 0.10, visibility: 0.15 },
  corporate:      { security: 0.20, performance: 0.15, reliability: 0.15, trust: 0.30, visibility: 0.20 },
  infrastructure: { security: 0.25, performance: 0.20, reliability: 0.30, trust: 0.10, visibility: 0.15 },
  institutional:  { security: 0.35, performance: 0.10, reliability: 0.25, trust: 0.20, visibility: 0.10 },
  general:        { security: 0.20, performance: 0.20, reliability: 0.20, trust: 0.20, visibility: 0.20 },
};

// ─── Scoring Math ────────────────────────────────────────────────────

function computeAxisScore(findings: Finding[]): number {
  if (findings.length === 0) return 75;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const f of findings) {
    weightedSum += SEVERITY_SCORE[f.severity] * f.weight;
    totalWeight += f.weight;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 75;
}

function computeComposite(axisScores: Record<Axis, number>, archetype: ArchetypeName): number {
  const weights = ARCHETYPE_WEIGHTS[archetype];
  let composite = 0;
  for (const axis of Object.keys(weights) as Axis[]) {
    composite += axisScores[axis] * weights[axis];
  }
  return Math.round(composite);
}

function toGrade(score: number): string {
  return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
}

type SeverityMap = Partial<Record<ArchetypeName, Severity>>;

function contextualSeverity(baseSeverity: Severity, archetype: ArchetypeName, overrides: SeverityMap): Severity {
  return overrides[archetype] ?? baseSeverity;
}

// ─── Archetype Weight Tests ──────────────────────────────────────────

describe('Archetype Weight Profiles', () => {
  it('weights should sum to 1.0 for every archetype', () => {
    for (const [name, weights] of Object.entries(ARCHETYPE_WEIGHTS)) {
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });

  it('general archetype should have equal weights', () => {
    const weights = ARCHETYPE_WEIGHTS.general;
    expect(weights.security).toBe(0.20);
    expect(weights.performance).toBe(0.20);
    expect(weights.reliability).toBe(0.20);
    expect(weights.trust).toBe(0.20);
    expect(weights.visibility).toBe(0.20);
  });

  it('commerce should weight security highest', () => {
    const w = ARCHETYPE_WEIGHTS.commerce;
    expect(w.security).toBeGreaterThan(w.performance);
    expect(w.security).toBeGreaterThan(w.reliability);
    expect(w.security).toBeGreaterThan(w.trust);
    expect(w.security).toBeGreaterThan(w.visibility);
  });

  it('content should weight visibility highest', () => {
    const w = ARCHETYPE_WEIGHTS.content;
    expect(w.visibility).toBeGreaterThanOrEqual(w.security);
    expect(w.visibility).toBeGreaterThanOrEqual(w.performance);
    expect(w.visibility).toBeGreaterThanOrEqual(w.reliability);
    expect(w.visibility).toBeGreaterThanOrEqual(w.trust);
  });

  it('institutional should weight security highest', () => {
    const w = ARCHETYPE_WEIGHTS.institutional;
    expect(w.security).toBeGreaterThan(w.performance);
    expect(w.security).toBeGreaterThan(w.reliability);
    expect(w.security).toBeGreaterThan(w.trust);
    expect(w.security).toBeGreaterThan(w.visibility);
  });
});

// ─── Severity Score Mapping ──────────────────────────────────────────

describe('Severity Score Mapping', () => {
  it('critical should map to 0', () => {
    expect(SEVERITY_SCORE.critical).toBe(0);
  });

  it('good should map to 100', () => {
    expect(SEVERITY_SCORE.good).toBe(100);
  });

  it('severities should be monotonically increasing', () => {
    const order: Severity[] = ["critical", "high", "medium", "low", "info", "good"];
    for (let i = 1; i < order.length; i++) {
      expect(SEVERITY_SCORE[order[i]]).toBeGreaterThan(SEVERITY_SCORE[order[i - 1]]);
    }
  });
});

// ─── Axis Score Computation ──────────────────────────────────────────

describe('Axis Score Computation', () => {
  it('should return 75 for empty findings', () => {
    expect(computeAxisScore([])).toBe(75);
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
    // Good (100) weight 9, Critical (0) weight 1 → should be close to 90
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

  it('should weight security heavily for commerce', () => {
    // High security, low everything else → commerce scores higher than content
    const axes = { security: 100, performance: 30, reliability: 30, trust: 30, visibility: 30 };
    const commerceScore = computeComposite(axes, "commerce");
    const contentScore = computeComposite(axes, "content");
    expect(commerceScore).toBeGreaterThan(contentScore);
  });

  it('should weight visibility heavily for content', () => {
    // High visibility, low everything else → content scores higher than commerce
    const axes = { security: 30, performance: 30, reliability: 30, trust: 30, visibility: 100 };
    const contentScore = computeComposite(axes, "content");
    const commerceScore = computeComposite(axes, "commerce");
    expect(contentScore).toBeGreaterThan(commerceScore);
  });

  it('general should produce the simple average', () => {
    const axes = { security: 60, performance: 80, reliability: 70, trust: 90, visibility: 50 };
    const expected = Math.round((60 + 80 + 70 + 90 + 50) / 5);
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
  it('should assign correct grades', () => {
    expect(toGrade(100)).toBe("A");
    expect(toGrade(95)).toBe("A");
    expect(toGrade(90)).toBe("A");
    expect(toGrade(89)).toBe("B");
    expect(toGrade(80)).toBe("B");
    expect(toGrade(79)).toBe("C");
    expect(toGrade(70)).toBe("C");
    expect(toGrade(69)).toBe("D");
    expect(toGrade(60)).toBe("D");
    expect(toGrade(59)).toBe("F");
    expect(toGrade(0)).toBe("F");
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
  // Test the signal-matching patterns directly

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
