import { buildRecommendations, hasRequiredLinks } from '../recommendation-engine';
import type { SymbolNode, UnresolvedItem } from '../types-v3';

const mk = (id: string, type: string, certainty: 'confirmed' | 'ambiguous' = 'confirmed'): SymbolNode => ({
  id,
  displayId: id,
  typeCandidates: [type],
  confirmedType: type,
  certainty,
  evidence: [{ evidenceId: `${id}-e`, pageIndex: 0, bounds: { x: 0, y: 0, w: 10, h: 10 }, confidence: 1 }],
});

describe('recommendation-engine', () => {
  it('HOLDs breaker rating without inventing upsize', () => {
    const recs = buildRecommendations({
      symbols: [mk('P03-S012', 'vcb')],
      relations: [],
      calculations: [],
      unresolved: [],
      coverageComplete: true,
    });
    const hold = recs.find((r) => r.status === 'HOLD' && r.problem.includes('P03-S012'));
    expect(hold).toBeDefined();
    expect(hold!.recommendedAction).toMatch(/부하전류/);
    expect(hold!.recommendedAction).not.toMatch(/증설하십시오/);
  });

  it('rejects SUPPORTED without evidence', () => {
    expect(hasRequiredLinks({
      id: 'x',
      severity: 'major',
      priority: 1,
      problem: 'x',
      relatedDisplayIds: [],
      evidenceIds: [],
      calcReceiptIds: [],
      standardRefs: ['KEC'],
      requiredInputs: [],
      recommendedAction: 'y',
      status: 'SUPPORTED',
    })).toBe(false);
  });

  it('flags power path without protection', () => {
    const recs = buildRecommendations({
      symbols: [mk('s1', 'generator'), mk('s2', 'load')],
      relations: [{
        id: 'r1',
        displayId: 'P01-R001',
        from: 's1',
        to: 's2',
        certainty: 'confirmed',
        evidence: [
          { evidenceId: 'e1', pageIndex: 0, bounds: { x: 0, y: 0, w: 1, h: 1 }, confidence: 1 },
        ],
      }],
      calculations: [],
      unresolved: [],
      coverageComplete: true,
    });
    expect(recs.some((r) => r.problem.includes('보호기'))).toBe(true);
  });

  it('uses coverage evidence for an absent-ground finding and keeps unresolved topology as HOLD', () => {
    const recs = buildRecommendations({
      symbols: [mk('P01-S001', 'load')], relations: [], calculations: [],
      unresolved: [{ id: 'u1', code: 'LINE_CONTINUITY_UNCERTAIN', displayId: 'P01-L001', pageIndex: 0, bounds: { x: 0, y: 0, w: 20, h: 2 }, note: '종단 장치 미확정' }],
      hasGroundPath: false,
      coverageEvidenceIds: ['coverage-call-1'],
      coverageComplete: true,
    });
    expect(recs).toEqual(expect.arrayContaining([
      expect.objectContaining({ problem: expect.stringContaining('접지 경로'), status: 'SUPPORTED', evidenceIds: expect.arrayContaining(['coverage-call-1']) }),
      expect.objectContaining({ problem: expect.stringContaining('P01-L001'), status: 'HOLD' }),
    ]));
  });

  it('keeps absence findings on HOLD while coverage is partial', () => {
    const recs = buildRecommendations({
      symbols: [mk('s1', 'generator'), mk('s2', 'load')],
      relations: [{ id: 'r1', displayId: 'P01-R001', from: 's1', to: 's2', certainty: 'confirmed', evidence: [mk('e', 'line').evidence[0]] }],
      calculations: [], unresolved: [], hasGroundPath: false,
      coverageEvidenceIds: ['coverage-call-1'], coverageComplete: false,
    });
    expect(recs.filter((r) => /보호기|접지 경로/.test(r.problem)).every((r) => r.status === 'HOLD')).toBe(true);
  });
  /**
   * 실측 결함: 차단기 정격 보류가 **문서 전역 조건**으로 사라졌다.
   *
   * 기기별로 결박한 계산을 구해 놓고 판정은 `input.calculations.some()` 이었다.
   * 그래서 도면 어딘가에 부하전류 계산이 하나만 있으면, 근거가 전혀 없는 다른
   * 차단기 전부의 「정격 적합성 판정 보류」가 통째로 사라졌다 — 주의를
   * 누락하는 방향이라 위험하다.
   */
  it('다른 기기의 부하전류 계산이 이 차단기의 보류를 지우지 않는다', () => {
    const other = mk('P01-S001', 'vcb');
    const target = mk('P01-S002', 'vcb');
    const recs = buildRecommendations({
      symbols: [other, target],
      relations: [],
      calculations: [{
        id: 'c1',
        calculatorId: 'load-current',
        label: '부하전류',
        value: 120,
        compliant: true,
        // **다른 기기**의 근거에만 결박된 계산이다.
        evidenceIds: ['P01-S001-e'],
        receiptHash: 'h1',
      }],
      unresolved: [],
      coverageComplete: true,
    });
    expect(recs.find((r) => r.problem.includes('P01-S002') && r.status === 'HOLD')).toBeDefined();
    expect(recs.find((r) => r.problem.includes('P01-S001') && r.status === 'HOLD')).toBeUndefined();
  });

  /**
   * 실측 결함: 종류 미확정 기호를 1순위 추측으로 분류했다.
   *
   * `confirmedType` 은 선택 필드라 `certainty: 'confirmed'` 여도 비어 있을 수
   * 있고, 그때 분류가 `typeCandidates[0]` 으로 내려간다. 그 추측이 critical
   * 소견의 입력이므로 SUPPORTED 로 확정하면 안 된다.
   */
  it('종류 미확정 기기가 낀 보호 경로 소견은 SUPPORTED 가 아니라 HOLD 다', () => {
    const src = mk('G1', 'generator');
    const load = mk('L1', 'load');
    const mid: SymbolNode = { ...mk('U1', 'unknown'), confirmedType: undefined };
    const edge = (id: string, from: string, to: string) => ({
      id,
      displayId: id,
      from,
      to,
      certainty: 'confirmed' as const,
      evidence: [{ evidenceId: `${id}-e`, pageIndex: 0, bounds: { x: 0, y: 0, w: 1, h: 1 }, confidence: 1 }],
    });
    const recs = buildRecommendations({
      symbols: [src, mid, load],
      relations: [edge('r1', 'G1', 'U1'), edge('r2', 'U1', 'L1')],
      calculations: [],
      unresolved: [],
      coverageComplete: true,
    });
    const path = recs.find((r) => r.problem.includes('보호기가 확인되지 않습니다'));
    expect(path).toBeDefined();
    expect(path!.status).toBe('HOLD');
    expect(path!.requiredInputs.join(' ')).toContain('기기 종류 확정: U1');
  });

  it('같은 페이지의 고아 장치를 한 제안으로 묶되 모든 도면 번호와 근거를 보존한다', () => {
    const symbols = Array.from({ length: 25 }, (_, index) => {
      const symbol = mk(`P01-S${String(index + 1).padStart(3, '0')}`, 'load');
      return {
        ...symbol,
        evidence: [{ ...symbol.evidence[0], pageIndex: 0 }],
      };
    });
    const recs = buildRecommendations({
      symbols,
      relations: [],
      calculations: [],
      unresolved: [],
      coverageComplete: true,
    });
    const orphan = recs.filter((item) => item.standardRefs.includes('ESA-SLD-RULE:ORPHAN-CONNECTION'));
    expect(orphan).toHaveLength(1);
    expect(orphan[0].problem).toContain('25개');
    expect(orphan[0].relatedDisplayIds).toHaveLength(25);
    expect(orphan[0].evidenceIds).toHaveLength(25);
  });

  it('같은 페이지·같은 코드의 미해결 항목을 한 제안으로 묶고 원본 항목 번호를 보존한다', () => {
    const unresolved: UnresolvedItem[] = Array.from({ length: 40 }, (_, index) => ({
      id: `ocr-${index + 1}`,
      code: 'AMBIGUOUS_OCR',
      displayId: `P01-T${String(index + 1).padStart(3, '0')}`,
      pageIndex: 0,
      bounds: { x: 0, y: index, w: 10, h: 2 },
      note: `OCR 후보 ${index + 1} 확인`,
    }));
    const recs = buildRecommendations({
      symbols: [], relations: [], calculations: [], unresolved,
      coverageComplete: false,
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ status: 'HOLD', relatedDisplayIds: expect.any(Array) });
    expect(recs[0].problem).toContain('40건');
    expect(recs[0].relatedDisplayIds).toHaveLength(40);
    expect(recs[0].relatedDisplayIds[0]).toBe('P01-T001');
    expect(recs[0].relatedDisplayIds[39]).toBe('P01-T040');
  });

  it('미해결 제안은 페이지나 원인이 다르면 합치지 않는다', () => {
    const recs = buildRecommendations({
      symbols: [], relations: [], calculations: [],
      unresolved: [
        { id: 'u1', code: 'AMBIGUOUS_OCR', displayId: 'P01-T001', pageIndex: 0, bounds: { x: 0, y: 0, w: 1, h: 1 }, note: '확인 1' },
        { id: 'u2', code: 'AMBIGUOUS_OCR', displayId: 'P02-T001', pageIndex: 1, bounds: { x: 0, y: 0, w: 1, h: 1 }, note: '확인 2' },
        { id: 'u3', code: 'LINE_CONTINUITY_UNCERTAIN', displayId: 'P01-L001', pageIndex: 0, bounds: { x: 0, y: 0, w: 1, h: 1 }, note: '확인 3' },
      ],
      coverageComplete: false,
    });
    expect(recs).toHaveLength(3);
  });
});

// ============================================================
// 2026-07-24 회귀 잠금 — 제안 계층 결함 3건
// ============================================================

describe('recommendation-engine — 근거 결박 회귀', () => {
  const breaker = (id: string): SymbolNode => ({
    id,
    displayId: id,
    typeCandidates: ['mccb'],
    confirmedType: 'mccb',
    certainty: 'confirmed',
    evidence: [{ evidenceId: `${id}-e`, pageIndex: 0, bounds: { x: 0, y: 0, w: 10, h: 10 }, confidence: 1 }],
  });

  it('부하전류 계산은 그 기기에 결박된 것만 인정한다 — 다른 회로의 계산이 보류를 지우지 않는다', () => {
    const withCalc = breaker('P01-S001');
    const withoutCalc = breaker('P01-S002');
    const recs = buildRecommendations({
      symbols: [withCalc, withoutCalc],
      relations: [],
      calculations: [{
        id: 'c1',
        calculatorId: 'load-current',
        label: '부하전류',
        value: 100,
        compliant: true,
        evidenceIds: ['P01-S001-e'],   // withCalc의 근거에만 결박
      }],
      unresolved: [],
      coverageComplete: true,
    });
    const ratingHold = (displayId: string) => recs.find(
      (r) => r.problem.includes(displayId) && r.problem.includes('정격 적합성'),
    );
    // 근거가 결박된 기기는 보류 소견이 사라진다.
    expect(ratingHold('P01-S001')).toBeUndefined();
    // 근거가 없는 기기는 다른 회로의 계산과 무관하게 보류가 유지돼야 한다.
    expect(ratingHold('P01-S002')).toBeDefined();
    expect(ratingHold('P01-S002')!.status).toBe('HOLD');
  });

  it('기기 종류가 확정되지 않으면 소견을 SUPPORTED로 확정하지 않는다', () => {
    const guessed: SymbolNode = {
      id: 'P01-S010',
      displayId: 'P01-S010',
      typeCandidates: ['load'],   // 1순위 추측만 있고 confirmedType 없음
      certainty: 'confirmed',
      evidence: [{ evidenceId: 'P01-S010-e', pageIndex: 0, bounds: { x: 0, y: 0, w: 4, h: 4 }, confidence: 1 }],
    };
    const recs = buildRecommendations({
      symbols: [guessed],
      relations: [],
      calculations: [],
      unresolved: [],
      coverageComplete: true,   // 판독은 완전한데도
    });
    const orphan = recs.find((r) => r.problem.includes('고아 장치'));
    expect(orphan).toBeDefined();
    expect(orphan!.status).toBe('HOLD');
    expect(orphan!.requiredInputs.join(' ')).toContain('기기 종류 확정');
  });

  it('자유 문구 표준 근거는 SUPPORTED를 통과시키지 못한다', () => {
    const base = {
      id: 'x',
      severity: 'major' as const,
      priority: 1,
      problem: 'x',
      relatedDisplayIds: [],
      evidenceIds: ['e1'],
      calcReceiptIds: [],
      requiredInputs: [],
      recommendedAction: 'y',
      status: 'SUPPORTED' as const,
    };
    // 조항 번호가 아닌 자유 문구 — 사용자가 원문을 찾아갈 수 없다.
    expect(hasRequiredLinks({ ...base, standardRefs: ['KEC 접지'] })).toBe(false);
    expect(hasRequiredLinks({ ...base, standardRefs: ['KEC 보호 일반'] })).toBe(false);
    // ESA 자체 규칙 식별자 — 기준서인 척하지 않으므로 허용한다.
    expect(hasRequiredLinks({ ...base, standardRefs: ['ESA-SLD-RULE:ORPHAN-CONNECTION'] })).toBe(true);
    // 인용 레지스트리에서 해석되는 실제 조항도 허용한다.
    expect(hasRequiredLinks({ ...base, standardRefs: ['KEC 232.51'] })).toBe(true);
  });
});
