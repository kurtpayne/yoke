import { describe, it, expect } from 'vitest';

// ─── Structured Data Validation Tests ────────────────────────────────
// Tests the JSON-LD validation logic against schema.org specifications.

// ─── Types (mirrors structured-data.ts) ──────────────────────────────

interface FieldValidation {
  field: string;
  status: "present" | "missing" | "recommended";
  value?: string;
}

interface SchemaValidation {
  type: string;
  status: "complete" | "partial" | "missing_required";
  required_fields: FieldValidation[];
  recommended_fields: FieldValidation[];
}

interface SchemaSpec {
  required: string[];
  recommended: string[];
}

const SCHEMA_SPECS: Record<string, SchemaSpec> = {
  Organization: { required: ["name", "url"], recommended: ["logo", "description", "sameAs"] },
  Product: { required: ["name"], recommended: ["description", "image", "offers", "brand"] },
  Article: { required: ["headline", "author", "datePublished"], recommended: ["image", "dateModified", "publisher"] },
  BlogPosting: { required: ["headline", "author", "datePublished"], recommended: ["image", "dateModified", "publisher"] },
  WebSite: { required: ["name", "url"], recommended: ["description", "potentialAction"] },
  BreadcrumbList: { required: ["itemListElement"], recommended: [] },
  FAQPage: { required: ["mainEntity"], recommended: ["name", "description"] },
  Event: { required: ["name", "startDate", "location"], recommended: ["description", "endDate", "image"] },
  VideoObject: { required: ["name", "description", "thumbnailUrl", "uploadDate"], recommended: ["contentUrl", "duration"] },
};

// ─── Validation Logic (simplified inline) ────────────────────────────

function hasField(raw: Record<string, unknown>, field: string): boolean {
  const val = raw[field];
  if (val === null || val === undefined) return false;
  if (typeof val === "string" && val.trim() === "") return false;
  if (Array.isArray(val) && val.length === 0) return false;
  return true;
}

function validate(type: string, raw: Record<string, unknown>): SchemaValidation {
  const spec = SCHEMA_SPECS[type];
  if (!spec) return { type, status: "complete", required_fields: [], recommended_fields: [] };

  const requiredFields: FieldValidation[] = spec.required.map(field => ({
    field,
    status: hasField(raw, field) ? "present" : "missing",
  }));

  const recommendedFields: FieldValidation[] = spec.recommended.map(field => ({
    field,
    status: hasField(raw, field) ? "present" : "recommended",
  }));

  const missingRequired = requiredFields.filter(f => f.status === "missing").length;
  const status: SchemaValidation["status"] =
    missingRequired === 0 ? "complete" :
    missingRequired < spec.required.length ? "partial" :
    "missing_required";

  return { type, status, required_fields: requiredFields, recommended_fields: recommendedFields };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Organization Schema', () => {
  it('should pass with all required fields', () => {
    const result = validate("Organization", { name: "Yoke", url: "https://yoke.lol" });
    expect(result.status).toBe("complete");
    expect(result.required_fields.every(f => f.status === "present")).toBe(true);
  });

  it('should fail when name is missing', () => {
    const result = validate("Organization", { url: "https://yoke.lol" });
    expect(result.status).toBe("partial");
    expect(result.required_fields.find(f => f.field === "name")?.status).toBe("missing");
  });

  it('should fail when all required fields missing', () => {
    const result = validate("Organization", {});
    expect(result.status).toBe("missing_required");
  });

  it('should flag recommended fields', () => {
    const result = validate("Organization", { name: "Test", url: "https://test.com" });
    expect(result.recommended_fields.some(f => f.status === "recommended")).toBe(true);
  });
});

describe('Product Schema', () => {
  it('should pass with just name (only required field)', () => {
    const result = validate("Product", { name: "Widget" });
    expect(result.status).toBe("complete");
  });

  it('should fail without name', () => {
    const result = validate("Product", { description: "A widget" });
    expect(result.status).toBe("missing_required");
  });

  it('should flag missing recommended fields', () => {
    const result = validate("Product", { name: "Widget" });
    const recommended = result.recommended_fields.filter(f => f.status === "recommended");
    expect(recommended.length).toBeGreaterThan(0);
    expect(recommended.some(f => f.field === "description")).toBe(true);
  });
});

describe('Article Schema', () => {
  it('should pass with all required fields', () => {
    const result = validate("Article", {
      headline: "Test Article",
      author: { name: "John" },
      datePublished: "2024-01-01",
    });
    expect(result.status).toBe("complete");
  });

  it('should be partial when author is missing', () => {
    const result = validate("Article", {
      headline: "Test Article",
      datePublished: "2024-01-01",
    });
    expect(result.status).toBe("partial");
  });

  it('should treat empty string as missing', () => {
    const result = validate("Article", {
      headline: "",
      author: "John",
      datePublished: "2024-01-01",
    });
    expect(result.required_fields.find(f => f.field === "headline")?.status).toBe("missing");
  });

  it('should treat empty array as missing', () => {
    const result = validate("BreadcrumbList", { itemListElement: [] });
    expect(result.status).toBe("missing_required");
  });
});

describe('Event Schema', () => {
  it('should require name, startDate, and location', () => {
    const result = validate("Event", { name: "Conference" });
    expect(result.status).toBe("partial");
    const missing = result.required_fields.filter(f => f.status === "missing");
    expect(missing.map(f => f.field)).toContain("startDate");
    expect(missing.map(f => f.field)).toContain("location");
  });

  it('should pass with all three required fields', () => {
    const result = validate("Event", {
      name: "Conference",
      startDate: "2024-06-01",
      location: { name: "Convention Center" },
    });
    expect(result.status).toBe("complete");
  });
});

describe('Unknown Schema Types', () => {
  it('should return complete for unknown types (no spec to violate)', () => {
    const result = validate("CustomType", { anything: "goes" });
    expect(result.status).toBe("complete");
    expect(result.required_fields).toEqual([]);
    expect(result.recommended_fields).toEqual([]);
  });
});

describe('hasField edge cases', () => {
  it('should treat null as missing', () => {
    expect(hasField({ a: null }, "a")).toBe(false);
  });

  it('should treat undefined as missing', () => {
    expect(hasField({}, "a")).toBe(false);
  });

  it('should treat empty string as missing', () => {
    expect(hasField({ a: "" }, "a")).toBe(false);
  });

  it('should treat whitespace-only string as missing', () => {
    expect(hasField({ a: "   " }, "a")).toBe(false);
  });

  it('should treat empty array as missing', () => {
    expect(hasField({ a: [] }, "a")).toBe(false);
  });

  it('should accept non-empty values', () => {
    expect(hasField({ a: "hello" }, "a")).toBe(true);
    expect(hasField({ a: 0 }, "a")).toBe(true);
    expect(hasField({ a: false }, "a")).toBe(true);
    expect(hasField({ a: [1] }, "a")).toBe(true);
    expect(hasField({ a: {} }, "a")).toBe(true);
  });
});

// ─── Subdomain Prefix List Sanity ────────────────────────────────────

describe('Subdomain Prefix List', () => {
  // Core high-value prefixes that must be in any subdomain enumeration list
  const CRITICAL_PREFIXES = [
    "www", "mail", "api", "app", "dev", "staging", "admin", "blog",
    "cdn", "ftp", "smtp", "imap", "pop", "webmail", "status",
    "shop", "store", "docs", "test", "beta", "ns1", "ns2",
  ];

  it('critical prefixes should all be valid DNS labels', () => {
    for (const prefix of CRITICAL_PREFIXES) {
      // DNS labels: 1-63 chars, alphanumeric + hyphens, no leading/trailing hyphens
      expect(prefix).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
      expect(prefix.length).toBeLessThanOrEqual(63);
    }
  });

  it('should have no duplicates in critical list', () => {
    const unique = new Set(CRITICAL_PREFIXES);
    expect(unique.size).toBe(CRITICAL_PREFIXES.length);
  });

  it('critical prefixes should cover key categories', () => {
    expect(CRITICAL_PREFIXES).toContain("api");     // API
    expect(CRITICAL_PREFIXES).toContain("mail");    // Mail
    expect(CRITICAL_PREFIXES).toContain("dev");     // Dev
    expect(CRITICAL_PREFIXES).toContain("cdn");     // Infra
    expect(CRITICAL_PREFIXES).toContain("admin");   // Admin
    expect(CRITICAL_PREFIXES).toContain("shop");    // Commerce
    expect(CRITICAL_PREFIXES).toContain("docs");    // Documentation
    expect(CRITICAL_PREFIXES).toContain("blog");    // Marketing
    expect(CRITICAL_PREFIXES).toContain("status");  // Monitoring
  });
});
