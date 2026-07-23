/**
 * Rate Limit Tests
 *
 * Tests the in-memory sliding window rate limiter.
 * Verifies request counting, blocking, expiry, and IP extraction.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  checkRateLimit,
  getClientIp,
  resetRateLimits,
  RATE_LIMIT_PROFILES,
  getRateLimitStoreSize,
} from '../rate-limit';

// -- Setup -------------------------------------------------------------------

beforeEach(() => {
  resetRateLimits();
});

// -- Core Rate Limit Tests ---------------------------------------------------

describe('Rate Limiter - Core', () => {
  test('Default profile allows 60 requests per minute', () => {
    const profile = RATE_LIMIT_PROFILES.default;
    expect(profile.maxRequests).toBe(60);
    expect(profile.windowMs).toBe(60_000);
  });

  test('First request is allowed', () => {
    const result = checkRateLimit('192.168.1.1', 'default');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  test('61st request on default profile is blocked', () => {
    const ip = '10.0.0.1';
    // Exhaust 60 requests
    for (let i = 0; i < 60; i++) {
      const r = checkRateLimit(ip, 'default');
      expect(r.allowed).toBe(true);
    }

    // 61st should be blocked
    const blocked = checkRateLimit(ip, 'default');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeDefined();
    expect(blocked.retryAfter!).toBeGreaterThan(0);
  });

  test('Different IPs have independent limits', () => {
    const ip1 = '192.168.1.1';
    const ip2 = '192.168.1.2';

    // Exhaust IP1
    for (let i = 0; i < 60; i++) {
      checkRateLimit(ip1, 'default');
    }

    // IP1 blocked, IP2 still allowed
    expect(checkRateLimit(ip1, 'default').allowed).toBe(false);
    expect(checkRateLimit(ip2, 'default').allowed).toBe(true);
  });

  test('Different profiles have independent limits', () => {
    const ip = '10.0.0.5';

    // Exhaust search profile (30 req)
    for (let i = 0; i < 30; i++) {
      checkRateLimit(ip, 'search');
    }

    // Search blocked, but calculate still allowed
    expect(checkRateLimit(ip, 'search').allowed).toBe(false);
    expect(checkRateLimit(ip, 'calculate').allowed).toBe(true);
  });

  test('Remaining count decreases with each request', () => {
    const ip = '10.0.0.10';
    const r1 = checkRateLimit(ip, 'default');
    const r2 = checkRateLimit(ip, 'default');
    const r3 = checkRateLimit(ip, 'default');

    expect(r1.remaining).toBe(59);
    expect(r2.remaining).toBe(58);
    expect(r3.remaining).toBe(57);
  });
});

// -- Profile-Specific Tests --------------------------------------------------

describe('Rate Limiter - Profiles', () => {
  test('Search profile: 30 requests per minute', () => {
    expect(RATE_LIMIT_PROFILES.search.maxRequests).toBe(30);
  });

  test('Chat profile: 20 requests per minute', () => {
    expect(RATE_LIMIT_PROFILES.chat.maxRequests).toBe(20);
  });

  test('Unknown profile falls back to default', () => {
    const result = checkRateLimit('10.0.0.1', 'nonexistent');
    expect(result.allowed).toBe(true);
    // Should use default profile (60 max)
    expect(result.remaining).toBe(59);
  });
});

// -- Store Management --------------------------------------------------------

describe('Rate Limiter - Store', () => {
  test('resetRateLimits clears all entries', () => {
    checkRateLimit('1.1.1.1', 'default');
    checkRateLimit('2.2.2.2', 'default');
    expect(getRateLimitStoreSize()).toBeGreaterThan(0);

    resetRateLimits();
    expect(getRateLimitStoreSize()).toBe(0);
  });

  test('bounds the bucket store under a unique-client flood', () => {
    for (let i = 0; i < 10_500; i++) {
      checkRateLimit(`2001:db8::${i.toString(16)}`, 'default');
    }

    expect(getRateLimitStoreSize()).toBeLessThanOrEqual(10_000);
  });
});

// -- IP Extraction Tests -----------------------------------------------------

describe('getClientIp', () => {
  const originalVercel = process.env.VERCEL;
  const originalTrustedHeader = process.env.TRUSTED_CLIENT_IP_HEADER;

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    if (originalTrustedHeader === undefined) delete process.env.TRUSTED_CLIENT_IP_HEADER;
    else process.env.TRUSTED_CLIENT_IP_HEADER = originalTrustedHeader;
  });

  test('ignores forwarding headers when no trusted proxy is configured', () => {
    delete process.env.VERCEL;
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    const headers = new Headers();
    headers.set('x-forwarded-for', '203.0.113.50, 70.41.3.18');
    headers.set('x-real-ip', '198.51.100.23');
    headers.set('cf-connecting-ip', '93.184.216.34');
    expect(getClientIp(headers)).toBe('untrusted-client');
  });

  test('uses Vercel-owned client IP headers only in a Vercel runtime', () => {
    process.env.VERCEL = '1';
    const headers = new Headers();
    headers.set('x-vercel-forwarded-for', '198.51.100.99');
    headers.set('x-forwarded-for', '1.2.3.4');
    expect(getClientIp(headers)).toBe('198.51.100.99');
  });

  test('uses only the explicitly configured header behind another trusted proxy', () => {
    delete process.env.VERCEL;
    process.env.TRUSTED_CLIENT_IP_HEADER = 'x-esa-client-ip';
    const headers = new Headers();
    headers.set('x-esa-client-ip', '203.0.113.25');
    headers.set('x-forwarded-for', '1.2.3.4');
    expect(getClientIp(headers)).toBe('203.0.113.25');
  });

  test('rejects an invalid value in the configured trusted header', () => {
    process.env.TRUSTED_CLIENT_IP_HEADER = 'x-esa-client-ip';
    const headers = new Headers();
    headers.set('x-esa-client-ip', '999.999.999.999');
    expect(getClientIp(headers)).toBe('untrusted-client');
  });

  test('falls back to a shared fail-closed identity when no trusted header exists', () => {
    delete process.env.VERCEL;
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    const headers = new Headers();
    expect(getClientIp(headers)).toBe('untrusted-client');
  });
});
