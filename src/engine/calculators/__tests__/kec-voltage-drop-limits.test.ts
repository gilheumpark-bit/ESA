/**
 * KEC 232.3.9 「수용가 설비에서의 전압강하」.
 *
 * 원문 확인 2026-07-26. 인입구에서 기기까지의 값이고 **수전 전압 × 부하 종류**
 * 두 축으로 갈린다.
 *
 *   저압으로 수전하는 경우      조명 3% / 기타 5%
 *   고압 이상으로 수전하는 경우  조명 6% / 기타 8%
 *   배선 100 m 초과분은 m 당 0.005% 가산, 다만 가산은 0.5% 를 넘지 못함
 *
 * 그동안 리포에는 저압 기준(3%/5%)만 있었다. 이 도구는 22.9kV·154kV 수전
 * 설비에 쓰이는데 고압 유형이 없으면 규정상 8% 까지 허용되는 설계를 3% 로
 * 재단해 불합격으로 몬다 — 계산이 틀리는 게 아니라 **판정이 틀린다**.
 */
import { kecVoltageDropLimit } from '@/engine/calculators/country-defaults';
import { calculateVoltageDrop, type VoltageDropInput } from '@/engine/calculators/voltage-drop/voltage-drop';

/** judgment 은 반환 타입상 옵셔널이다. 없으면 그 자체가 결함이므로 여기서 끊는다. */
function judge(input: VoltageDropInput) {
  const j = calculateVoltageDrop(input).judgment;
  if (!j) throw new Error('voltage-drop 이 judgment 을 내지 않았다');
  return j;
}

describe('KEC 232.3.9 한도 표', () => {
  it.each([
    ['low', 'lighting', 3],
    ['low', 'other', 5],
    ['high', 'lighting', 6],
    ['high', 'other', 8],
  ] as const)('%s 수전 · %s → %s%%', (supply, load, expected) => {
    expect(kecVoltageDropLimit({ supply, load }, 'KR')).toBe(expected);
  });

  it('100 m 이하는 가산이 없다', () => {
    expect(kecVoltageDropLimit({ supply: 'high', load: 'other', wiringLengthM: 100 }, 'KR')).toBe(8);
  });

  it('150 m 는 초과 50 m × 0.005 = 0.25% 가산', () => {
    expect(kecVoltageDropLimit({ supply: 'high', load: 'other', wiringLengthM: 150 }, 'KR')).toBeCloseTo(8.25, 6);
  });

  it('가산은 0.5% 를 넘지 못한다 — 300 m 라도 8.5%', () => {
    // 초과 200 m × 0.005 = 1.0% 지만 상한이 0.5% 다.
    expect(kecVoltageDropLimit({ supply: 'high', load: 'other', wiringLengthM: 300 }, 'KR')).toBeCloseTo(8.5, 6);
    expect(kecVoltageDropLimit({ supply: 'high', load: 'other', wiringLengthM: 100000 }, 'KR')).toBeCloseTo(8.5, 6);
  });

  it('KEC 표가 없는 국가는 undefined — 없는 근거를 지어내지 않는다', () => {
    expect(kecVoltageDropLimit({ supply: 'high', load: 'other' }, 'US')).toBeUndefined();
  });
});

describe('계산기 배선 — 표가 실제로 판정에 쓰이는가', () => {
  /** 22.9kV 수전 설비의 기타 부하. 강하는 3% 를 넘지만 8% 안쪽이다. */
  const HV_FEEDER = {
    voltage: 380, current: 100, length: 250, cableSize: 35,
    conductor: 'Cu' as const, powerFactor: 0.9, phase: 3 as const,
  };

  it('수전 구분을 안 주면 기존 기본값(3%)이 그대로 — 회귀 없음', () => {
    const j = judge(HV_FEEDER);
    expect(j.message).toContain('3%');
  });

  it('고압 수전·기타로 주면 KEC 8% + 길이가산 0.5% = 8.5% 로 판정한다', () => {
    const j = judge({ ...HV_FEEDER, supplyLevel: 'high', loadKind: 'other' });
    expect(j.message).toContain('8.5%');
    expect(j.pass).toBe(true);
  });

  it('같은 회로도 저압 수전이면 5% + 0.5% = 5.5% 로 더 엄격해진다', () => {
    const j = judge({ ...HV_FEEDER, supplyLevel: 'low', loadKind: 'other' });
    expect(j.message).toContain('5.5%');
  });

  it('조명은 기타보다 엄격하다 — 고압 수전 6% + 0.5%', () => {
    const j = judge({ ...HV_FEEDER, supplyLevel: 'high', loadKind: 'lighting' });
    expect(j.message).toContain('6.5%');
  });

  it('사용자가 직접 준 한도가 KEC 표보다 우선한다', () => {
    const j = judge({ ...HV_FEEDER, supplyLevel: 'high', loadKind: 'other', dropLimitPercent: 2 });
    expect(j.message).toContain('2%');
    expect(j.pass).toBe(false);
  });
});

/**
 * 배선이 한 계산기에만 되어 있으면 그 계산기만 규정을 지킨다.
 *
 * 전압강하 한도를 쓰는 계산기는 다섯이다. voltage-drop 만 KEC 수전 구분을
 * 받고 나머지가 저압 기준으로 남으면, 같은 22.9kV 설비를 어느 화면으로
 * 들어가느냐에 따라 합격과 불합격이 갈린다. 결정 로직은 공용 해석기
 * resolveVoltageDropLimit 하나로 모았고, 여기서 다섯 모두 실제로 그 값을
 * 쓰는지 본다 — 배선은 존재가 아니라 발화로 확인한다.
 */
import { calculateComplexVoltageDrop } from '@/engine/calculators/voltage-drop/complex-voltage-drop';
import { calculateBusbarVD } from '@/engine/calculators/voltage-drop/busbar-vd';
import { calculateThreePhaseVD } from '@/engine/calculators/voltage-drop/three-phase-vd';
import { calculateCableSizing } from '@/engine/calculators/cable/cable-sizing';

/** 판정 문구에서 한도를 읽는다. 없으면 배선이 안 된 것이다. */
function limitOf(r: { judgment?: { message: string } }): string {
  if (!r.judgment) throw new Error('judgment 없음');
  return r.judgment.message;
}

describe('나머지 계산기 배선 — 다섯 모두 같은 한도를 쓴다', () => {
  // 구간 합 250 m → 100 m 초과분 150 m × 0.005 = 0.75%, 상한 0.5%
  const SECTIONS = [
    { name: 's1', current: 100, length: 150, resistance: 0.5, reactance: 0.08 },
    { name: 's2', current: 100, length: 100, resistance: 0.5, reactance: 0.08 },
  ];

  it('complex-voltage-drop — 고압 수전·기타 → 8.5%', () => {
    const r = calculateComplexVoltageDrop({
      voltage: 380, current: 100, powerFactor: 0.85, phase: 3,
      sections: SECTIONS.map(({ length, resistance, reactance }) => ({ length, resistance, reactance })),
      supplyLevel: 'high', loadKind: 'other',
    });
    expect(limitOf(r)).toContain('8.5');
  });

  it('busbar-vd — 고압 수전·기타 → 8.5%', () => {
    const r = calculateBusbarVD({
      voltage: 380, powerFactor: 0.85, sections: SECTIONS,
      supplyLevel: 'high', loadKind: 'other',
    });
    expect(limitOf(r)).toContain('8.5');
  });

  it('three-phase-vd — 고압 수전·기타 → 8.5%', () => {
    const r = calculateThreePhaseVD({
      voltage: 380, current: 100, length: 250, resistance: 0.5, reactance: 0.08, powerFactor: 0.85,
      supplyLevel: 'high', loadKind: 'other',
    });
    expect(limitOf(r)).toContain('8.5');
  });

  // cable-sizing 은 한도로 **굵기를 정하는** 계산기다. 한도가 좁으면 케이블을
  // 굵혀서 맞춘다 — 그래서 여기서는 판정이 아니라 선정 결과가 갈린다.
  // 규정상 8% 가 허용되는 22.9kV 수전 설비를 3% 로 재단하면 95mm² 를 깔게 된다.
  it('cable-sizing — 3% 기준 95mm² 가 KEC 고압 8.5% 에선 35mm² 로 내려간다', () => {
    const base = {
      current: 125, length: 250, voltage: 380, conductor: 'Cu' as const,
      insulation: 'XLPE' as const, installation: 'C' as const, phase: 3 as const,
    };
    expect(calculateCableSizing(base).value).toBe(95);
    const hv = calculateCableSizing({ ...base, supplyLevel: 'high', loadKind: 'other' });
    expect(hv.value).toBe(35);
  });

  it('수전 구분을 안 주면 넷 다 기존 기본값 그대로 — 회귀 없음', () => {
    const plain = [
      calculateComplexVoltageDrop({ voltage: 380, current: 100, powerFactor: 0.85, phase: 3, sections: SECTIONS.map(({ length, resistance, reactance }) => ({ length, resistance, reactance })) }),
      calculateBusbarVD({ voltage: 380, powerFactor: 0.85, sections: SECTIONS }),
      calculateThreePhaseVD({ voltage: 380, current: 100, length: 250, resistance: 0.5, reactance: 0.08, powerFactor: 0.85 }),
      calculateCableSizing({ current: 125, length: 250, voltage: 380, conductor: 'Cu', insulation: 'XLPE', installation: 'C', phase: 3 }),
    ];
    for (const r of plain) expect(limitOf(r)).not.toContain('8.5');
  });
});
