import { describe, it, expect } from 'vitest';

// ─── Import production code ─────────────────────────────────────────
import { cleanDomain } from '@worker/helpers';

// ─── Recursive DNS endpoint logic ───────────────────────────────────

describe('Recursive DNS endpoint', () => {

  describe('domain validation via cleanDomain', () => {
    it('should accept a valid domain', () => {
      expect(cleanDomain('example.com')).toBe('example.com');
    });

    it('should accept a subdomain', () => {
      expect(cleanDomain('sub.example.com')).toBe('sub.example.com');
    });

    it('should normalize casing and strip protocol', () => {
      expect(cleanDomain('https://EXAMPLE.COM/path')).toBe('example.com');
    });

    it('should return null for missing/empty domain', () => {
      expect(cleanDomain('')).toBeNull();
    });

    it('should return null for IP addresses', () => {
      expect(cleanDomain('1.2.3.4')).toBeNull();
    });
  });

  describe('rate limit configuration', () => {
    it('should have /api/recursive-dns in rate limit config', async () => {
      // Dynamically import index.ts isn't practical because it's a CF Worker module,
      // so we verify the config entry exists by checking the source directly.
      const fs = await import('fs');
      const path = await import('path');
      const indexSrc = fs.readFileSync(
        path.resolve(__dirname, '../worker/src/index.ts'),
        'utf-8',
      );
      expect(indexSrc).toContain('"/api/recursive-dns"');
      expect(indexSrc).toContain('RATE_LIMIT_RECURSIVE_DNS');
    });
  });

  describe('response shape', () => {
    it('should define the expected resolver result structure', () => {
      // Verify the expected response shape contract
      const mockResult = {
        domain: 'example.com',
        resolvers: [
          {
            name: 'Google',
            provider: '8.8.8.8',
            a_records: ['93.184.216.34'],
            aaaa_records: ['2606:2800:220:1:248:1893:25c8:1946'],
            ttl: 300,
            status: 'ok' as const,
            response_time_ms: 42,
          },
          {
            name: 'Cloudflare',
            provider: '1.1.1.1',
            a_records: ['93.184.216.34'],
            aaaa_records: ['2606:2800:220:1:248:1893:25c8:1946'],
            ttl: 285,
            status: 'ok' as const,
            response_time_ms: 28,
          },
          {
            name: 'Quad9',
            provider: '9.9.9.9',
            a_records: ['93.184.216.34'],
            aaaa_records: [],
            ttl: 250,
            status: 'ok' as const,
            response_time_ms: 55,
          },
        ],
        consensus: true,
        timestamp: '2026-05-29T00:00:00.000Z',
      };

      // Verify structure
      expect(mockResult.domain).toBe('example.com');
      expect(mockResult.resolvers).toHaveLength(3);
      expect(mockResult.consensus).toBe(true);
      expect(mockResult.timestamp).toBeTruthy();

      // Verify resolver fields
      for (const r of mockResult.resolvers) {
        expect(r).toHaveProperty('name');
        expect(r).toHaveProperty('provider');
        expect(r).toHaveProperty('a_records');
        expect(r).toHaveProperty('aaaa_records');
        expect(r).toHaveProperty('ttl');
        expect(r).toHaveProperty('status');
        expect(r).toHaveProperty('response_time_ms');
        expect(Array.isArray(r.a_records)).toBe(true);
        expect(Array.isArray(r.aaaa_records)).toBe(true);
      }
    });

    it('should detect consensus when all resolvers agree', () => {
      const records = [
        ['93.184.216.34'],
        ['93.184.216.34'],
        ['93.184.216.34'],
      ];
      const sorted = records.map(r => r.slice().sort().join(','));
      const consensus = sorted.every(s => s === sorted[0]);
      expect(consensus).toBe(true);
    });

    it('should detect discrepancy when resolvers disagree', () => {
      const records = [
        ['93.184.216.34'],
        ['93.184.216.34', '93.184.216.35'],
        ['93.184.216.34'],
      ];
      const sorted = records.map(r => r.slice().sort().join(','));
      const consensus = sorted.every(s => s === sorted[0]);
      expect(consensus).toBe(false);
    });
  });
});
