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
