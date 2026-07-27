import {
  escapeHtml,
  sanitizeInput,
  isAllowedMimeType,
  maskSecret,
  safeJsonParse,
} from '@/lib/security-hardening';

/**
 * 보안 원시함수 4 종을 잠근다.
 *
 * 방어성 export 함수 54 개 중 32 개가 테스트에 이름조차 없었다(2026-07-28).
 * 이 넷은 그중에서도 사용자 입력이 직접 지나는 자리다.
 *
 * 이번에 실제로 갈라진 것이 하나 있었다: `export-pdf.ts` 가 자기 사본
 * `escapeHtml` 을 두고 **작은따옴표를 안 지우고 있었다.** 그 템플릿에
 * 작은따옴표 속성이 0 건이라 뚫리지는 않았지만, 보안 원시함수가 두 벌이면
 * 한쪽만 강화되고 다른 쪽은 남는다 — 공용 하나로 합치고 여기서 잠근다.
 */
describe('escapeHtml', () => {
  it.each([
    ['<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    ['a & b', 'a &amp; b'],
    ['say "hi"', 'say &quot;hi&quot;'],
    // 작은따옴표 — export-pdf 사본이 이걸 빠뜨리고 있었다.
    ["it's", 'it&#39;s'],
    ['<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)&gt;'],
  ])('%s 를 이스케이프한다', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  it('평범한 텍스트는 그대로 둔다 — 과잉 이스케이프도 결함이다', () => {
    expect(escapeHtml('380V 3상 100A')).toBe('380V 3상 100A');
    expect(escapeHtml('')).toBe('');
  });

  it('이스케이프는 멱등이 아니다 — 두 번 걸면 &amp; 가 이중이 된다', () => {
    // 사실을 못박는다. 호출부가 한 번만 걸도록 하는 근거다.
    expect(escapeHtml(escapeHtml('&'))).toBe('&amp;amp;');
  });
});

describe('sanitizeInput', () => {
  it('널 바이트·제어 문자·zero-width 를 지운다', () => {
    expect(sanitizeInput('a\0b')).toBe('ab');
    expect(sanitizeInput('a\x01\x08b')).toBe('ab');
    expect(sanitizeInput('a​b﻿')).toBe('ab');
  });

  it('탭·줄바꿈은 남긴다 — 정상 공백까지 지우면 본문이 깨진다', () => {
    expect(sanitizeInput('a\tb\nc')).toBe('a\tb\nc');
  });

  it('양끝 공백만 다듬는다', () => {
    expect(sanitizeInput('  전압강하  ')).toBe('전압강하');
  });
});

describe('isAllowedMimeType', () => {
  it('정확히 일치하거나 와일드카드에 든 것만 통과시킨다', () => {
    expect(isAllowedMimeType('image/png', ['image/png'])).toBe(true);
    expect(isAllowedMimeType('image/png', ['image/*'])).toBe(true);
    expect(isAllowedMimeType('application/pdf', ['image/*'])).toBe(false);
    expect(isAllowedMimeType('text/html', ['image/*', 'application/pdf'])).toBe(false);
  });

  it('와일드카드가 접두만 보고 다른 타입을 통과시키지 않는다', () => {
    // `image/*` 가 `imagex/evil` 을 통과시키면 안 된다 — 슬래시까지 봐야 한다.
    expect(isAllowedMimeType('imagex/evil', ['image/*'])).toBe(false);
  });
});

describe('maskSecret', () => {
  it('앞 4 자만 남기고 가린다', () => {
    expect(maskSecret('tk-demo-ABCDEFGHIJKLMNOP')).toBe(`tk-d${'•'.repeat(20)}`);
  });

  it('가림 길이를 20 으로 묶어 실제 길이를 흘리지 않는다', () => {
    const short = maskSecret('demo' + 'x'.repeat(30));
    const long = maskSecret('demo' + 'x'.repeat(200));
    expect(short).toBe(long);
  });

  it('짧은 값은 통째로 가린다 — 앞 4 자가 곧 전부인 경우', () => {
    expect(maskSecret('abc')).toBe('•••');
  });
});

describe('safeJsonParse', () => {
  it('정상 JSON 은 파싱한다', () => {
    expect(safeJsonParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('깨진 JSON 은 던지지 않고 null 을 낸다', () => {
    expect(safeJsonParse('{')).toBeNull();
  });

  it('프로토타입 오염을 막는다', () => {
    const out = safeJsonParse<Record<string, unknown>>('{"__proto__":{"polluted":1}}');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (out) expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });
});
