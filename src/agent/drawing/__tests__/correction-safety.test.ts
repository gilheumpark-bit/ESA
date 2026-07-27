import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyDrawingCorrection } from '../apply-drawing-correction';
import type { DrawingDocumentV3 } from '../types-v3';

/**
 * 사용자 정정이 **판정을 조용히 바꾸지 않는지** 본다.
 *
 * 이 경로는 사용자가 OCR 판독을 직접 고치는 곳이다. 고친 값이 그대로
 * 계산·판정에 반영되면, 사용자가 실수로 혹은 의도적으로 넣은 값이
 * "적합" 판정을 만들어 낼 수 있다. 현재 구현은 그렇게 하지 않는다 —
 * 정정된 근거를 쓰던 계산을 **무효로 돌리고** 재분석을 요구한다.
 * 그 태도를 잠근다.
 *
 * 함께 잠그는 것: 정정본은 golden(정답 데이터) 후보가 되지 않는다.
 * 사용자가 넣은 값이 학습·평가 기준으로 승격되면 그 뒤 모든 측정이
 * 자기 순환이 된다(§2.3).
 */
/**
 * 모양은 `apply-drawing-correction.test.ts` 의 픽스처를 따른다 — 거기서
 * 이미 검증된 형태다. 다른 점 하나: 계산을 `compliant: true` 로 두고
 * 시작한다. 정정이 그 "적합" 을 실제로 무효로 돌리는지 보려면 무효가
 * 아닌 상태에서 출발해야 한다.
 */
const base = (): DrawingDocumentV3 => ({
  schemaVersion: 3,
  documentHash: 'a'.repeat(64),
  pageCount: 1,
  requestedPages: 'all',
  jobStatus: 'COMPLETE',
  pages: [{ pageIndex: 0, status: 'complete', drawingKind: 'sld', vlmCalls: 18 }],
  coverageLedger: {
    plannedRegionCount: 1, regionsComplete: 1, regionsFailed: 0, regionsSkippedEmpty: 0,
    rolesPresent: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'],
    unresolvedRescans: 0, allPlannedFinished: true,
    regions: [{
      regionId: 'p0-full', pageIndex: 0, kind: 'full-page', bounds: { x: 0, y: 0, w: 100, h: 80 },
      requiredRoles: ['symbols'], roleCalls: { symbols: [{ callId: 'call', success: true }] }, status: 'complete',
    }],
  },
  evidenceGraph: {
    symbols: [{
      id: 'sym-0-1', displayId: 'P01-S001', typeCandidates: ['vcb'], confirmedType: 'vcb',
      rawLabel: 'VCB-1', certainty: 'confirmed',
      evidence: [{ evidenceId: 'sym-e', pageIndex: 0, bounds: { x: 10, y: 10, w: 10, h: 10 }, confidence: 0.95 }],
    }],
    lines: [],
    texts: [{
      id: 'txt-0-1', displayId: 'P01-T001', rawText: '1OOA', candidates: ['100A', '1OOA'],
      certainty: 'ambiguous', holdCode: 'AMBIGUOUS_OCR',
      evidence: [{ evidenceId: 'text-e', pageIndex: 0, bounds: { x: 20, y: 10, w: 20, h: 8 }, confidence: 0.8 }],
    }],
    relations: [],
  },
  crossPageRelations: [],
  equipmentCounts: [],
  ratedValues: [],
  calculations: [{
    id: 'P01-calc-1', calculatorId: 'breaker-sizing', label: '차단기 용량',
    value: 100, unit: 'A', compliant: true, receiptHash: 'b'.repeat(64), evidenceIds: ['text-e'],
  }],
  recommendations: [],
  unresolvedItems: [{
    id: 'ocr-0-1', code: 'AMBIGUOUS_OCR', displayId: 'P01-T001', pageIndex: 0,
    bounds: { x: 20, y: 10, w: 20, h: 8 }, note: '후보 확인',
  }],
  userCorrections: [],
  verification: {
    claimsComplete: true, documentStatus: 'COMPLETE', holdReasons: [], evidenceTraceRate: 1,
    verified95: true, productionFingerprint: { engineVersion: 'e', promptVersion: 'p', preprocessVersion: 'x' },
  },
  title: '전체 도면 판독표',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as DrawingDocumentV3);

const correct = (doc: DrawingDocumentV3, selectedValue = '100A') => applyDrawingCorrection(doc, {
  targetDisplayId: 'P01-T001',
  selectedValue,
  correctionKind: 'text',
  idempotencyKey: 'key-abcdefgh',
  correctedBy: 'anonymous-session',
  sourceAvailable: true,
});

describe('사용자 정정 — 판정 안전', () => {
  it('정정된 근거를 쓰던 계산은 무효가 된다 — 값을 유지한 채 "적합" 을 남기지 않는다', () => {
    const out = correct(base());
    const calc = out.calculations.find((c) => c.id === 'P01-calc-1')!;
    expect(calc.value).toBeUndefined();
    expect(calc.compliant).toBeNull();
    expect(calc.receiptHash).toBeUndefined();
    expect(calc.note).toContain('재분석');
  });

  /**
   * 여기가 핵심이다. 사용자가 아무 값이나 넣어 "적합" 을 만들 수 있으면
   * 이 앱의 판정은 의미가 없다.
   */
  it('사용자가 넣은 값으로 적합 판정이 생기지 않는다', () => {
    const out = correct(base(), '9999A');
    expect(out.calculations.every((c) => c.compliant !== true)).toBe(true);
  });

  it('정정 후에는 재분석이 필요하다고 표시한다', () => {
    const out = correct(base());
    expect(out.jobStatus).toBe('PARTIAL');
    expect(out.pages[0].status).toBe('failed');
    expect(out.unresolvedItems.some((i) => i.code === 'CORRECTION_REANALYSIS_REQUIRED')).toBe(true);
  });

  it('정정본은 golden 후보가 아니다 — 사용자 입력이 정답 기준이 되면 이후 측정이 자기 순환이다', () => {
    const out = correct(base());
    expect(out.userCorrections.at(-1)!.goldenEligible).toBe(false);
  });

  it('무엇이 어떻게 바뀌었는지 전후를 남긴다', () => {
    const out = correct(base());
    const rec = out.userCorrections.at(-1)!;
    // `recalc*` 는 스냅샷이라 타입이 느슨하다 — 여기서만 좁혀 읽는다.
    type CalcSnapshot = { id: string; compliant: boolean | null };
    const snap = (side: unknown) => (side as { calculations: CalcSnapshot[] }).calculations;
    expect(snap(rec.recalcBefore).find((c) => c.id === 'P01-calc-1')?.compliant).toBe(true);
    expect(snap(rec.recalcAfter).find((c) => c.id === 'P01-calc-1')?.compliant).toBeNull();
    expect(rec.originalCandidates).toEqual(expect.arrayContaining(['100A', '1OOA']));
    expect(rec.affectedEntityIds).toContain('P01-T001');
  });

  it('정정한 항목의 미확정 표시는 사라지고 새 사유가 붙는다', () => {
    const out = correct(base());
    expect(out.unresolvedItems.some((i) => i.code === 'AMBIGUOUS_OCR' && i.displayId === 'P01-T001')).toBe(false);
    expect(out.unresolvedItems.some((i) => i.displayId === 'P01-T001')).toBe(true);
  });

  it('없는 대상·종류 불일치는 던진다 — 조용히 통과시키지 않는다', () => {
    expect(() => applyDrawingCorrection(base(), {
      targetDisplayId: 'P01-T999', selectedValue: 'x', correctionKind: 'text',
      idempotencyKey: 'k-12345678', correctedBy: 'anonymous-session',
    })).toThrow('DRAWING_CORRECTION_TARGET_NOT_FOUND');

    expect(() => applyDrawingCorrection(base(), {
      targetDisplayId: 'P01-T001', selectedValue: 'x', correctionKind: 'type',
      idempotencyKey: 'k-12345678', correctedBy: 'anonymous-session',
    })).toThrow('DRAWING_CORRECTION_KIND_MISMATCH');
  });
});

/**
 * 라우트 쪽 관문은 한 줄씩이라 지우기 쉽고, 지워도 로직 테스트는 통과한다.
 * 무엇을 지키고 있었는지 이름으로 적어 둔다 — 이 라우트는 테스트가 하나도
 * 없었다(실측 2026-07-28: 무테스트 API 라우트 17 개 중 하나).
 */
describe('정정 라우트 관문', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', '..', 'app', 'api', 'drawing-jobs', '[jobId]', 'corrections', 'route.ts'),
    'utf8',
  );

  it.each([
    ['출처 검증', 'isRequestOriginAllowed'],
    ['호출 빈도', 'applyRateLimit'],
    ['소유권', 'getOwnedJob(jobId, owner.ownerId)'],
    ['멱등키 재생', 'item.idempotencyKey === body.idempotencyKey'],
    ['낙관적 동시성', 'updateOwnedJobIfDocumentVersion'],
    ['분석 중 수정 차단', "['COMPLETE', 'PARTIAL'].includes(job.status)"],
  ])('%s 관문이 있다', (_이름, needle) => {
    expect(route).toContain(needle);
  });

  it('대상 식별자 형식을 강제한다 — 임의 문자열로 내부를 짚지 못하게', () => {
    expect(route).toContain('/^P\\d{2,}-[STL]\\d{3,}$/');
  });

  it('정정 값의 길이와 제어문자를 막는다', () => {
    expect(route).toContain('body.selectedValue.length > 200');
    expect(route).toContain('\\u0000-\\u001f');
  });
});
