/**
 * 전수 버그 사냥 — 계산기군 도메인 수리 known-answer 가드.
 * 각 항목은 표준 손계산으로 값을 도출한다(앱 출력 복제 아님).
 *
 *  #4  awg-converter 음수 규약 (0=1/0, -3=4/0)  ↔ awg-converter-full 일치
 *  #5  transformer-capacity 정격초과 vacuous PASS → FAIL
 *  #6  transformer-loss 1MVA 고정효율 → 용량 입력 시 실효율, 미입력 시 생략
 *  #8  substation N+1 각 유닛 = 전체부하 (구: 50%)
 *  #9  rcd-sizing 정격초과 침묵 PASS → FAIL
 *  #10 cable-sizing installation 미사용 → 설치방법 반영
 *  #11 relay-basic 픽업미만 음수 트립시간 → "동작 안 함"
 *  #12 ampacity-global-compare ambientTemp 무검증 NaN → 검증
 */

import { describe, test, expect } from '@jest/globals';
import { convertAwgMm2 } from '../cable/awg-converter';
import { convertAwgFull } from '../global/awg-converter-full';
import { calculateTransformerCapacity } from '../transformer/transformer-capacity';
import { calculateTransformerLoss } from '../transformer/transformer-loss';
import { calculateSubstationCapacity } from '../substation/substation-capacity';
import { calculateRCDSizing } from '../protection/rcd-sizing';
import { calculateRelayBasic } from '../protection/relay-basic';
import { calculateCableSizing } from '../cable/cable-sizing';
import { compareGlobalAmpacity } from '../global/ampacity-global-compare';

function close(actual: number, expected: number, relTol = 0.01) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relTol + 1e-6);
}

describe('#4 AWG 음수 규약 (ASTM B258: 0=1/0, -3=4/0)', () => {
  test('awg-converter: 0 → 1/0 = 53.5 mm², -3 → 4/0 = 107.2 mm²', () => {
    close(convertAwgMm2({ direction: 'awg-to-mm2', awg: 0 }).value as number, 53.49, 0.01);
    close(convertAwgMm2({ direction: 'awg-to-mm2', awg: -3 }).value as number, 107.2, 0.01);
  });
  test('awg-converter-full 일치: 0 → 1/0, -3 → 4/0', () => {
    const full0 = convertAwgFull({ value: 0, fromUnit: 'awg' });
    const full3 = convertAwgFull({ value: -3, fromUnit: 'awg' });
    close(full0.value as number, 53.49, 0.01);
    close(full3.value as number, 107.2, 0.01);
    // 두 변환기가 같은 규약(±0.5mm² 이내)
    close(convertAwgMm2({ direction: 'awg-to-mm2', awg: -3 }).value as number, full3.value as number, 0.01);
    expect(full3.additionalOutputs!.awg!.unit).toContain('4/0');
    expect(full0.additionalOutputs!.awg!.unit).toContain('1/0');
  });
});

describe('#5 transformer-capacity 정격초과', () => {
  test('5000kVA 필요 → 3000 선정 → FAIL (구: vacuous pass=true)', () => {
    const r = calculateTransformerCapacity({ totalLoad: 5000, powerFactor: 1, efficiency: 1, demandFactor: 1, growthMargin: 0 });
    expect(r.judgment!.pass).toBe(false);
    expect(r.additionalOutputs!.selectedStandard!.value).toBe(3000);
  });
  test('정상 용량은 여전히 PASS', () => {
    const r = calculateTransformerCapacity({ totalLoad: 100, powerFactor: 0.9, efficiency: 0.98, demandFactor: 0.8, growthMargin: 0.1 });
    expect(r.judgment!.pass).toBe(true);
  });
});

describe('#6 transformer-loss 효율', () => {
  test('용량 미입력 → 효율 생략, 총손실 2187.5 W만', () => {
    const r = calculateTransformerLoss({ noLoadLoss: 500, ratedLoadLoss: 3000, loadRatio: 0.75 });
    close(r.value as number, 2187.5);
    expect(r.additionalOutputs!.efficiency).toBeUndefined();
  });
  test('용량 입력 → 실효율: S=1000kVA·pf=1·k=0.75 → 750000/752187.5 = 99.709%', () => {
    const r = calculateTransformerLoss({ noLoadLoss: 500, ratedLoadLoss: 3000, loadRatio: 0.75, ratedCapacity: 1000, powerFactor: 1 });
    close(r.additionalOutputs!.efficiency!.value, 99.709, 0.001);
  });
});

describe('#8 substation N+1', () => {
  test('N+1: 각 유닛이 전체부하(125kVA) ≥ → 150kVA (구: 62.5 → 100)', () => {
    const np1 = calculateSubstationCapacity({ loads: [{ name: 'a', kW: 100, pf: 0.8, demandFactor: 1.0 }], futureGrowth: 0, redundancy: 'N+1', systemVoltage: 22900, secondaryVoltage: 380 });
    expect(np1.additionalOutputs!.transformerSize!.value).toBe(150);
    // 각 유닛이 전체부하(125) 이상 — 1대 고장 시 100% 공급
    expect(np1.additionalOutputs!.transformerSize!.value).toBeGreaterThanOrEqual(125);
  });
  test('N 방식도 125 → 150', () => {
    const n = calculateSubstationCapacity({ loads: [{ name: 'a', kW: 100, pf: 0.8, demandFactor: 1.0 }], futureGrowth: 0, redundancy: 'N', systemVoltage: 22900, secondaryVoltage: 380 });
    expect(n.additionalOutputs!.transformerSize!.value).toBe(150);
  });
});

describe('#9 rcd-sizing 정격초과', () => {
  test('부하 200A > 최대정격 125A → FAIL (구: touch만 봐 pass)', () => {
    const r = calculateRCDSizing({ circuitType: 'socket', loadCurrent: 200, earthResistance: 1 });
    expect(r.judgment!.pass).toBe(false);
    expect(r.value).toBe(125);
  });
  test('정상(16A)은 PASS', () => {
    const r = calculateRCDSizing({ circuitType: 'socket', loadCurrent: 16, earthResistance: 10 });
    expect(r.judgment!.pass).toBe(true);
  });
});

describe('#10 cable-sizing 설치방법', () => {
  test('정본 표가 없는 A2는 근사계수로 계산하지 않고 거부한다', () => {
    const c = calculateCableSizing({ current: 125, length: 20, voltage: 380, conductor: 'Cu', insulation: 'XLPE', installation: 'C', phase: 3 });
    expect(c.value).toBe(25);
    expect(() => calculateCableSizing({ current: 125, length: 20, voltage: 380, conductor: 'Cu', insulation: 'XLPE', installation: 'A2', phase: 3 }))
      .toThrow(/no table|지원하지|Supported methods/i);
  });
  test('지원되는 A1 정본 표는 Method C보다 보수적인 케이블을 선정한다', () => {
    const c = calculateCableSizing({ current: 100, length: 20, voltage: 380, conductor: 'Cu', insulation: 'XLPE', installation: 'C', phase: 3 });
    const a1 = calculateCableSizing({ current: 100, length: 20, voltage: 380, conductor: 'Cu', insulation: 'XLPE', installation: 'A1', phase: 3 });
    expect(a1.value as number).toBeGreaterThanOrEqual(c.value as number);
  });
});

describe('#11 relay-basic 픽업미만', () => {
  test('고장(120A) < 픽업(130A) → 동작 안 함, 음수 트립시간 없음', () => {
    const r = calculateRelayBasic({ loadCurrent: 100, faultCurrent: 120, ctRatio: 200, curveType: 'SI' });
    expect(r.judgment!.pass).toBe(false);
    expect(r.additionalOutputs!.operates!.value).toBe(0);
    expect(r.additionalOutputs!.tripTime).toBeUndefined();
  });
  test('정상(고장 2000A ≫ 픽업) → 양의 트립시간', () => {
    const r = calculateRelayBasic({ loadCurrent: 100, faultCurrent: 2000, ctRatio: 200, curveType: 'SI' });
    expect(r.additionalOutputs!.tripTime!.value).toBeGreaterThan(0);
  });
});

describe('#12 ampacity-global-compare ambientTemp 검증', () => {
  test('NaN ambientTemp → throw (구: NaN 전파)', () => {
    expect(() => compareGlobalAmpacity({ cableSize: 25, conductor: 'copper', insulation: 'XLPE', ambientTemp: NaN })).toThrow(/ambientTemp/);
  });
  test('정상 입력은 유한값', () => {
    const r = compareGlobalAmpacity({ cableSize: 25, conductor: 'copper', insulation: 'XLPE', ambientTemp: 30 });
    expect(Number.isFinite(r.value as number)).toBe(true);
  });
});
