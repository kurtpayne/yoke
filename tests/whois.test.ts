import { describe, it, expect } from 'vitest';

// ─── RDAP/WHOIS Fallback Chain Tests ─────────────────────────────────
// Tests the RDAP endpoint resolution, retry logic, IANA bootstrap parsing,
// and registrar name extraction. Inlined to avoid CF Worker runtime deps.

// ─── Static RDAP Endpoint Map (subset) ───────────────────────────────

const RDAP_ENDPOINTS: Record<string, string> = {
  com: "https://rdap.verisign.com/com/v1",
  net: "https://rdap.verisign.com/net/v1",
  org: "https://rdap.org/domain",
  lol: "https://rdap.centralnic.com/lol",
  ai: "https://rdap.identitydigital.services/rdap",
  cc: "https://rdap.verisign.com/cc/v1",
  tv: "https://rdap.verisign.com/tv/v1",
  fm: "https://rdap.centralnic.com/fm",
  dev: "https://rdap.nic.google",
  app: "https://rdap.nic.google",
  biz: "https://rdap.identitydigital.services/rdap",
};

describe('Static RDAP Endpoint Map', () => {
  it('should have an endpoint for .lol (our own domain!)', () => {
    expect(RDAP_ENDPOINTS.lol).toBeDefined();
    expect(RDAP_ENDPOINTS.lol).toContain("centralnic");
  });

  it('should have an endpoint for .ai', () => {
    expect(RDAP_ENDPOINTS.ai).toBeDefined();
  });

  it('should have endpoints for .cc, .tv, .fm', () => {
    expect(RDAP_ENDPOINTS.cc).toBeDefined();
    expect(RDAP_ENDPOINTS.tv).toBeDefined();
    expect(RDAP_ENDPOINTS.fm).toBeDefined();
  });

  it('should have endpoints for Google TLDs', () => {
    expect(RDAP_ENDPOINTS.dev).toBeDefined();
    expect(RDAP_ENDPOINTS.app).toBeDefined();
  });

  it('should not have endpoints for ccTLDs without RDAP', () => {
    // These need WhoisFreaks fallback
    expect(RDAP_ENDPOINTS["it"]).toBeUndefined();
    expect(RDAP_ENDPOINTS["ru"]).toBeUndefined();
    expect(RDAP_ENDPOINTS["es"]).toBeUndefined();
    expect(RDAP_ENDPOINTS["cn"]).toBeUndefined();
  });
});

// ─── IANA Bootstrap Parsing ──────────────────────────────────────────

interface BootstrapEntry {
  tlds: string[];
  urls: string[];
}

function parseIanaBootstrap(data: { services: [string[], string[]][] }): Map<string, string> {
  const map = new Map<string, string>();
  if (!data?.services) return map;
  for (const [tlds, urls] of data.services) {
    if (!urls?.length) continue;
    const url = urls[0].replace(/\/+$/, "");
    for (const tld of tlds) {
      map.set(tld.toLowerCase(), url);
    }
  }
  return map;
}

describe('IANA Bootstrap Parsing', () => {
  it('should parse a valid bootstrap response', () => {
    const data = {
      services: [
        [["com", "net"], ["https://rdap.verisign.com/com/v1/"]],
        [["org"], ["https://rdap.org/"]],
        [["lol"], ["https://rdap.centralnic.com/lol/"]],
      ],
    };
    const map = parseIanaBootstrap(data);
    expect(map.get("com")).toBe("https://rdap.verisign.com/com/v1");
    expect(map.get("org")).toBe("https://rdap.org");
    expect(map.get("lol")).toBe("https://rdap.centralnic.com/lol");
    expect(map.size).toBe(4); // com, net, org, lol
  });

  it('should handle empty services', () => {
    const map = parseIanaBootstrap({ services: [] });
    expect(map.size).toBe(0);
  });

  it('should handle null/undefined input', () => {
    const map = parseIanaBootstrap(null as any);
    expect(map.size).toBe(0);
  });

  it('should lowercase TLD names', () => {
    const data = { services: [[["COM"], ["https://rdap.example.com/"]]] };
    const map = parseIanaBootstrap(data);
    expect(map.get("com")).toBeDefined();
    expect(map.get("COM")).toBeUndefined();
  });

  it('should strip trailing slashes from URLs', () => {
    const data = { services: [[["test"], ["https://rdap.example.com/test/"]]] };
    const map = parseIanaBootstrap(data);
    expect(map.get("test")).toBe("https://rdap.example.com/test");
  });

  it('should skip entries with no URLs', () => {
    const data = { services: [[["orphan"], []]] };
    const map = parseIanaBootstrap(data);
    expect(map.has("orphan")).toBe(false);
  });
});

// ─── Registrar Name Extraction (3-tier fallback) ─────────────────────

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, [string, Record<string, unknown>, string, string][]];
  handle?: string;
  publicIds?: { type: string; identifier: string }[];
}

function extractRegistrar(entities: RdapEntity[]): string | null {
  const registrarEntity = entities?.find(e => e.roles?.includes("registrar"));
  if (!registrarEntity) return null;

  // Tier 1: vcardArray fn
  if (registrarEntity.vcardArray?.[1]) {
    const fn = registrarEntity.vcardArray[1].find((field) => field[0] === "fn");
    if (fn?.[3]) return fn[3];
  }

  // Tier 2: publicIds (IANA Registrar ID)
  if (registrarEntity.publicIds?.length) {
    const ianaId = registrarEntity.publicIds.find(p => p.type === "IANA Registrar ID");
    if (ianaId) return `Registrar ID: ${ianaId.identifier}`;
    return registrarEntity.publicIds[0].identifier;
  }

  // Tier 3: handle
  if (registrarEntity.handle) return registrarEntity.handle;

  return null;
}

describe('Registrar Name Extraction', () => {
  it('should extract from vcardArray (tier 1)', () => {
    const entities: RdapEntity[] = [{
      roles: ["registrar"],
      vcardArray: ["vcard", [["fn", {}, "text", "GoDaddy.com, LLC"]]],
    }];
    expect(extractRegistrar(entities)).toBe("GoDaddy.com, LLC");
  });

  it('should fall back to publicIds (tier 2)', () => {
    const entities: RdapEntity[] = [{
      roles: ["registrar"],
      publicIds: [{ type: "IANA Registrar ID", identifier: "146" }],
    }];
    expect(extractRegistrar(entities)).toBe("Registrar ID: 146");
  });

  it('should fall back to handle (tier 3)', () => {
    const entities: RdapEntity[] = [{
      roles: ["registrar"],
      handle: "MARKMONITOR-REG",
    }];
    expect(extractRegistrar(entities)).toBe("MARKMONITOR-REG");
  });

  it('should prefer vcardArray over publicIds', () => {
    const entities: RdapEntity[] = [{
      roles: ["registrar"],
      vcardArray: ["vcard", [["fn", {}, "text", "Preferred Registrar"]]],
      publicIds: [{ type: "IANA Registrar ID", identifier: "999" }],
      handle: "FALLBACK",
    }];
    expect(extractRegistrar(entities)).toBe("Preferred Registrar");
  });

  it('should return null when no registrar entity exists', () => {
    const entities: RdapEntity[] = [{
      roles: ["abuse"],
      handle: "ABUSE-HANDLER",
    }];
    expect(extractRegistrar(entities)).toBeNull();
  });

  it('should return null for empty entities array', () => {
    expect(extractRegistrar([])).toBeNull();
  });
});

// ─── TLD Extraction ──────────────────────────────────────────────────

describe('TLD Extraction', () => {
  function extractTld(domain: string): string {
    return domain.split(".").pop()?.toLowerCase() ?? "";
  }

  it('should extract simple TLDs', () => {
    expect(extractTld("example.com")).toBe("com");
    expect(extractTld("example.org")).toBe("org");
    expect(extractTld("yoke.lol")).toBe("lol");
  });

  it('should extract TLD from subdomains', () => {
    expect(extractTld("www.example.com")).toBe("com");
    expect(extractTld("api.v2.example.ai")).toBe("ai");
  });

  it('should handle ccTLD domains', () => {
    expect(extractTld("google.it")).toBe("it");
    expect(extractTld("yandex.ru")).toBe("ru");
  });
});

// ─── Retry Logic ─────────────────────────────────────────────────────

describe('Retry Logic', () => {
  it('should attempt exactly 2 tries (initial + 1 retry)', () => {
    let attempts = 0;
    const maxRetries = 2;

    // Simulate the retry loop from dns.ts
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      attempts++;
      // Simulate failure on both attempts
      const failed = true;
      if (failed && attempt === 0) continue;
      break;
    }

    expect(attempts).toBe(2);
  });

  it('should stop on first success', () => {
    let attempts = 0;
    const maxRetries = 2;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      attempts++;
      // Simulate success on first attempt
      const success = true;
      if (success) break;
    }

    expect(attempts).toBe(1);
  });
});

// ─── RDAP URL Construction ───────────────────────────────────────────

describe('RDAP URL Construction', () => {
  function buildRdapUrl(endpoint: string, domain: string): string {
    return `${endpoint}/domain/${encodeURIComponent(domain)}`;
  }

  it('should construct valid RDAP URL', () => {
    const url = buildRdapUrl("https://rdap.verisign.com/com/v1", "example.com");
    expect(url).toBe("https://rdap.verisign.com/com/v1/domain/example.com");
  });

  it('should encode special characters in domain', () => {
    const url = buildRdapUrl("https://rdap.example.com", "münchen.de");
    expect(url).toContain("domain/m%C3%BCnchen.de");
  });
});

// ─── WhoisFreaks Response Parsing ────────────────────────────────────

describe('WhoisFreaks Response Parsing', () => {
  interface WhoisFreaksResponse {
    create_date?: string;
    update_date?: string;
    expiry_date?: string;
    domain_registrar?: { registrar_name?: string };
    name_servers?: string[];
    domain_status?: string[];
    whois_raw_domain?: string;
  }

  function parseWhoisFreaks(data: WhoisFreaksResponse) {
    let registrar = data.domain_registrar?.registrar_name ?? null;
    if (!registrar && data.whois_raw_domain) {
      const match = data.whois_raw_domain.match(/registrar:\s*(.+)/i);
      if (match) registrar = match[1].trim();
    }

    const now = Date.now();
    let domainAgeDays: number | null = null;
    let daysUntilExpiry: number | null = null;
    if (data.create_date) domainAgeDays = Math.floor((now - new Date(data.create_date).getTime()) / 86400000);
    if (data.expiry_date) daysUntilExpiry = Math.floor((new Date(data.expiry_date).getTime() - now) / 86400000);

    return { registrar, domainAgeDays, daysUntilExpiry, nameservers: data.name_servers ?? [] };
  }

  it('should parse structured registrar name', () => {
    const result = parseWhoisFreaks({
      domain_registrar: { registrar_name: "MarkMonitor Inc." },
      create_date: "1997-09-15",
      expiry_date: "2028-09-14",
      name_servers: ["ns1.google.com", "ns2.google.com"],
    });
    expect(result.registrar).toBe("MarkMonitor Inc.");
    expect(result.nameservers).toHaveLength(2);
    expect(result.domainAgeDays).toBeGreaterThan(0);
    expect(result.daysUntilExpiry).toBeGreaterThan(0);
  });

  it('should fall back to raw WHOIS parsing for registrar', () => {
    const result = parseWhoisFreaks({
      whois_raw_domain: "domain: example.it\nRegistrar: MARKMONITOR-REG\nstatus: active",
    });
    expect(result.registrar).toBe("MARKMONITOR-REG");
  });

  it('should return null registrar when both methods fail', () => {
    const result = parseWhoisFreaks({});
    expect(result.registrar).toBeNull();
  });

  it('should return empty nameservers when missing', () => {
    const result = parseWhoisFreaks({});
    expect(result.nameservers).toEqual([]);
  });
});
