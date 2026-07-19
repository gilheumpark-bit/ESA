/**
 * Batch C2 무결성 배선 검증
 *
 * (a) G2 — ESA(전기사업법)·NER(내선규정) 조문이 registry(getCodeArticle/evaluateStandard)로
 *     라우팅되고, 산문 조문은 자리표시자 가드로 HOLD 된다(임계값 지어내기 금지 잠금).
 *     주의: 두 기준서 모두 country='KR'(ESA_META/NER_META 실측)이라 KEC와 국가를 공유한다.
 * (b) G3 — GET /api/calculate/[id]·GET /api/receipt/[id] 응답의 integrity 필드가
 *     verifyReceipt 재계산 대조로 VALID / TAMPERED / UNVERIFIABLE 을 정직하게 반환한다.
 */
import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

jest.mock('@/lib/supabase', () => ({ loadCalculation: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn(async () => null) }));

import type { NextRequest } from 'next/server';
import {
  evaluateStandard,
  getCodeArticle,
  getSupportedStandards,
  ESA_ARTICLES,
  NER_ARTICLES,
} from '@engine/standards/registry';
import { hashReceipt, type ReceiptClaim } from '@engine/receipt/receipt-hash';
import type { CalcResult } from '@engine/standards/types';
import { loadCalculation, type CalculationReceipt } from '@/lib/supabase';
import { GET as getCalculateById } from '@/app/api/calculate/[id]/route';
import { GET as getReceiptById } from '@/app/api/receipt/[id]/route';

// ═══════════════════════════════════════════════════════════════════════════════
// (a) G2 — ESA/NER 레지스트리 라우팅
// ═══════════════════════════════════════════════════════════════════════════════

describe('registry — ESA/NER 라우팅', () => {
  test('getCodeArticle: ESA 조문을 기준서명으로 조회한다 (country=KR 공유)', () => {
    const article = getCodeArticle('KR', 'ESA', 'ESA-61');
    expect(article).not.toBeNull();
    expect(article!.id).toBe('ESA-61');
    expect(article!.standard).toBe('ESA');
    expect(article!.country).toBe('KR');
    expect(article!.title).toBe('전기설비의 유지');
  });

  test('getCodeArticle: NER 조문은 접두사 없는 번호로도 조회된다', () => {
    const article = getCodeArticle('KR', 'NER', '2.1');
    expect(article).not.toBeNull();
    expect(article!.id).toBe('NER-2.1');
    expect(article!.standard).toBe('NER');
  });

  test('evaluateStandard: ESA 산문 조문은 HOLD + 적용 규칙 원문을 넘긴다', () => {
    const result = evaluateStandard('KR', 'ESA-62', {});
    expect(result.judgment).toBe('HOLD');
    const notes = result.notes.join(' ');
    expect(notes).toContain('자리표시자'); // evaluator-guard 경로로 보류됨
    expect(notes).toContain('정기'); // ESA-62 summary(정기검사 규칙)가 전달됨
  });

  test('evaluateStandard: NER 조문은 어떤 입력에도 자동 PASS 하지 않는다 (임계값 지어내기 금지)', () => {
    // placeholder param명과 충돌하는 키를 일부러 넣어도 가드가 먼저 발화해야 한다.
    const result = evaluateStandard('KR', 'NER-5.1', { '제5조 제1항': 999, sensitivity_mA: 1 });
    expect(result.judgment).toBe('HOLD');
    expect(result.judgment).not.toBe('PASS');
  });

  test('evaluateStandard: 미등록 NER id는 throw 없이 HOLD (KEC 분기로 새지 않는다)', () => {
    // 종전에는 country=KR이 KEC 분기에 선점되어 evaluateKEC가 미등록 id에 throw했다.
    const result = evaluateStandard('KR', 'NER-99.9', {});
    expect(result.judgment).toBe('HOLD');
    expect(result.notes.join(' ')).toContain('미등록');
  });

  test('evaluateStandard: KEC 라우팅 회귀 없음 (KR 기본 경로는 여전히 KEC)', () => {
    const result = evaluateStandard('KR', 'KEC-232.52-MAIN', { voltageDropPercent: 2 });
    expect(result.article.id.startsWith('KEC')).toBe(true);
    expect(['PASS', 'HOLD', 'FAIL', 'BLOCK']).toContain(result.judgment);
  });

  test('KR 지원 기준서 = KEC(정본) + NER + ESA · 조문 수 실측 잠금', () => {
    expect(getSupportedStandards('KR')).toEqual(['KEC', 'NER', 'ESA']);
    // 실측: esa-articles.ts 7개 조문 · ner-articles.ts 9개 조문 (지시서의 8·10과 다름 — 파일이 정본)
    expect(ESA_ARTICLES.length).toBe(7);
    expect(NER_ARTICLES.length).toBe(9);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// (b) G3 — 영수증 조회 경로의 verifyReceipt 실배선
// ═══════════════════════════════════════════════════════════════════════════════

const loadMock = jest.mocked(loadCalculation);

const baseClaim: ReceiptClaim = {
  calcId: 'voltage-drop',
  appliedStandard: 'KEC',
  standardVersion: 'KEC 2021',
  unitSystem: 'SI',
  inputs: { current_A: 25, length_m: 40 },
  result: { value: 2.4, unit: '%', source: [] } as unknown as CalcResult,
  steps: [{ step: 1, title: '전압강하', formula: 'e = (17.8*L*I)/(1000*A)', value: 2.4, unit: '%' }],
  formulaUsed: 'e = (17.8*L*I)/(1000*A)',
  standardsUsed: ['KEC 232.52'],
  engineVersion: '1.0.0',
};

let sealHash = '';

beforeAll(async () => {
  sealHash = await hashReceipt(baseClaim);
});

/** 봉인 시점 스냅샷(metadata) + 동일 값 컬럼 — 현행 POST writer가 기록하는 형태의 상위집합. */
function fullRow(
  overrides: Partial<CalculationReceipt> = {},
  metaOverrides: Record<string, unknown> = {},
): CalculationReceipt {
  return {
    id: 'r-1234567890',
    user_id: '', // 공개 영수증 — 소유권 검사(인증) 경로 미진입
    calculator_id: baseClaim.calcId,
    calculator_name: '전압강하 계산기',
    inputs: baseClaim.inputs as Record<string, unknown>,
    outputs: baseClaim.result as unknown as Record<string, unknown>,
    formula_used: baseClaim.formulaUsed,
    standard_ref: baseClaim.standardVersion,
    lang: 'ko',
    metadata: { ...baseClaim, receiptHash: sealHash, ...metaOverrides },
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const req = {} as unknown as NextRequest;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('GET /api/calculate/[id] · /api/receipt/[id] — integrity 필드', () => {
  beforeEach(() => {
    loadMock.mockReset();
  });

  test('VALID: 온전한 봉인 스냅샷은 재계산 해시가 일치한다 (calculate)', async () => {
    loadMock.mockResolvedValue(fullRow());
    const res = await getCalculateById(req, ctx('r-1234567890'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.integrity).toBe('VALID');
  });

  test('VALID: receipt 별칭 라우트도 동일 판정 + 해시 노출', async () => {
    loadMock.mockResolvedValue(fullRow());
    const res = await getReceiptById(req, ctx('r-1234567890'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.integrity).toBe('VALID');
    expect(body.hash).toBe(sealHash);
  });

  test('TAMPERED: 결과값이 meta·컬럼 양쪽에서 변조되면 재계산 해시가 불일치한다', async () => {
    const tampered = clone(baseClaim.result) as unknown as Record<string, unknown>;
    tampered.value = 999; // 판정 결과 위조 시나리오
    loadMock.mockResolvedValue(
      fullRow({ outputs: tampered }, { result: tampered }),
    );
    const res = await getCalculateById(req, ctx('r-1234567890'));
    const body = await res.json();
    expect(body.integrity).toBe('TAMPERED');
  });

  test('TAMPERED: 컬럼만 변조되어 meta 스냅샷과 어긋나도 잡힌다 (receipt)', async () => {
    loadMock.mockResolvedValue(fullRow({ inputs: { current_A: 9999, length_m: 40 } }));
    const res = await getReceiptById(req, ctx('r-1234567890'));
    const body = await res.json();
    expect(body.integrity).toBe('TAMPERED');
  });

  test('UNVERIFIABLE: 현행 writer 형태(metadata={receiptId})는 정직하게 재계산 불가 처리', async () => {
    // POST /api/calculate 는 현재 metadata에 receiptId만 저장한다 — 해시·claim 스냅샷 없음.
    loadMock.mockResolvedValue(fullRow({ metadata: { receiptId: 'x' } }));
    const res = await getCalculateById(req, ctx('r-1234567890'));
    const body = await res.json();
    expect(body.integrity).toBe('UNVERIFIABLE');
  });

  test('UNVERIFIABLE: 저장 metadata의 integrity 키로 판정을 스푸핑할 수 없다 (receipt)', async () => {
    loadMock.mockResolvedValue(fullRow({ metadata: { receiptId: 'x', integrity: 'VALID' } }));
    const res = await getReceiptById(req, ctx('r-1234567890'));
    const body = await res.json();
    expect(body.integrity).toBe('UNVERIFIABLE'); // 계산 판정이 ...meta 스프레드를 이긴다
  });

  test('UNVERIFIABLE: SHA-256 hex가 아닌 저장 해시는 대조 대상이 아니다 (오탐 TAMPERED 방지)', async () => {
    loadMock.mockResolvedValue(fullRow({}, { receiptHash: 'deadbeef' }));
    const res = await getCalculateById(req, ctx('r-1234567890'));
    const body = await res.json();
    expect(body.integrity).toBe('UNVERIFIABLE');
  });
});
