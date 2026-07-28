import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clampSuggestionLimit, getAutocompleteSuggestions } from '@search/autocomplete';

/**
 * 자동완성이 **조용히 꺼지지 않는지** 본다.
 *
 * 라우트는 `limit` 을 `Math.min(20, Math.max(1, parseInt(raw ?? '8', 10)))`
 * 로 다듬었다. 그런데 `parseInt('abc')` 도 `parseInt('')` 도 NaN 이고
 * **`Math.max(1, NaN)` 은 1 이 아니라 NaN 이다.** 그대로 흘러 들어가면
 * `slice(0, NaN)` 이 되어 제안이 0 개로 나온다 — 오류도 경고도 없이
 * 자동완성만 안 뜬다(실측 2026-07-28).
 *
 * `?limit=` 처럼 빈 값을 붙이는 것은 클라이언트에서 흔한 모양이다
 * (`limit=${n ?? ''}`). 그 한 글자에 기능이 사라지면 원인을 찾기 어렵다.
 */
const ROUTE = readFileSync(
  join(__dirname, '..', '..', 'app', 'api', 'autocomplete', 'route.ts'),
  'utf8',
);

/** 복사본을 두지 않는다 — 라우트와 검사가 같은 함수를 본다. */
const clampFromRoute = clampSuggestionLimit;

describe('자동완성 limit 다듬기', () => {
  it.each([
    ['8', 8],
    [null, 8],
    ['abc', 8],
    ['', 8],
    ['0', 1],
    ['-3', 1],
    ['999', 20],
    ['5.9', 5],
  ])('limit=%s → %i', (raw, expected) => {
    expect(clampFromRoute(raw as string | null)).toBe(expected);
  });

  /**
   * 다듬기만 맞추고 끝내면 "숫자가 8 이다" 만 확인한 것이다. 그 값으로
   * 실제 제안이 나오는지까지 본다 — 0 개로 꺼지던 게 이 결함이었다.
   */
  it.each(['abc', '', null])('limit=%s 여도 제안이 실제로 나온다', (raw) => {
    const out = getAutocompleteSuggestions('전압', 'ko', clampFromRoute(raw as string | null));
    expect(out.length).toBeGreaterThan(0);
  });

  it('NaN 이 그대로 들어가면 0 개가 된다 — 이게 왜 위험한지의 근거', () => {
    expect(getAutocompleteSuggestions('전압', 'ko', Number.NaN)).toHaveLength(0);
  });

  it('라우트가 NaN 을 거른다 — 손으로 옮긴 위 계산이 실제와 같은지', () => {
    expect(ROUTE).toContain('clampSuggestionLimit(searchParams.get');
    expect(ROUTE).not.toMatch(/Math\.max\(1,\s*parseInt/);
  });
});

/**
 * 라우트 주석이 "<50ms" 를 약속한다. 자동완성은 타이핑마다 도니 그 약속이
 * 깨지면 바로 체감된다. 실측 2026-07-28: 질의당 0.01~2.0ms.
 *
 * 임계는 넉넉히 둔다 — CI 부하에서 흔들리는 성능 검사는 결국 무시된다.
 */
describe('자동완성 응답 시간', () => {
  it.each(['전', '전압', '전압강하', 'cable', 'MCCB', '허용전류'])(
    '"%s" 는 약속한 50ms 안에 답한다', (q) => {
      const started = process.hrtime.bigint();
      getAutocompleteSuggestions(q, 'ko', 8);
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      expect(ms).toBeLessThan(50);
    },
  );

  it('라우트가 그 약속을 문서에 적고 있다', () => {
    expect(ROUTE).toContain('<50ms');
  });
});
