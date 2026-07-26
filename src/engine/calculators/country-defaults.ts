/**
 * Country-Aware Default Values for Calculators
 *
 * 모든 계산기에서 사용하는 기본값을 국가별로 분기한다.
 * 계산기 함수 시그니처를 변경하지 않고, 기본값 해석 단계에서 국가를 반영.
 *
 * 사용법:
 *   const defaults = getCalcDefaults('US');
 *   const vdLimit = input.allowableDropPercent ?? defaults.vdBranch;
 */

import {
  getSafetyProfile,
  type CountryCode,
} from '@/engine/constants/safety-factors';

export interface CalcDefaults {
  /** 전압강하 분기회로 한도 (%) */
  vdBranch: number;
  /** 전압강하 간선 한도 (%) */
  vdFeeder: number;
  /** 전압강하 합산 한도 (%) */
  vdCombined: number;
  /** 전압강하 조명 한도 (%) */
  vdLighting: number;
  /** 연속부하 차단기 배율 */
  continuousLoadFactor: number;
  /** 전동기 분기 최대 배율 */
  motorBranchMax: number;
  /** 전선관 충전율 (3본 이상) */
  conduitFill: number;
  /** PVC 보정계수 */
  pvcDerating: number;
  /** 알루미늄 보정계수 */
  aluminumDerating: number;
  /** 기준 주위온도 (°C) */
  baseAmbientTemp: number;
  /** 접지저항 일반 한도 (Ω) */
  groundingGeneral: number;
  /** RCD 감도전류 (mA) */
  rcdSensitivity: number;
  /** 비상전원 절환시간 (초) */
  emergencyTransferTime: number;
  /** 최소 절연저항 (MΩ) */
  minInsulationResistance: number;
  /** 단위계 */
  unitSystem: 'SI' | 'Imperial';
}

/** 국가 코드로 계산기 기본값 세트를 반환한다. */
export function getCalcDefaults(country: CountryCode = 'KR'): CalcDefaults {
  const p = getSafetyProfile(country);

  return {
    vdBranch: p.voltageDropLimits.branch,
    vdFeeder: p.voltageDropLimits.feeder,
    vdCombined: p.voltageDropLimits.combined,
    vdLighting: p.voltageDropLimits.lighting ?? p.voltageDropLimits.branch,
    continuousLoadFactor: p.breakerFactors.continuousLoad,
    motorBranchMax: p.breakerFactors.motorBranchMax,
    conduitFill: p.conduitFill.threeOrMore,
    pvcDerating: p.cableDerating.pvcFactor,
    aluminumDerating: p.cableDerating.aluminumFactor,
    baseAmbientTemp: p.cableDerating.baseAmbientTemp,
    groundingGeneral: p.groundingResistance.general,
    rcdSensitivity: p.rcdSensitivity,
    emergencyTransferTime: p.emergencyTransferTime,
    minInsulationResistance: p.minInsulationResistance,
    unitSystem: p.unitSystem,
  };
}

/**
 * 현재 활성 국가 코드를 반환한다.
 * 서버 사이드: 요청 컨텍스트에서 결정.
 * 클라이언트: 설정에서 읽어옴.
 * 기본값: 'KR'.
 */
let _activeCountry: CountryCode = 'KR';

export function setActiveCountry(country: CountryCode): void {
  _activeCountry = country;
}

export function getActiveCountry(): CountryCode {
  return _activeCountry;
}

/** 현재 활성 국가의 기본값 조회 (편의 함수) */
export function activeDefaults(): CalcDefaults {
  return getCalcDefaults(_activeCountry);
}

/** 수전 전압 구분 — KEC 232.3.9 의 설비 유형 A(저압) / B(고압 이상). */
export type SupplyLevel = 'low' | 'high';
/** 부하 종류 — KEC 232.3.9 가 조명과 기타를 다르게 본다. */
export type LoadKind = 'lighting' | 'other';

/**
 * KEC 232.3.9 「수용가 설비에서의 전압강하」 한도를 돌려준다.
 *
 * 인입구에서 기기까지의 값이며 수전 전압과 부하 종류로 갈린다(원문 확인
 * 2026-07-26). 배선이 100 m 를 넘으면 넘은 부분에 대해 m 당 0.005% 를 더할 수
 * 있으나 그 가산은 0.5% 를 넘지 못한다.
 *
 *   저압으로 수전     조명 3% / 기타 5%
 *   고압 이상으로 수전 조명 6% / 기타 8%
 *
 * 고압 이상 구분이 없으면 22.9kV·154kV 수전 설비를 저압 기준으로 재단해
 * 멀쩡한 설계를 불합격으로 몬다 — 이 도구가 변전소에서 쓰이므로 실제 문제다.
 *
 * KR 이 아닌 국가 프로파일에는 이 표가 없다. 그때는 undefined 를 돌려주고
 * 호출부가 기존 branch/feeder 기준을 쓰게 한다 — 없는 근거를 지어내지 않는다.
 */
export function kecVoltageDropLimit(
  opts: { supply: SupplyLevel; load: LoadKind; wiringLengthM?: number },
  country: CountryCode = _activeCountry,
): number | undefined {
  const table = getSafetyProfile(country).voltageDropLimits.kec232_3_9;
  if (!table) return undefined;

  const base = opts.supply === 'high'
    ? table.highVoltageSupply[opts.load]
    : table.lowVoltageSupply[opts.load];

  const over = Math.max(0, (opts.wiringLengthM ?? 0) - 100);
  const adder = Math.min(over * table.lengthAdderPerMeter, table.lengthAdderCap);
  return base + adder;
}
