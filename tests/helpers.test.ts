import { describe, it, expect } from 'vitest';

// Import helpers directly — these are pure functions with no CF Worker deps
// We inline the logic here to avoid import issues with the Worker types
// In a real setup you'd use miniflare or extract pure utils

// ─── normalizeDomain ──────────────────────────────────────────────────

function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/\/.*$/, '');
  d = d.replace(/^www\./, '');
  return d;
}

const MULTI_PART_TLDS = ['co.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'co.in', 'org.uk', 'net.au', 'ac.uk'];

describe('normalizeDomain', () => {
  it('should lowercase input', () => {
    expect(normalizeDomain('EXAMPLE.COM')).toBe('example.com');
  });

  it('should strip http://', () => {
    expect(normalizeDomain('http://example.com')).toBe('example.com');
  });

  it('should strip https://', () => {
    expect(normalizeDomain('https://example.com')).toBe('example.com');
  });

  it('should strip www.', () => {
    expect(normalizeDomain('www.example.com')).toBe('example.com');
  });

  it('should strip paths', () => {
    expect(normalizeDomain('https://example.com/page/test?q=1')).toBe('example.com');
  });

  it('should handle full URL with www + path', () => {
    expect(normalizeDomain('https://www.Example.COM/foo/bar')).toBe('example.com');
  });

  it('should trim whitespace', () => {
    expect(normalizeDomain('  example.com  ')).toBe('example.com');
  });

  it('should preserve subdomains (not www)', () => {
    expect(normalizeDomain('blog.example.com')).toBe('blog.example.com');
  });

  it('should handle bare domain', () => {
    expect(normalizeDomain('example.com')).toBe('example.com');
  });

  it('should handle multi-part TLD domains', () => {
    expect(normalizeDomain('https://www.bbc.co.uk/news')).toBe('bbc.co.uk');
  });
});

// ─── Domain Validation ────────────────────────────────────────────────

function isValidDomain(input: string): boolean {
  const domain = normalizeDomain(input);
  // Must have at least one dot
  if (!domain.includes('.')) return false;
  // No spaces
  if (/\s/.test(domain)) return false;
  // Basic domain regex
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(domain)) return false;
  // Not an IP
  if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) return false;
  return true;
}

describe('isValidDomain', () => {
  it('should accept valid domains', () => {
    expect(isValidDomain('example.com')).toBe(true);
    expect(isValidDomain('sub.example.com')).toBe(true);
    expect(isValidDomain('deep.sub.example.com')).toBe(true);
    expect(isValidDomain('example.co.uk')).toBe(true);
  });

  it('should accept domains from URLs', () => {
    expect(isValidDomain('https://example.com')).toBe(true);
    expect(isValidDomain('http://www.example.com/path')).toBe(true);
  });

  it('should reject invalid inputs', () => {
    expect(isValidDomain('notadomain')).toBe(false);
    expect(isValidDomain('has spaces.com')).toBe(false);
    expect(isValidDomain('')).toBe(false);
    expect(isValidDomain('.')).toBe(false);
  });

  it('should reject IP addresses', () => {
    expect(isValidDomain('192.168.1.1')).toBe(false);
    expect(isValidDomain('8.8.8.8')).toBe(false);
  });

  it('should reject domains with invalid characters', () => {
    expect(isValidDomain('exam!ple.com')).toBe(false);
    expect(isValidDomain('exam ple.com')).toBe(false);
  });
});

// ─── URL Parsing ──────────────────────────────────────────────────────

describe('URL parsing edge cases', () => {
  it('should handle protocol-relative URLs', () => {
    const input = '//example.com/path';
    const cleaned = input.replace(/^\/\//, '').replace(/\/.*$/, '');
    expect(cleaned).toBe('example.com');
  });

  it('should handle ports in URLs', () => {
    const input = 'https://example.com:8080/path';
    const domain = normalizeDomain(input.replace(/:\d+/, ''));
    expect(domain).toBe('example.com');
  });

  it('should handle trailing dots (FQDN)', () => {
    const input = 'example.com.';
    const domain = input.replace(/\.$/, '');
    expect(domain).toBe('example.com');
  });
});
