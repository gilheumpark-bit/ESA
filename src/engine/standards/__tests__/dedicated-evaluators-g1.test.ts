/**
 * G1 승격 평가기 — 손계산 known-answer.
 * 원칙: 입력↔입력 비교와 표준 원문 공표 계수(1.25, Table 54.3)만. 발명 임계값 0.
 */

import { evaluateStandard } from '../registry';

describe('G1 dedicated evaluators (승격분)', () => {
  test('NEC-240.4: OCPD 100A ≤ 허용전류 112A → PASS / 125A > 112A → FAIL', () => {
    expect(evaluateStandard('US', 'NEC-240.4', { ocpdRating: 100, wireAmpacity: 112 }).judgment).toBe('PASS');
    expect(evaluateStandard('US', 'NEC-240.4', { ocpdRating: 125, wireAmpacity: 112 }).judgment).toBe('FAIL');
    expect(evaluateStandard('US', 'NEC-240.4', { ocpdRating: 100 }).judgment).toBe('HOLD');
  });

  test('NEC-210.19: 요구 = 40 + 60×1.25 = 115A → 115 PASS / 114 FAIL', () => {
    const base = { noncontinuousLoad_A: 40, continuousLoad_A: 60 };
    expect(evaluateStandard('US', 'NEC-210.19', { ...base, conductorAmpacity: 115 }).judgment).toBe('PASS');
    expect(evaluateStandard('US', 'NEC-210.19', { ...base, conductorAmpacity: 114 }).judgment).toBe('FAIL');
  });

  test('NEC-215.2: 간선 동일 규칙 (feederAmpacity 파라미터)', () => {
    expect(evaluateStandard('US', 'NEC-215.2', { noncontinuousLoad_A: 100, continuousLoad_A: 80, feederAmpacity: 200 }).judgment).toBe('PASS'); // 100+100=200
    expect(evaluateStandard('US', 'NEC-215.2', { noncontinuousLoad_A: 100, continuousLoad_A: 80, feederAmpacity: 199 }).judgment).toBe('FAIL');
  });

  test('NEC-430.22: FLC 40A → 요구 50A', () => {
    expect(evaluateStandard('US', 'NEC-430.22', { motorFLC_A: 40, branchConductorAmpacity: 50 }).judgment).toBe('PASS');
    expect(evaluateStandard('US', 'NEC-430.22', { motorFLC_A: 40, branchConductorAmpacity: 49 }).judgment).toBe('FAIL');
  });

  test('NEC-430.24: 최대 34A×1.25 + 나머지 56A = 98.5A', () => {
    const base = { largestMotorFLC_A: 34, otherMotorsFLCSum_A: 56 };
    expect(evaluateStandard('US', 'NEC-430.24', { ...base, multiMotorConductorAmpacity: 98.5 }).judgment).toBe('PASS');
    expect(evaluateStandard('US', 'NEC-430.24', { ...base, multiMotorConductorAmpacity: 98 }).judgment).toBe('FAIL');
  });

  test('IEC-543.1 Table 54.3 세 브래킷: S=10→PE≥10 / S=25→PE≥16 / S=70→PE≥35', () => {
    expect(evaluateStandard('INT', 'IEC-543.1', { phaseConductorSize_mm2: 10, protectiveConductorSize_mm2: 10 }).judgment).toBe('PASS');
    expect(evaluateStandard('INT', 'IEC-543.1', { phaseConductorSize_mm2: 10, protectiveConductorSize_mm2: 6 }).judgment).toBe('FAIL');
    expect(evaluateStandard('INT', 'IEC-543.1', { phaseConductorSize_mm2: 25, protectiveConductorSize_mm2: 16 }).judgment).toBe('PASS');
    expect(evaluateStandard('INT', 'IEC-543.1', { phaseConductorSize_mm2: 70, protectiveConductorSize_mm2: 35 }).judgment).toBe('PASS');
    expect(evaluateStandard('INT', 'IEC-543.1', { phaseConductorSize_mm2: 70, protectiveConductorSize_mm2: 25 }).judgment).toBe('FAIL');
  });

  test('의도적 미승격 회귀 가드: NEC-430.32(SF 분기 미확인)는 여전히 HOLD', () => {
    // 코드 주석과 통설이 상충 — 공인 원문 확인 전 승격 금지 원칙의 잠금.
    const r = evaluateStandard('US', 'NEC-430.32', { overloadRelayRating: 50, motorFLA_A: 40, serviceFactor: 1.15 });
    expect(r.judgment).toBe('HOLD');
  });
});
