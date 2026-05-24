import { describe, it, expect } from 'vitest';

// ─── Tech Stack Fingerprint Tests ─────────────────────────────────────
// Tests the fingerprint matching logic used in analyze.ts detectTechStack

interface Fingerprint {
  name: string;
  category: string;
  patterns: {
    headers?: Record<string, RegExp>;
    meta?: Record<string, RegExp>;
    scriptUrls?: RegExp[];
    cssUrls?: RegExp[];
    htmlPatterns?: RegExp[];
    cookies?: string[];
  };
  versionExtract?: {
    source: 'meta' | 'header' | 'html' | 'script';
    pattern: RegExp;
  };
}

// Subset of the real fingerprints for testing
const testFingerprints: Fingerprint[] = [
  {
    name: 'WordPress',
    category: 'CMS',
    patterns: {
      meta: { generator: /wordpress/i },
      htmlPatterns: [/wp-content\//i, /wp-includes\//i],
      scriptUrls: [/wp-content\/.*\.js/i, /wp-includes\/.*\.js/i],
      cssUrls: [/wp-content\/.*\.css/i],
    },
    versionExtract: { source: 'meta', pattern: /WordPress\s+([\d.]+)/i },
  },
  {
    name: 'Shopify',
    category: 'E-commerce',
    patterns: {
      headers: { 'x-shopid': /./, 'x-shopify-stage': /./ },
      htmlPatterns: [/cdn\.shopify\.com/i, /Shopify\.theme/i],
      scriptUrls: [/cdn\.shopify\.com/i],
    },
  },
  {
    name: 'Cloudflare',
    category: 'CDN',
    patterns: {
      headers: { server: /cloudflare/i },
    },
  },
  {
    name: 'nginx',
    category: 'Web Server',
    patterns: {
      headers: { server: /nginx/i },
    },
    versionExtract: { source: 'header', pattern: /nginx\/([\d.]+)/i },
  },
  {
    name: 'React',
    category: 'JavaScript Framework',
    patterns: {
      htmlPatterns: [/react[.-]dom/i, /__NEXT_DATA__/i, /data-reactroot/i],
      scriptUrls: [/react[.-]dom/i],
    },
  },
];

// Simplified detectTechStack for testing
function detectTechStack(
  headers: Record<string, string>,
  html: string,
): { name: string; category: string; version: string | null; confidence: string }[] {
  const results: { name: string; category: string; version: string | null; confidence: string }[] = [];

  for (const fp of testFingerprints) {
    let matched = false;
    let confidence = 'low';

    // Check headers
    if (fp.patterns.headers) {
      for (const [key, regex] of Object.entries(fp.patterns.headers)) {
        if (headers[key] && regex.test(headers[key])) {
          matched = true;
          confidence = 'high';
          break;
        }
      }
    }

    // Check HTML patterns
    if (!matched && fp.patterns.htmlPatterns) {
      for (const regex of fp.patterns.htmlPatterns) {
        if (regex.test(html)) {
          matched = true;
          confidence = 'medium';
          break;
        }
      }
    }

    // Check meta tags
    if (!matched && fp.patterns.meta) {
      for (const [name, regex] of Object.entries(fp.patterns.meta)) {
        const metaMatch = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'));
        if (metaMatch && regex.test(metaMatch[1])) {
          matched = true;
          confidence = 'high';
          break;
        }
      }
    }

    if (matched) {
      let version: string | null = null;
      if (fp.versionExtract) {
        if (fp.versionExtract.source === 'header') {
          for (const val of Object.values(headers)) {
            const m = val.match(fp.versionExtract.pattern);
            if (m) { version = m[1]; break; }
          }
        } else if (fp.versionExtract.source === 'meta') {
          const m = html.match(fp.versionExtract.pattern);
          if (m) version = m[1];
        }
      }
      results.push({ name: fp.name, category: fp.category, version, confidence });
    }
  }

  return results;
}

describe('WordPress Detection', () => {
  it('should detect WordPress from wp-content in HTML', () => {
    const html = '<link rel="stylesheet" href="/wp-content/themes/twentytwenty/style.css">';
    const result = detectTechStack({}, html);
    const wp = result.find(r => r.name === 'WordPress');
    expect(wp).toBeDefined();
    expect(wp!.category).toBe('CMS');
  });

  it('should detect WordPress from wp-includes', () => {
    const html = '<script src="/wp-includes/js/jquery/jquery.min.js"></script>';
    const result = detectTechStack({}, html);
    expect(result.find(r => r.name === 'WordPress')).toBeDefined();
  });

  it('should extract WordPress version from meta generator', () => {
    const html = '<meta name="generator" content="WordPress 6.5.3">';
    const result = detectTechStack({}, html);
    const wp = result.find(r => r.name === 'WordPress');
    expect(wp).toBeDefined();
    expect(wp!.version).toBe('6.5.3');
    expect(wp!.confidence).toBe('high');
  });

  it('should not detect WordPress on non-WP sites', () => {
    const html = '<html><body>Hello world</body></html>';
    const result = detectTechStack({}, html);
    expect(result.find(r => r.name === 'WordPress')).toBeUndefined();
  });
});

describe('CDN/Server Detection', () => {
  it('should detect Cloudflare from server header', () => {
    const result = detectTechStack({ server: 'cloudflare' }, '');
    expect(result.find(r => r.name === 'Cloudflare')).toBeDefined();
  });

  it('should detect nginx with version', () => {
    const result = detectTechStack({ server: 'nginx/1.25.3' }, '');
    const nginx = result.find(r => r.name === 'nginx');
    expect(nginx).toBeDefined();
    expect(nginx!.version).toBe('1.25.3');
  });

  it('should detect nginx without version', () => {
    const result = detectTechStack({ server: 'nginx' }, '');
    const nginx = result.find(r => r.name === 'nginx');
    expect(nginx).toBeDefined();
    expect(nginx!.version).toBeNull();
  });

  it('should not confuse Cloudflare with nginx', () => {
    const result = detectTechStack({ server: 'cloudflare' }, '');
    expect(result.find(r => r.name === 'nginx')).toBeUndefined();
    expect(result.find(r => r.name === 'Cloudflare')).toBeDefined();
  });
});

describe('Shopify Detection', () => {
  it('should detect Shopify from x-shopid header', () => {
    const result = detectTechStack({ 'x-shopid': '12345', 'x-shopify-stage': 'production' }, '');
    expect(result.find(r => r.name === 'Shopify')).toBeDefined();
  });

  it('should detect Shopify from HTML patterns', () => {
    const html = '<script src="https://cdn.shopify.com/s/files/1/0123/script.js"></script>';
    const result = detectTechStack({}, html);
    expect(result.find(r => r.name === 'Shopify')).toBeDefined();
  });
});

describe('React Detection', () => {
  it('should detect React from data-reactroot', () => {
    const html = '<div id="root" data-reactroot="">...</div>';
    const result = detectTechStack({}, html);
    expect(result.find(r => r.name === 'React')).toBeDefined();
  });

  it('should detect Next.js data', () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{}</script>';
    const result = detectTechStack({}, html);
    expect(result.find(r => r.name === 'React')).toBeDefined();
  });
});

// ─── Hosting/CDN Detection Patterns ──────────────────────────────────

interface HostingPattern {
  name: string;
  type: 'cdn' | 'waf' | 'provider';
  patterns: {
    headers?: Record<string, RegExp>;
    rdns?: RegExp[];
    org?: RegExp[];
  };
}

const HOSTING_PATTERNS: HostingPattern[] = [
  { name: 'Cloudflare', type: 'cdn', patterns: { headers: { server: /cloudflare/i, 'cf-ray': /./ } } },
  { name: 'Fastly', type: 'cdn', patterns: { headers: { 'x-served-by': /cache-/i, via: /varnish/i } } },
  { name: 'Akamai', type: 'cdn', patterns: { headers: { 'x-akamai-transformed': /./ }, rdns: [/\.akamai\./i, /\.akamaitechnologies\./i] } },
  { name: 'AWS', type: 'provider', patterns: { headers: { server: /AmazonS3|awselb/i }, rdns: [/\.amazonaws\.com$/i, /\.aws\./i] } },
  { name: 'Google Cloud', type: 'provider', patterns: { headers: { server: /gws|Google Frontend/i }, rdns: [/\.googleusercontent\.com$/i, /\.google\.com$/i] } },
  { name: 'Vercel', type: 'provider', patterns: { headers: { 'x-vercel-id': /./, server: /Vercel/i } } },
  { name: 'Netlify', type: 'provider', patterns: { headers: { server: /Netlify/i, 'x-nf-request-id': /./ } } },
];

function detectHosting(
  headers: Record<string, string> | null,
  rdns: string | null,
): { provider: string | null; cdn: string | null; waf: string | null } {
  const result = { provider: null as string | null, cdn: null as string | null, waf: null as string | null };
  if (!headers && !rdns) return result;

  for (const hp of HOSTING_PATTERNS) {
    let matched = false;

    if (hp.patterns.headers && headers) {
      for (const [key, regex] of Object.entries(hp.patterns.headers)) {
        if (headers[key] && regex.test(headers[key])) { matched = true; break; }
      }
    }
    if (!matched && hp.patterns.rdns && rdns) {
      for (const regex of hp.patterns.rdns) {
        if (regex.test(rdns)) { matched = true; break; }
      }
    }

    if (matched) {
      if (hp.type === 'cdn' && !result.cdn) result.cdn = hp.name;
      else if (hp.type === 'waf' && !result.waf) result.waf = hp.name;
      else if (hp.type === 'provider' && !result.provider) result.provider = hp.name;
    }
  }
  return result;
}

describe('Hosting/CDN Detection', () => {
  it('should detect Cloudflare CDN', () => {
    const result = detectHosting({ server: 'cloudflare', 'cf-ray': 'abc123' }, null);
    expect(result.cdn).toBe('Cloudflare');
  });

  it('should detect Vercel', () => {
    const result = detectHosting({ 'x-vercel-id': 'iad1::12345', server: 'Vercel' }, null);
    expect(result.provider).toBe('Vercel');
  });

  it('should detect AWS from rDNS', () => {
    const result = detectHosting(null, 'ec2-54-123-45-67.compute-1.amazonaws.com');
    expect(result.provider).toBe('AWS');
  });

  it('should detect Fastly from headers', () => {
    const result = detectHosting({ 'x-served-by': 'cache-iad-kjhg7890', via: '1.1 varnish' }, null);
    expect(result.cdn).toBe('Fastly');
  });

  it('should detect Netlify', () => {
    const result = detectHosting({ server: 'Netlify', 'x-nf-request-id': 'abc' }, null);
    expect(result.provider).toBe('Netlify');
  });

  it('should return nulls for unknown hosting', () => {
    const result = detectHosting({ server: 'Apache/2.4.52' }, null);
    expect(result.provider).toBeNull();
    expect(result.cdn).toBeNull();
    expect(result.waf).toBeNull();
  });

  it('should handle null inputs', () => {
    const result = detectHosting(null, null);
    expect(result.provider).toBeNull();
    expect(result.cdn).toBeNull();
    expect(result.waf).toBeNull();
  });
});
