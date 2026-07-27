import { adjudicateOcr } from '../ocr-adjudicator';
import type { OcrReading } from '../types-v3';

/**
 * OCR 확정 판정이 **어휘 목록에 갇혀 있지 않은지** 본다.
 *
 * `adjudicateOcr` 은 `standardTerms` 가 주어지면 그 목록(또는 범례)에 든
 * 말만 `CONFIRMED_BY_MAJORITY_AND_CONTEXT` 로 올린다(`lexiconPass`).
 * 오케스트레이터는 항상 목록을 넘기므로 이 조건은 실전에서 늘 켜져 있다.
 *
 * 확정되지 못한 텍스트는 그냥 신뢰도가 낮은 정도가 아니다 —
 * `cross-page-graph` 가 통째로 건너뛰고(`certainty !== 'confirmed'` continue),
 * 집계에서 빠지며, `AMBIGUOUS_OCR` 홀드가 붙는다. 즉 **목록에 없는 말은
 * 스캔 도면에서 사실상 읽히지 않은 것과 같다.**
 *
 * 벡터 PDF 는 텍스트를 직접 뽑아 이 경로를 우회한다(`directVectorText`).
 * 그래서 이 결함은 **스캔·사진 도면에서만** 드러난다.
 */
const 삼중판독 = (text: string): OcrReading[] => [
  { variantId: 'original', text, confidence: 0.9, callId: 'call-1' },
  { variantId: 'upscale-4x', text, confidence: 0.92, callId: 'call-2' },
  { variantId: 'text-high-contrast', text, confidence: 0.88, callId: 'call-3' },
];

const 판정 = (text: string, standardTerms: string[]) => adjudicateOcr({
  displayId: 'P01-T001',
  pageIndex: 0,
  bounds: { x: 10, y: 10, w: 40, h: 20 },
  readings: 삼중판독(text),
  adjacentSymbolTypes: [],
  legendTerms: [],
  standardTerms,
}).status;

/** 오케스트레이터가 실제로 넘기는 목록. 바뀌면 아래 대조가 잡는다. */
import { OCR_STANDARD_TERMS } from '../ocr-standard-terms';

describe('OCR 확정 어휘 — 변전소 도면 실어휘', () => {
  it('삼중 판독·다수결이 갖춰지면 목록에 든 말은 확정된다 — 하네스 자기검사', () => {
    expect(판정('VCB', ['VCB'])).toBe('CONFIRMED_BY_MAJORITY_AND_CONTEXT');
  });

  it('목록 밖의 말은 다수결을 이겨도 확정되지 않는다 — 이게 이 검사의 전제다', () => {
    expect(판정('GCB', ['VCB'])).toBe('AMBIGUOUS');
  });

  /**
   * 154kV·22.9kV 수배전 도면에 실제로 찍히는 기기 약어. 하나라도 빠지면
   * 그 기기는 스캔 도면에서 읽히지 않은 것으로 처리된다.
   */
  it.each([
    ['GCB', '가스차단기 — 154kV 주차단기'],
    ['OCB', '유입차단기'],
    ['MOF', '계기용변성기함 — 수전 계량'],
    ['ZCT', '영상변류기 — 지락 검출'],
    ['GPT', '접지형계기용변압기'],
    ['LA', '피뢰기'],
    ['LBS', '부하개폐기'],
    ['COS', '컷아웃스위치'],
    ['ASS', '자동고장구분개폐기'],
    ['PF', '전력퓨즈'],
    ['SPD', '서지보호소자'],
    ['MCB', '소형차단기'],
    ['ELCB', '누전차단기'],
    ['SWGR', '배전반'],
    ['MCC', '전동기제어반'],
    ['GEN', '발전기'],
    ['VT', '계기용변압기'],
  ])('%s 가 확정될 수 있다 — %s', (term) => {
    expect(판정(term, OCR_STANDARD_TERMS)).toBe('CONFIRMED_BY_MAJORITY_AND_CONTEXT');
  });

  it('기존 10 개도 그대로 확정된다 — 넓히면서 잃은 것이 없어야 한다', () => {
    for (const term of ['PT', 'PPT', 'VCB', 'VGB', 'TR', 'ACB', 'MCCB', 'CT', 'ATS', 'UPS']) {
      expect(판정(term, OCR_STANDARD_TERMS)).toBe('CONFIRMED_BY_MAJORITY_AND_CONTEXT');
    }
  });

  /**
   * 넓혔다고 아무 글자나 통과시키면 안 된다 — 어휘 관문의 존재 이유다.
   */
  it.each(['ZZQ', 'ABCDEF', '한글라벨', 'XKJ'])(
    '%s 처럼 어휘에 없는 것은 여전히 확정되지 않는다', (noise) => {
      expect(판정(noise, OCR_STANDARD_TERMS)).toBe('AMBIGUOUS');
    },
  );
});

/**
 * 어휘를 넓히면 **절단 오독** 위험이 커진다. `AC` 는 `ACB` 의 앞 두 글자고,
 * `MC` 는 `MCB`·`MCC`·`MCCB` 의 앞 두 글자다. 셋 다 어휘에 있으니 판독이
 * 잘려도 확정될 수 있다.
 *
 * 이 위험은 넓히기 전에도 있었다 — `CT` 는 `ZCT` 의 뒷 두 글자고 `PT` 는
 * `PPT` 의 일부인데 둘 다 원래 목록에 있었다. 새로 만든 위험이 아니라
 * 사례가 늘어난 것이다.
 *
 * 막는 것은 `isConfusablePair` + `contextSupports` 다: 잘린 형태와 온전한
 * 형태가 **둘 다 후보에 오르면** 인접 기호가 뒷받침하지 않는 한 확정하지
 * 않는다. 그 그물이 실제로 작동하는지 여기서 친다. 그물이 뚫리면 잘못
 * 읽은 기기가 `confirmed` 로 집계·교차페이지 연결까지 들어간다.
 */
describe('절단 오독 — 남는 위험과 그물', () => {
  const 후보둘 = (a: string, b: string, adjacent: string[] = []) => adjudicateOcr({
    displayId: 'P01-T002',
    pageIndex: 0,
    bounds: { x: 10, y: 10, w: 40, h: 20 },
    readings: [
      { variantId: 'original', text: a, confidence: 0.9, callId: 'call-1' },
      { variantId: 'upscale-4x', text: a, confidence: 0.92, callId: 'call-2' },
      { variantId: 'text-high-contrast', text: b, confidence: 0.7, callId: 'call-3' },
    ],
    adjacentSymbolTypes: adjacent,
    legendTerms: [],
    standardTerms: OCR_STANDARD_TERMS,
  }).status;

  it.each([
    ['AC', 'ACB'],
    ['MC', 'MCCB'],
    ['CT', 'ZCT'],
    ['PT', 'PPT'],
  ])('잘린 %s 와 온전한 %s 가 함께 후보면 확정하지 않는다', (short, full) => {
    expect(후보둘(short, full)).toBe('AMBIGUOUS');
  });

  /**
   * 남는 위험을 정직하게 적어 둔다. 세 변형이 **모두 똑같이** 잘려 읽어
   * 온전한 형태가 후보에 아예 없으면 그물이 걸릴 것이 없다. 이건 어휘를
   * 좁혀도 못 막는다(좁히면 `CT`·`PT`·`TR` 도 같이 잃는다).
   */
  it('세 변형이 모두 같게 잘리면 확정된다 — 알고 남기는 위험', () => {
    expect(판정('AC', OCR_STANDARD_TERMS)).toBe('CONFIRMED_BY_MAJORITY_AND_CONTEXT');
  });
});

describe('어휘 목록의 정본', () => {
  it('오케스트레이터가 목록을 직접 적지 않고 정본을 가져다 쓴다', () => {
    const src = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'document-orchestrator.ts'), 'utf8') as string;
    expect(src).toContain('standardTerms: OCR_STANDARD_TERMS');
    expect(src).not.toMatch(/standardTerms:\s*\['/);
  });

  it('정본이 symbol-db 의 도면 약어를 빠짐없이 담는다', () => {
    const db = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', '..', 'vision', 'symbol-db.ts'), 'utf8') as string;
    const 약어 = new Set<string>();
    for (const block of db.matchAll(/aliases:\s*\[([^\]]*)\]/g)) {
      for (const alias of block[1].matchAll(/'([^']+)'/g)) {
        if (/^[A-Z0-9]{2,6}$/.test(alias[1])) 약어.add(alias[1]);
      }
    }
    expect(약어.size).toBeGreaterThan(50);
    const 빠진것 = [...약어].filter((t) => !OCR_STANDARD_TERMS.includes(t)).sort();
    expect(빠진것).toEqual([]);
  });
});
