/**
 * Imperial ↔ SI Adapter Layer for Calculators
 *
 * 모든 계산기는 내부적으로 SI 단위로 동작한다.
 * 이 어댑터는 Imperial 입력을 SI로 변환 → 계산 → SI 결과를 Imperial로 변환.
 * 변환 오차: ±0.01% 이내 (정의값 기반 — inch/foot 변환은 오차 0%).
 *
 * PART 1: 입력 변환 (Imperial → SI)
 * PART 2: 출력 변환 (SI → Imperial)
 * PART 3: Wrap 함수 (계산기를 감싸는 어댑터)
 */

import {
  footToMeter,
  meterToFoot,
  hpToKw,
  kwToHp,
  fahrenheitToCelsius,
  celsiusToFahrenheit,
  mm2ToAwg,
} from './unit-conversion';
import type { DetailedCalcResult, CalcStep } from '@engine/calculators/types';

export type UnitSystem = 'SI' | 'Imperial';

// ---------------------------------------------------------------------------
// PART 1 — 입력 변환 (Imperial → SI)
// ---------------------------------------------------------------------------

/** Imperial 입력 파라미터를 SI로 변환 */
export function convertInputsToSI(
  inputs: Record<string, unknown>,
  unitSystem: UnitSystem,
): { converted: Record<string, unknown>; conversions: string[] } {
  if (unitSystem === 'SI') {
    return { converted: { ...inputs }, conversions: [] };
  }

  const converted: Record<string, unknown> = { ...inputs };
  const conversions: string[] = [];

  // 길이: ft → m
  for (const key of ['length', 'distance', 'cableLength', 'totalLength_m']) {
    if (typeof converted[key] === 'number') {
      const original = converted[key] as number;
      converted[key] = footToMeter(original);
      conversions.push(`${key}: ${original} ft → ${(converted[key] as number).toFixed(4)} m`);
    }
  }

  // 전력: HP → kW
  for (const key of ['power', 'motorPower', 'loadPower_kW', 'power_kW']) {
    if (typeof converted[key] === 'number' && inputs['_powerUnit'] === 'HP') {
      const original = converted[key] as number;
      converted[key] = hpToKw(original);
      conversions.push(`${key}: ${original} HP → ${(converted[key] as number).toFixed(4)} kW`);
    }
  }

  // 온도: °F → °C
  for (const key of ['ambientTemp', 'temperature', 'temp']) {
    if (typeof converted[key] === 'number') {
      const original = converted[key] as number;
      converted[key] = fahrenheitToCelsius(original);
      conversions.push(`${key}: ${original}°F → ${(converted[key] as number).toFixed(1)}°C`);
    }
  }

  return { converted, conversions };
}

// ---------------------------------------------------------------------------
// PART 2 — 출력 변환 (SI → Imperial)
// ---------------------------------------------------------------------------

/** SI 결과를 Imperial 단위로 변환 */
export function convertResultToImperial(
  result: DetailedCalcResult,
): DetailedCalcResult {
  const converted = { ...result };

  // 주 결과값 단위 변환
  if (typeof result.value === 'number') {
    converted.value = convertValueUnit(result.value, result.unit);
  }
  converted.unit = convertUnitLabel(result.unit);

  // 단계별 변환
  if (result.steps) {
    converted.steps = result.steps.map((step: CalcStep) => ({
      ...step,
      value: convertValueUnit(step.value, step.unit),
      unit: convertUnitLabel(step.unit),
    }));
  }

  // 추가 출력 변환
  if (result.additionalOutputs) {
    const ao: typeof result.additionalOutputs = {};
    for (const [key, entry] of Object.entries(result.additionalOutputs)) {
      ao[key] = {
        ...entry,
        value: convertValueUnit(entry.value, entry.unit),
        unit: convertUnitLabel(entry.unit),
      };
    }
    converted.additionalOutputs = ao;
  }

  return converted;
}

function convertValueUnit(value: number, unit: string): number {
  switch (unit) {
    case 'm': return meterToFoot(value);
    case 'mm²': return value; // mm² → AWG는 별도 표시
    case 'kW': return kwToHp(value);
    case '°C': return celsiusToFahrenheit(value);
    default: return value;
  }
}

function convertUnitLabel(unit: string): string {
  switch (unit) {
    case 'm': return 'ft';
    case 'kW': return 'HP';
    case '°C': return '°F';
    default: return unit;
  }
}

// ---------------------------------------------------------------------------
// PART 3 — Wrap 함수
// ---------------------------------------------------------------------------

/**
 * 계산기 함수를 감싸서 Imperial 입력/출력을 자동 처리한다.
 *
 * 1. Imperial 입력 → SI 변환
 * 2. 계산기 실행 (SI)
 * 3. SI 결과 → Imperial 변환
 * 4. 결과에 변환 이력 추가
 *
 * @example
 * const imperialVoltageDrop = withImperialAdapter(calculateVoltageDrop);
 * const result = imperialVoltageDrop({ length: 100, ... }, 'Imperial');
 */
export function withImperialAdapter<T extends Record<string, unknown>>(
  calculator: (input: T) => DetailedCalcResult,
): (input: T, unitSystem?: UnitSystem) => DetailedCalcResult {
  return (input: T, unitSystem: UnitSystem = 'SI'): DetailedCalcResult => {
    // 1. 입력 변환
    const { converted, conversions } = convertInputsToSI(
      input as Record<string, unknown>,
      unitSystem,
    );

    // 2. SI 단위로 계산 실행
    const siResult = calculator(converted as T);

    // 3. Imperial이면 출력도 변환
    const finalResult = unitSystem === 'Imperial'
      ? convertResultToImperial(siResult)
      : siResult;

    // 4. 변환 이력을 경고에 추가
    if (conversions.length > 0) {
      const convWarning = `[Unit Conversion] ${conversions.join('; ')}`;
      return {
        ...finalResult,
        warnings: [...(finalResult.warnings || []), convWarning],
      };
    }

    return finalResult;
  };
}

/**
 * mm² 결과에 AWG 등가 표시를 추가한다.
 * 미국 시장 사용자를 위한 편의 기능.
 */
export function appendAwgEquivalent(result: DetailedCalcResult): DetailedCalcResult {
  if (result.unit !== 'mm²' || typeof result.value !== 'number') return result;

  const awg = mm2ToAwg(result.value);
  const additional = result.additionalOutputs || {};
  additional['awgEquivalent'] = {
    value: result.value,
    unit: `mm² (≈ AWG ${awg})`,
  };

  return { ...result, additionalOutputs: additional };
}
