/**
 * 계산기 링크는 카탈로그 한 곳에서 만든다.
 *
 * 화면 세 곳이 11~12줄짜리 분야 지도를 각자 손으로 들고 `?? 'power'` 로
 * 폴백했다. 담긴 항목은 카탈로그와 맞았지만 57종 중 11~12종뿐이라 나머지
 * 45종이 전부 'power' 로 링크됐다(실측 2026-07-26).
 *
 * 더 나쁜 건 값이 버려진 것이다. 도면 제안은 읽어낸 입력을 화면에 보여주면서
 * 링크는 `/calc?open={id}` 로 보냈는데, 목록 페이지엔 open 을 읽는 코드가
 * 없어서 사용자는 계산기를 직접 찾아 값을 다시 타이핑해야 했다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { calculatorHref, CALCULATOR_CATALOG } from '../calculator-catalog';

describe('calculatorHref', () => {
  it('분야 구간이 카탈로그와 일치한다 — 57종 전부', () => {
    for (const [id, meta] of Object.entries(CALCULATOR_CATALOG)) {
      expect(calculatorHref(id)).toBe(`/calc/${meta.category}/${id}`);
    }
  });

  it('입력을 쿼리로 실어 보낸다 — 상세 페이지가 폼을 미리 채운다', () => {
    const href = calculatorHref('voltage-drop', { voltage: 380, current: 60, conductor: 'Cu' });
    expect(href.startsWith('/calc/voltage-drop/voltage-drop?')).toBe(true);
    const query = new URLSearchParams(href.split('?')[1]);
    expect(query.get('voltage')).toBe('380');
    expect(query.get('current')).toBe('60');
    expect(query.get('conductor')).toBe('Cu');
  });

  it('빈 값과 객체는 싣지 않는다 — 상세 페이지가 못 읽는다', () => {
    const href = calculatorHref('voltage-drop', {
      voltage: 380, empty: '', nothing: undefined, nada: null, list: [1, 2], obj: { a: 1 },
    });
    const query = new URLSearchParams(href.split('?')[1]);
    expect([...query.keys()]).toEqual(['voltage']);
  });

  it('실을 값이 없으면 물음표를 붙이지 않는다', () => {
    expect(calculatorHref('voltage-drop', {})).toBe('/calc/voltage-drop/voltage-drop');
  });
});

describe('분야 지도 사본', () => {
  const pages = readdirSync(join(process.cwd(), 'src/app'), { recursive: true, encoding: 'utf-8' })
    .filter((p) => p.endsWith('.tsx'))
    .map((p) => join(process.cwd(), 'src/app', p));

  it('화면이 분야 지도를 따로 들지 않는다', () => {
    const offenders = pages.filter((p) => /CALC_CATEGORY_MAP/.test(readFileSync(p, 'utf-8')));
    expect(offenders.map((p) => p.replace(process.cwd(), ''))).toEqual([]);
  });

  it('죽은 링크 `/calc?open=` 이 남아 있지 않다', () => {
    const offenders = pages.filter((p) => /\/calc\?open=/.test(readFileSync(p, 'utf-8')));
    expect(offenders.map((p) => p.replace(process.cwd(), ''))).toEqual([]);
  });
});
