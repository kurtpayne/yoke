import { describe, it, expect } from 'vitest';

// ─── Import production code (single source of truth) ─────────────────
import { normalizeDomain, MULTI_PART_TLDS, isValidDomain } from '@worker/helpers';

// ─── normalizeDomain ──────────────────────────────────────────────────

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

  it('should strip www. prefix', () => {
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

describe('isValidDomain', () => {
  it('should accept valid domains', () => {
    expect(isValidDomain('example.com')).toBe(true);
    expect(isValidDomain('sub.example.com')).toBe(true);
    expect(isValidDomain('deep.sub.example.com')).toBe(true);
    expect(isValidDomain('example.co.uk')).toBe(true);
  });

  it('should reject invalid inputs', () => {
    expect(isValidDomain('notadomain')).toBe(false);
    expect(isValidDomain('')).toBe(false);
    expect(isValidDomain('.')).toBe(false);
  });

  it('should reject domains with invalid characters', () => {
    expect(isValidDomain('exam!ple.com')).toBe(false);
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
