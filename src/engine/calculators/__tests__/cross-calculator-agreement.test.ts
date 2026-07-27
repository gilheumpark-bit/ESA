import { calculateThreePhaseVD } from '../voltage-drop/three-phase-vd';
import { calculateComplexVoltageDrop } from '../voltage-drop/complex-voltage-drop';
import { calculateVoltageDrop } from '../voltage-drop/voltage-drop';
import { calculateSinglePhasePower } from '../power/single-phase-power';
import { calculateThreePhasePower } from '../power/three-phase-power';

/**
 * 같은 물리량을 여러 경로로 계산하는 곳이 **서로 일치하는지** 본다.
 *
 * 이 저장소에는 전압강하 구현이 넷 있다(voltage-drop · three-phase-vd ·
 * complex-voltage-drop · busbar-vd). 같은 식을 각자 구현한 자리는 시간이
 * 지나면 갈라진다 — 한쪽만 고치고 다른 쪽은 안 고치기 때문이다.
 *
 * 이건 **표준 원문 없이 판정된다.** 둘이 다르면 적어도 하나는 틀렸고,
 * 그 사실만으로 조사 대상이 된다. 값의 절대 정확도와는 별개 층위다.
 *
 * 같은 이유로 √3 관계도 잠근다 — 3상 전력은 같은 선간전압·선전류·역률에서
 * 단상의 √3 배다. 이건 정의라서 어떤 판본에도 안 걸린다.
 */

const SQRT3 = Math.sqrt(3);

describe('계산기 간 일치', () => {
  it('3상 전압강하: three-phase-vd 와 complex-voltage-drop 이 같은 값을 낸다', () => {
    const V = 380;
    const I = 100;
    const L = 150;      // m
    const R = 0.524;    // Ω/km
    const X = 0.086;    // Ω/km
    const pf = 0.85;

    const a = calculateThreePhaseVD({
      voltage: V, current: I, length: L, resistance: R, reactance: X, powerFactor: pf,
    });
    const b = calculateComplexVoltageDrop({
      voltage: V, current: I, powerFactor: pf, phase: 3,
      sections: [{ length: L, resistance: R, reactance: X }],
    });

    // 손계산: e = √3 × 100 × 0.15 × (0.524×0.85 + 0.086×0.5268) = 12.75 V
    const sinPhi = Math.sqrt(1 - pf * pf);
    const expectedVolts = SQRT3 * I * (L / 1000) * (R * pf + X * sinPhi);

    // 둘 다 최상위 `value` 는 **퍼센트**다. 볼트는 additionalOutputs 에 있다 —
    // 처음에 볼트 기대값을 `value` 와 비교해 이 테스트가 먼저 틀렸다.
    expect(a.unit).toBe('%');
    expect(b.unit).toBe('%');

    // `additionalOutputs` 의 value 는 문자열·null 도 될 수 있는 타입이라
    // 숫자임을 먼저 못박는다 — 값이 없어 undefined 인데 그냥 통과하면
    // 이 검사가 공허해진다.
    const aVolts = a.additionalOutputs?.steadyStateDropVolts?.value;
    const bVolts = b.additionalOutputs?.totalDropVolts?.value;
    expect(typeof aVolts).toBe('number');
    expect(typeof bVolts).toBe('number');

    expect(aVolts as number).toBeCloseTo(expectedVolts, 1);
    expect(bVolts as number).toBeCloseTo(expectedVolts, 1);

    // 서로도 같아야 한다 — 각자 손계산에 가까워도 서로 다르면 갈라진 것이다.
    expect(a.value as number).toBeCloseTo(b.value as number, 2);
    expect(aVolts as number).toBeCloseTo(bVolts as number, 2);
  });

  it('구간을 쪼개도 합이 같다 — complex-voltage-drop 의 다구간 합산', () => {
    const common = { voltage: 380, current: 100, powerFactor: 0.85, phase: 3 as const };
    const one = calculateComplexVoltageDrop({
      ...common, sections: [{ length: 150, resistance: 0.524, reactance: 0.086 }],
    });
    const split = calculateComplexVoltageDrop({
      ...common,
      sections: [
        { length: 50, resistance: 0.524, reactance: 0.086 },
        { length: 100, resistance: 0.524, reactance: 0.086 },
      ],
    });
    expect(split.value as number).toBeCloseTo(one.value as number, 2);
  });

  it('3상 전력은 같은 조건에서 단상의 √3 배다 — 정의라 판본과 무관하다', () => {
    const V = 380;
    const I = 50;
    const pf = 0.9;
    // 두 계산기의 입력 이름이 다르다 — 단상은 `voltage/current`, 3상은
    // `lineVoltage/lineCurrent`. 선언(CALCULATOR_PARAMS)과는 각자 맞으므로
    // 결함은 아니지만, 같은 양을 다르게 부르는 자리라 여기 적어 둔다.
    const one = calculateSinglePhasePower({ voltage: V, current: I, powerFactor: pf });
    const three = calculateThreePhasePower({ lineVoltage: V, lineCurrent: I, powerFactor: pf });
    expect((three.value as number) / (one.value as number)).toBeCloseTo(SQRT3, 4);
  });

  it('전압강하는 전류·길이에 비례한다 — 2 배면 2 배다', () => {
    const base = {
      voltage: 380, length: 100, cableSize: 35,
      conductor: 'Cu' as const, powerFactor: 0.85, phase: 3 as const,
    };
    const x1 = calculateVoltageDrop({ ...base, current: 50 });
    const x2 = calculateVoltageDrop({ ...base, current: 100 });
    expect((x2.value as number) / (x1.value as number)).toBeCloseTo(2, 3);

    const l1 = calculateVoltageDrop({ ...base, current: 50 });
    const l2 = calculateVoltageDrop({ ...base, current: 50, length: 200 });
    expect((l2.value as number) / (l1.value as number)).toBeCloseTo(2, 3);
  });

  it('전압강하는 단면적에 반비례한다 — 저항 성분이 지배할 때', () => {
    const base = {
      voltage: 380, current: 50, length: 100,
      conductor: 'Cu' as const, powerFactor: 1, phase: 3 as const,
    };
    // pf=1 이면 리액턴스 항이 빠져 순수 저항이라 정확히 반비례여야 한다.
    const small = calculateVoltageDrop({ ...base, cableSize: 25 });
    const big = calculateVoltageDrop({ ...base, cableSize: 50 });
    expect((small.value as number) / (big.value as number)).toBeCloseTo(2, 2);
  });
});
