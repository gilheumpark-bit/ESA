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
 * 활성 국가 코드는 계산 디스패치를 감싸는 동기 스코프로 관리한다.
 *
 * 계산 fn은 동기이므로, 전역을 set→실행→복원하면 동시 요청 간 누출 없이
 * 요청별 국가가 정확히 적용된다(중간에 비동기 인터리브 지점이 없다).
 * node:async_hooks(AsyncLocalStorage)는 이 모듈이 클라이언트 번들에 끌려
 * 들어갈 때 빌드를 깨므로 사용하지 않는다.
 *
 * 서버 사이드: `runWithCountry(country, fn)`으로 계산 디스패치를 감싼다.
 */
let _activeCountry: CountryCode = 'KR';

/** 주어진 국가 스코프 안에서 동기 fn을 실행한다. 중첩 실행은 안쪽 값이 우선, 종료 시 이전 값 복원. */
export function runWithCountry<T>(country: CountryCode, fn: () => T): T {
  const prev = _activeCountry;
  _activeCountry = country;
  try {
    return fn();
  } finally {
    _activeCountry = prev;
  }
}

/**
 * @deprecated 전역을 직접 설정하는 방식. 요청 격리를 위해 `runWithCountry`로 감싸는 것을 권장.
 */
export function setActiveCountry(country: CountryCode): void {
  _activeCountry = country;
}

export function getActiveCountry(): CountryCode {
  return _activeCountry;
}

/** 현재 활성 국가의 기본값 조회 (편의 함수). */
export function activeDefaults(): CalcDefaults {
  return getCalcDefaults(_activeCountry);
}
