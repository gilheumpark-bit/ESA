import { convertUnit, normalizeUnit } from '../global/unit-converter';
import { CALCULATOR_REGISTRY } from '../index';
import { CALCULATOR_PARAMS } from '@/lib/calculator-params';

/**
 * 전기 단위 환산.
 *
 * 왜 계산기로 만들었나: 채팅 답변은 영수증 없는 수치를 지운다. 그래서
 * "0.4kV 는 몇 V 인가" 에 **"[미확인]입니다"** 가 나갔다(AI 품질 점검
 * 2026-07-28 실측). 모델은 400 을 알지만 앱이 보증할 수 없어 지웠고,
 * 보증할 계산기가 없었다.
 *
 * **이 계산기의 값어치는 곱셈이 아니라 거부에 있다.** V → A 는 옴의
 * 법칙이지 단위 환산이 아니다. 배수만 곱해 답을 내면 그게 이 앱이
 * 막으려는 바로 그 실수다.
 */
describe('전기 단위 환산 — 같은 물리량', () => {
  it.each([
    [0.4, 'kV', 'V', 400],
    [22.9, 'kV', 'V', 22900],
    [380, 'V', 'kV', 0.38],
    [1500, 'mV', 'V', 1.5],
    [0.5, 'kA', 'A', 500],
    [250, 'mA', 'A', 0.25],
    [500, 'kVA', 'VA', 500000],
    [1, 'MVA', 'kVA', 1000],
    [75, 'kW', 'W', 75000],
    [1.5, 'MW', 'kW', 1500],
    [0.05, 'kΩ', 'Ω', 50],
    [1200, 'mΩ', 'Ω', 1.2],
    [60, 'Hz', 'kHz', 0.06],
    [1500, 'm', 'km', 1.5],
    [350, 'kWh', 'Wh', 350000],
  ])('%s %s → %s = %s', (value, fromUnit, toUnit, expected) => {
    const r = convertUnit({ value, fromUnit, toUnit });
    expect(Number(r.value)).toBeCloseTo(expected, 6);
    expect(r.judgment?.pass).toBe(true);
  });

  it('왕복하면 제자리로 온다', () => {
    const there = convertUnit({ value: 22.9, fromUnit: 'kV', toUnit: 'V' });
    const back = convertUnit({ value: Number(there.value), fromUnit: 'V', toUnit: 'kV' });
    expect(Number(back.value)).toBeCloseTo(22.9, 9);
  });

  it('0.4kV 를 400,000V 로 읽지 않는다 — 도면 파싱에서 실제로 났던 오류', () => {
    expect(convertUnit({ value: 0.4, fromUnit: 'kV', toUnit: 'V' }).value).toBe(400);
  });
});

describe('전기 단위 환산 — 다른 물리량은 거부', () => {
  it.each([
    ['V', 'A', '옴의 법칙'],
    ['A', 'V', '옴의 법칙'],
    ['kW', 'kVA', '역률'],
    ['kVA', 'kW', '역률'],
    ['kVA', 'A', '전압'],
    ['kW', 'A', '전압'],
  ])('%s → %s 는 계산하지 않고 무엇이 더 필요한지 말한다', (fromUnit, toUnit, needle) => {
    const r = convertUnit({ value: 100, fromUnit, toUnit });
    expect(r.judgment?.pass).toBe(false);
    expect(r.judgment?.message).toContain(needle);
  });

  /**
   * 거부가 "0 입니다" 로 읽히면 안 된다 — 판정이 실패라는 것이 함께
   * 나가야 화면이 그렇게 그린다.
   */
  it('거부는 값이 아니라 판정으로 드러난다', () => {
    const r = convertUnit({ value: 380, fromUnit: 'V', toUnit: 'A' });
    expect(r.judgment?.pass).toBe(false);
    expect(r.judgment?.severity).toBe('error');
    expect(r.formula).toContain('불가');
  });

  it('무효전력과 유효전력도 섞지 않는다', () => {
    expect(convertUnit({ value: 100, fromUnit: 'kvar', toUnit: 'kW' }).judgment?.pass).toBe(false);
  });
});

describe('표기 흔들림', () => {
  it.each([
    ['KV', 'kv'], ['kV', 'kv'], ['㎸', 'kv'],
    ['Ω', 'ohm'], ['ω', 'ohm'], ['kΩ', 'kohm'],
    ['㎾', 'kw'], [' kVA ', 'kva'],
  ])('%s 를 %s 로 읽는다', (raw, expected) => {
    expect(normalizeUnit(raw)).toBe(expected);
  });

  it('모르는 단위는 지어내지 않고 던진다', () => {
    expect(normalizeUnit('푸트파운드')).toBeNull();
    expect(() => convertUnit({ value: 1, fromUnit: 'furlong', toUnit: 'V' })).toThrow('알 수 없는 단위');
  });

  it('숫자가 아니면 던진다', () => {
    expect(() => convertUnit({ value: Number.NaN, fromUnit: 'kV', toUnit: 'V' })).toThrow();
  });
});

describe('배선', () => {
  it('레지스트리에 등록돼 있다 — 채팅이 이름으로 안내할 수 있어야 한다', () => {
    const entry = CALCULATOR_REGISTRY.get('unit-converter');
    expect(entry).toBeDefined();
    expect(entry?.name).toContain('단위');
  });

  it('레지스트리를 통해 실행된다', () => {
    const out = CALCULATOR_REGISTRY.get('unit-converter')!
      .calculator({ value: 0.4, fromUnit: 'kV', toUnit: 'V' } as never);
    expect(out.value).toBe(400);
  });

  it('입력 정의가 있다 — 없으면 폼도 채팅 의도 라우팅도 못 쓴다', () => {
    const params = CALCULATOR_PARAMS['unit-converter'];
    expect(params?.map((p) => p.name).sort()).toEqual(['fromUnit', 'toUnit', 'value']);
  });
});
