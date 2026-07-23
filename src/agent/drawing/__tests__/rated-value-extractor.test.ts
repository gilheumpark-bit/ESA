/**
 * rated-value-extractor — 단위 파싱 known-answer 회귀 가드
 *
 * 이 모듈은 테스트 0이었고(게이트 커버리지 착시), 그 사이 정본 spec-text.ts가
 * 고친 kVA/콤마 버그가 구판 복제본에 그대로 살아 있었다(라이브 재현: 1000kVA→
 * 1000kV, 22,900V→900V · drawing-jobs 파이프라인 소비). 여기서 잠근다.
 */

import { extractRatedValues } from '../rated-value-extractor';
import type { TextNode } from '../types-v3';

const evidence = (pageIndex = 0) => [{
  evidenceId: 'e1', pageIndex,
  bounds: { x: 0, y: 0, w: 10, h: 10 },
  confidence: 0.9,
}];

const textOf = (rawText: string): TextNode => ({
  id: 't1', displayId: 'T1', rawText, candidates: [rawText],
  certainty: 'confirmed', evidence: evidence(),
});

function parseOne(raw: string) {
  const r = extractRatedValues([textOf(raw)], []);
  return r[0]?.normalized;
}

describe('단위 파싱 — 최장일치·콤마·부정탐색 (버그 사냥 수리)', () => {
  it('1000kVA는 용량이지 1000kV 전압이 아니다', () => {
    expect(parseOne('1000 kVA')).toEqual({ value: 1000, unit: 'kVA' });
  });

  it('22,900V(천단위 콤마)는 22900V이지 900V가 아니다', () => {
    expect(parseOne('22,900V')).toEqual({ value: 22900, unit: 'V' });
  });

  it.each([
    ['500kVA', 500, 'kVA'],
    ['22.9kV', 22.9, 'kV'],
    ['380V', 380, 'V'],
    ['100A', 100, 'A'],
    ['25kA', 25, 'kA'],
    ['15kW', 15, 'kW'],
    ['96 MVAR', 96, 'MVAR'],
    ['150 mm2', 150, 'mm2'],
    ['2,500 kVA', 2500, 'kVA'],
  ])('%s → %f %s', (raw, value, unit) => {
    const n = parseOne(raw as string);
    expect(n?.value).toBe(value);
    expect(n?.unit.toLowerCase()).toBe((unit as string).toLowerCase());
  });

  it('단위 없는 텍스트는 값을 만들지 않는다', () => {
    expect(extractRatedValues([textOf('분전반 상세도')], [])).toHaveLength(0);
  });

  it('confirmedText가 rawText보다 우선한다', () => {
    const t: TextNode = { ...textOf('1OOA'), confirmedText: '100A' };
    expect(extractRatedValues([t], [])[0]?.normalized).toEqual({ value: 100, unit: 'A' });
  });
});
