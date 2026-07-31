import { buildRecommendations } from '../recommendation-engine';
import { describeStandardRef, describeStandardRefs } from '../rule-basis';
import type { SymbolNode } from '../types-v3';

/**
 * 보류에 **근거가 붙어 나가는지** 본다.
 *
 * 화면이 「보류 · 규칙 1건」 처럼 개수만 보여주면 사용자는 왜 판정이 안 됐는지
 * 알 수 없다. 근거를 인용하지 않은 거절은 실무자가 수긍할 수 없고, 이 제품이
 * 파는 것이 바로 그 근거다.
 */
describe('rule-basis', () => {
  it('기준서 조항은 발행기관과 원문 경로가 붙는다', () => {
    const basis = describeStandardRef('KEC 212 과전류에 대한 보호');
    expect(basis).toBeDefined();
    expect(basis!.internal).toBe(false);
    expect(basis!.label).toBe('KEC 212 과전류에 대한 보호');
    expect(basis!.basis).toContain('산업통상자원부');
    expect(basis!.originUrl).toBe('https://www.motie.go.kr');
  });

  it('ESA 자체 규칙은 기준서인 척하지 않는다', () => {
    const basis = describeStandardRef('ESA-SLD-RULE:ORPHAN-CONNECTION');
    expect(basis).toBeDefined();
    expect(basis!.internal).toBe(true);
    expect(basis!.originUrl).toBeUndefined();
    expect(basis!.basis.length).toBeGreaterThan(40);
  });

  /**
   * 포장 금지 — 해석 못 하는 문자열을 그럴듯한 근거 문장으로 바꾸면
   * 「근거 없는 확정 소견을 막는다」는 이 계층의 목적이 무너진다.
   */
  it('해석되지 않는 근거는 버린다 — 그럴듯하게 포장하지 않는다', () => {
    expect(describeStandardRef('KEC 접지')).toBeUndefined();
    expect(describeStandardRef('ESA-SLD-RULE:없는-규칙')).toBeUndefined();
    expect(describeStandardRef('WHATEVER 1.2')).toBeUndefined();
    // 실재하지 않는 KEC 조항은 근거로 나가지 않는다.
    expect(describeStandardRef('KEC 232.52')).toBeUndefined(); // kec-citation-exempt
    expect(describeStandardRefs(['KEC 접지', 'KEC 142 접지시스템의 시설'])).toHaveLength(1);
  });

  /**
   * 실제로 배출되는 제안의 근거가 전부 해석되는지 — 규칙이 있어도 실물이
   * 해석 안 되면 화면은 여전히 비어 있다(§2.2 등록 ≠ 발화).
   */
  it('엔진이 실제로 내는 근거가 전부 해석된다', () => {
    const mk = (id: string, type: string): SymbolNode => ({
      id,
      displayId: id,
      typeCandidates: [type],
      confirmedType: type,
      certainty: 'confirmed',
      evidence: [{ evidenceId: `${id}-e`, pageIndex: 0, bounds: { x: 0, y: 0, w: 1, h: 1 }, confidence: 1 }],
    });
    const recs = buildRecommendations({
      symbols: [mk('G1', 'generator'), mk('L1', 'load'), mk('X1', 'vcb')],
      relations: [{
        id: 'r1',
        displayId: 'P01-R001',
        from: 'G1',
        to: 'L1',
        certainty: 'confirmed',
        evidence: [{ evidenceId: 'r1-e', pageIndex: 0, bounds: { x: 0, y: 0, w: 1, h: 1 }, confidence: 1 }],
      }],
      calculations: [],
      unresolved: [],
      hasGroundPath: false,
      coverageEvidenceIds: ['cov-1'],
      coverageComplete: true,
    });

    const refs = [...new Set(recs.flatMap((r) => r.standardRefs))];
    expect(refs.length).toBeGreaterThan(0);
    const unresolved = refs.filter((ref) => describeStandardRef(ref) === undefined);
    expect(unresolved).toEqual([]);
  });
});
