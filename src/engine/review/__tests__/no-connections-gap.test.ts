import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { reviewAnalysis } from '../circuit-review';
import type { SLDAnalysis } from '@/lib/sld-recognition';

/**
 * 규칙 5 — **연결을 하나도 읽지 못한 결과**를 정직하게 선언하는가.
 *
 * 왜 이 규칙이 있나(2026-07-28 스캔 티어 실증, n=8):
 * 연결 0 인 4 회는 차단기 수를 **2.3~7.0 배** 틀렸고(12·6 vs 정답 42 /
 * 14·24 vs 정답 6), 연결이 잡힌 4 회는 **1.0~1.29 배**에 머물렀다
 * (6/6 · 7·8·7 vs 9). 두 무리 사이가 비어 있다. 그런데 화면에는 부품
 * 목록이 그대로 떴다 — 사용자는 계통까지 읽힌 것으로 읽는다.
 *
 * 다만 이 규칙의 근거는 그 상관이 아니다. **연결이 0 이면 계통 판정이
 * 불가하다는 것은 출력에 대한 사실**이고, 임계도 교보재도 필요 없다.
 * n=8 은 뒷받침일 뿐이라 아래 ⑥ 이 그 표를 실제로 읽어 확인한다.
 */

function analysis(over: Partial<SLDAnalysis> = {}): SLDAnalysis {
  return {
    components: [], connections: [], suggestedCalculations: [],
    confidence: 0.5, rawDescription: '', ...over,
  } as SLDAnalysis;
}

const comp = (id: string, type: string, label = '') =>
  ({ id, type, label, position: { x: 0, y: 0 } }) as unknown as SLDAnalysis['components'][number];

const conn = (from: string, to: string) =>
  ({ from, to }) as unknown as SLDAnalysis['connections'][number];

/** 규칙 5 가 낸 항목만 — 규칙 4(케이블 갭)와 같은 rule 이라 subject 로 가른다. */
const structureGap = (a: SLDAnalysis) =>
  reviewAnalysis(a).findings.filter((f) => f.subject === '페이지 전체 — 계통');

describe('연결 전무 — 계통 판정 불가 선언', () => {
  it('① 부품 여럿 · 연결 0 이면 판정 보류를 낸다', () => {
    const found = structureGap(analysis({
      components: [comp('comp_1', 'breaker', '225AF/150AT'), comp('comp_2', 'breaker'), comp('comp_3', 'bus')],
    }));
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('UNKNOWN');
    expect(found[0].given['읽은 연결']).toBe('0');
    expect(found[0].verdict).toContain('연결선을 하나도 읽지 못했다');
  });

  it('② 연결이 하나라도 있으면 내지 않는다 — 부분 판독을 전멸로 부르지 않는다', () => {
    expect(structureGap(analysis({
      components: [comp('comp_1', 'breaker'), comp('comp_2', 'breaker')],
      connections: [conn('comp_1', 'comp_2')],
    }))).toHaveLength(0);
  });

  it('③ 부품이 하나뿐이면 내지 않는다 — 연결이 없는 게 정상이다', () => {
    expect(structureGap(analysis({ components: [comp('comp_1', 'breaker')] }))).toHaveLength(0);
  });

  it('④ 스케줄 표 문서는 제외한다 — 표에 결선이 없는 건 정상이다', () => {
    expect(structureGap(analysis({
      components: [comp('comp_1', 'breaker'), comp('comp_2', 'breaker')],
      scheduleTables: [{ title: '간선 스케줄', columns: [], rows: [] }],
    }))).toHaveLength(0);
  });

  /**
   * ⑤ 규칙 4 는 이 상황을 "케이블 미결속 N/N" 으로만 적는다. 그 문구는
   * 케이블 정보가 모자란 것으로 읽히지 계통을 통째로 못 읽은 것으로는
   * 읽히지 않는다 — 그래서 따로 낸다. 둘 다 나와야 한다.
   */
  it('⑤ 케이블 갭과 계통 갭을 둘 다 낸다 — 하나로 뭉개지 않는다', () => {
    const report = reviewAnalysis(analysis({
      components: [comp('comp_1', 'breaker', '225AF/150AT'), comp('comp_2', 'breaker', '100AF/60AT')],
    }));
    const gaps = report.findings.filter((f) => f.rule === 'DATA-GAP');
    expect(gaps).toHaveLength(2);
    expect(gaps.map((g) => g.subject)).toEqual(
      expect.arrayContaining(['페이지 전체', '페이지 전체 — 계통']),
    );
  });

  /**
   * ⑥ 실측 표를 실제로 읽는다. 주석의 숫자가 표와 어긋나면 여기서 깨진다 —
   * 근거를 적어 놓고 표가 바뀌는 것이 이 프로젝트의 실패 모드였다.
   */
  it('⑥ 실측 영수증에서 연결 0 과 대량 오독이 실제로 겹친다', () => {
    const p = join(__dirname, '..', '..', '..', '..', 'test-results', 'scan-tier-results.json');
    if (!existsSync(p)) return; // 영수증은 gitignore 대상일 수 있다 — 없으면 건너뛴다.

    const runs = (JSON.parse(readFileSync(p, 'utf8')).results as Array<{
      status: number; connections?: number; breakers?: number; label?: { breakers?: number };
    }>).filter((r) => r.status === 200 && typeof r.connections === 'number');

    expect(runs.length).toBeGreaterThanOrEqual(8);

    // 정답 대비 배수 오차. 경계 2 배는 실측의 **빈 구간**에서 골랐다 —
    // 연결 0 은 2.33 배부터, 연결 있음은 1.29 배까지라 그 사이가 비어 있다.
    // 처음엔 3 배로 적었다가 p14 scan-light(2.33 배)에 이 검사가 깨졌다.
    const wildlyOff = (r: { breakers?: number; label?: { breakers?: number } }) => {
      const got = r.breakers ?? 0;
      const want = r.label?.breakers ?? 0;
      if (want === 0 || got === 0) return want !== got;
      return got / want >= 2 || want / got >= 2;
    };

    const zero = runs.filter((r) => r.connections === 0);
    const some = runs.filter((r) => (r.connections ?? 0) > 0);

    expect(zero.length).toBeGreaterThan(0);
    expect(some.length).toBeGreaterThan(0);
    // 연결 0 은 전부 대량 오독이었고, 연결이 잡힌 것은 하나도 아니었다.
    expect(zero.every(wildlyOff)).toBe(true);
    expect(some.some(wildlyOff)).toBe(false);
  });
});
