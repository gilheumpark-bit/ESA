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
