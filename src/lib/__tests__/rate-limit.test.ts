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
  // 버그 사냥 수리: XFF 최좌측은 클라이언트가 위조 가능 → 신뢰 프록시가 붙이는
  // 최우측을 쓴다(스푸핑 저항). 최좌측 신뢰는 레이트리밋 우회 취약점이었다.
  test('x-forwarded-for에서 신뢰측(최우측)을 쓴다 — 위조 방지', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '203.0.113.50, 70.41.3.18');
    expect(getClientIp(headers)).toBe('70.41.3.18');
  });

  test('공격자가 최좌측에 위조 IP를 주입해도 실IP(최우측)를 쓴다', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '1.2.3.4, 5.6.7.8, 198.51.100.99');
    expect(getClientIp(headers)).toBe('198.51.100.99');
  });

  test('플랫폼 헤더(x-real-ip)를 XFF보다 우선한다 — 클라이언트가 못 덮는 값', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '1.2.3.4');
    headers.set('x-real-ip', '198.51.100.23');
    expect(getClientIp(headers)).toBe('198.51.100.23');
  });

  test('Extracts from cf-connecting-ip header', () => {
    const headers = new Headers();
    headers.set('cf-connecting-ip', '93.184.216.34');
    expect(getClientIp(headers)).toBe('93.184.216.34');
  });

  test('Falls back to 127.0.0.1 when no headers present', () => {
    const headers = new Headers();
    expect(getClientIp(headers)).toBe('127.0.0.1');
  });

  test('Rejects an out-of-range IPv4 address that only looks syntactically valid', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '999.999.999.999');
    expect(getClientIp(headers)).toBe('127.0.0.1');
  });

  // 보안 수리(버그 사냥): 신뢰 프록시가 세팅하는 x-real-ip를 위조 가능한 XFF보다
  // 우선한다. 구 테스트는 XFF 우선(취약)을 잠갔었다 — 표준 대조 후 정정.
  test('플랫폼 헤더(x-real-ip)가 위조 가능한 XFF보다 우선한다', () => {
    const headers = new Headers();
    headers.set('x-forwarded-for', '10.0.0.1');
    headers.set('x-real-ip', '10.0.0.2');
    expect(getClientIp(headers)).toBe('10.0.0.2');
  });
});
