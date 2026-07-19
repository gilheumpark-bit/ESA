// ============================================================
// Dedicated Article Evaluators
// ============================================================
// 자리표시자(value:0) 조항 중 "발명된 숫자 없이" 실판정이 가능한 것을
// 전용 평가기로 승격한다. 나머지는 evaluator-guard가 HOLD로 유지한다.
//
// 승격 원칙 (사용자 지침: "실무자가 채우는 게 아니라 공인된 값이어야 함,
// 사람은 언제나 틀렸을 전제"):
//   - 임계값의 출처는 (i) 다른 측정/계산 입력, 또는 (ii) 리포 내 공인표뿐이다.
//   - 사람의 추정이나 note 요약을 임계값으로 인코딩하지 않는다.
//   - 임계값을 확보할 수 없으면 PASS/FAIL을 만들지 않고 HOLD한다.
//
// 현재 승격된 것: 차단용량 조항 (breakingCapacity ≥ 예상 단락전류).
//   두 값 모두 측정/계산 입력이며, 코드 규칙대로 비교만 한다.
// ============================================================

import type { CodeArticle, Condition, JudgmentResult } from './kec/types';
import { makePass, makeFail, makeHold } from './kec/types';
import { getIECArticle } from './iec/iec-articles';
import { getJISArticle } from './jis/jis-articles';
import { getNECArticleFull } from './nec/nec-articles';
import { getKECArticle } from './kec';

/**
 * 차단용량 판정: 차단기/개폐기의 정격 차단용량이 설치점 예상 단락전류
 * 이상이어야 한다 (IEC 60364-4-43, JIS C 8201 등).
 *
 * 임계값(예상 단락전류)은 사람이 추정하는 값이 아니라 단락전류 계산기가
 * 산출하는 입력이다. 두 값을 코드 규칙대로 비교할 뿐이다.
 * 예상 단락전류가 없으면 비교 대상이 없으므로 HOLD (절대 PASS 없음).
 */
function evaluateBreakingCapacity(
  article: CodeArticle,
  params: Record<string, number>,
): JudgmentResult {
  const capacity = params.breakingCapacity_kA;
  const prospective = params.prospectiveShortCircuit_kA;

  const missing: string[] = [];
  if (capacity == null || !Number.isFinite(capacity)) {
    missing.push('breakingCapacity_kA (차단기 정격 차단용량)');
  }
  if (prospective == null || !Number.isFinite(prospective)) {
    missing.push('prospectiveShortCircuit_kA (설치점 예상 단락전류 — 단락전류 계산기로 산출)');
  }
  if (missing.length > 0) {
    return makeHold(article, missing);
  }

  // 임계값은 입력된 예상 단락전류. article.article은 코드 조항 번호(출처).
  const cond: Condition = {
    param: 'breakingCapacity_kA',
    operator: '>=',
    value: prospective,
    unit: 'kA',
    result: 'PASS',
    note: '차단용량 ≥ 설치점 예상 단락전류',
  };
  const source = `출처: ${article.standard} ${article.article} (${article.version})`;

  if (capacity >= prospective) {
    return makePass(article, [cond], [
      source,
      `차단용량 ${capacity}kA ≥ 예상 단락전류 ${prospective}kA`,
    ]);
  }
  return makeFail(article, [], [cond], [
    source,
    `차단용량 ${capacity}kA < 예상 단락전류 ${prospective}kA — 사고 시 차단 실패 위험`,
  ]);
}

/**
 * 허용전류 판정: 부하전류가 전선 허용전류 이하여야 한다
 * (NEC Table 310.16, IEC 60364-5-52 등).
 *
 * 임계값(wireAmpacity)은 사람이 추정하는 값이 아니라 공인 허용전류표
 * (getNecAmpacity/getIecAmpacity, SourceTag 보유)가 산출하는 값이다.
 * 평가기는 두 값을 코드 규칙(부하전류 ≤ 허용전류)대로 비교만 한다.
 * 허용전류가 없으면 비교 대상이 없으므로 HOLD (절대 FAIL·PASS 없음).
 */
function evaluateAmpacity(
  article: CodeArticle,
  params: Record<string, number>,
): JudgmentResult {
  const load = params.loadCurrent;
  const ampacity = params.wireAmpacity;

  const missing: string[] = [];
  if (load == null || !Number.isFinite(load)) {
    missing.push('loadCurrent (부하전류)');
  }
  if (ampacity == null || !Number.isFinite(ampacity)) {
    missing.push('wireAmpacity (전선 허용전류 — 공인 허용전류표에서 산출)');
  }
  if (missing.length > 0) {
    return makeHold(article, missing);
  }

  const cond: Condition = {
    param: 'loadCurrent',
    operator: '<=',
    value: ampacity,
    unit: 'A',
    result: 'PASS',
    note: '부하전류 ≤ 전선 허용전류',
  };
  const source = `출처: ${article.standard} ${article.article} (${article.version})`;

  if (load <= ampacity) {
    return makePass(article, [cond], [
      source,
      `부하전류 ${load}A ≤ 전선 허용전류 ${ampacity}A`,
    ]);
  }
  return makeFail(article, [], [cond], [
    source,
    `부하전류 ${load}A > 전선 허용전류 ${ampacity}A — 전선 과부하 위험`,
  ]);
}

/**
 * 분류·적용범위 조항: 임계값 비교가 아니라 "이 조항이 적용되는 범위" 또는
 * "구역/등급 분류"를 안내하는 조항(KEC-111.1 적용범위, 욕실 Zone 구분 등).
 * pass/fail 대상이 아니므로 어떤 입력에도 판정하지 않고, 정확한 사유의 HOLD를
 * 반환한다. (자리표시자 가드의 "임계값 누락" 사유가 오해를 부르는 것을 교정)
 */
function evaluateInformational(article: CodeArticle): JudgmentResult {
  return makeHold(article, [
    '이 조항은 적용범위/구역 분류 안내이며 자동 pass/fail 판정 대상이 아님',
  ]);
}

/**
 * OCPD ≤ 전선 허용전류 (NEC 240.4). 두 값 모두 입력(정격표·허용전류표 산출)이며
 * 코드 규칙대로 비교만 한다. 발명된 임계값 없음.
 */
function evaluateOcpdVsAmpacity(
  article: CodeArticle,
  params: Record<string, number>,
): JudgmentResult {
  const ocpd = params.ocpdRating;
  const ampacity = params.wireAmpacity;
  const missing: string[] = [];
  if (ocpd == null || !Number.isFinite(ocpd)) missing.push('ocpdRating (과전류보호장치 정격)');
  if (ampacity == null || !Number.isFinite(ampacity)) missing.push('wireAmpacity (전선 허용전류 — 공인표 산출)');
  if (missing.length > 0) return makeHold(article, missing);

  const cond: Condition = {
    param: 'ocpdRating', operator: '<=', value: ampacity, unit: 'A', result: 'PASS',
    note: 'OCPD 정격 ≤ 전선 허용전류 (예외 240.4(B)는 별도 검토)',
  };
  const source = `출처: ${article.standard} ${article.article} (${article.version})`;
  if (ocpd <= ampacity) {
    return makePass(article, [cond], [source, `OCPD ${ocpd}A ≤ 허용전류 ${ampacity}A`]);
  }
  return makeFail(article, [], [cond], [source, `OCPD ${ocpd}A > 허용전류 ${ampacity}A — 전선 과부하 보호 실패`]);
}

/**
 * 허용전류 ≥ 비연속부하 + 연속부하×1.25 (NEC 210.19/215.2).
 * 1.25는 NEC 원문의 공표 계수(연속부하 125%)다 — 추정치가 아니다.
 */
function evaluateContinuousLoadAmpacity(
  article: CodeArticle,
  params: Record<string, number>,
  ampacityParam: string,
): JudgmentResult {
  const ampacity = params[ampacityParam];
  const noncontinuous = params.noncontinuousLoad_A;
  const continuous = params.continuousLoad_A;
  const missing: string[] = [];
  if (ampacity == null || !Number.isFinite(ampacity)) missing.push(`${ampacityParam} (전선 허용전류)`);
  if (noncontinuous == null || !Number.isFinite(noncontinuous)) missing.push('noncontinuousLoad_A (비연속부하 전류)');
  if (continuous == null || !Number.isFinite(continuous)) missing.push('continuousLoad_A (연속부하 전류)');
  if (missing.length > 0) return makeHold(article, missing);

  const required = noncontinuous + continuous * 1.25;
  const cond: Condition = {
    param: ampacityParam, operator: '>=', value: Math.round(required * 100) / 100, unit: 'A', result: 'PASS',
    note: '허용전류 ≥ 비연속 + 연속×1.25 (NEC 공표 계수)',
  };
  const source = `출처: ${article.standard} ${article.article} (${article.version})`;
  if (ampacity >= required) {
    return makePass(article, [cond], [source, `허용전류 ${ampacity}A ≥ ${noncontinuous}+${continuous}×1.25=${cond.value}A`]);
  }
  return makeFail(article, [], [cond], [source, `허용전류 ${ampacity}A < 요구 ${cond.value}A — 연속부하 여유 부족`]);
}

/**
 * 전동기 분기 전선 ≥ FLC×1.25 (NEC 430.22) / 다중 전동기 ≥ 최대FLC×1.25 + ΣFLC
 * (NEC 430.24). 1.25는 NEC 원문 공표 계수.
 */
function evaluateMotorBranchConductor(
  article: CodeArticle,
  params: Record<string, number>,
): JudgmentResult {
  const ampacity = params.branchConductorAmpacity;
  const flc = params.motorFLC_A;
  const missing: string[] = [];
  if (ampacity == null || !Number.isFinite(ampacity)) missing.push('branchConductorAmpacity (분기 전선 허용전류)');
  if (flc == null || !Number.isFinite(flc)) missing.push('motorFLC_A (전동기 FLC — NEC 표 값)');
  if (missing.length > 0) return makeHold(article, missing);

  const required = flc * 1.25;
  const cond: Condition = {
    param: 'branchConductorAmpacity', operator: '>=', value: Math.round(required * 100) / 100, unit: 'A', result: 'PASS',
    note: '분기 전선 허용전류 ≥ FLC×1.25',
  };
  const source = `출처: ${article.standard} ${article.article} (${article.version})`;
  if (ampacity >= required) {
    return makePass(article, [cond], [source, `허용전류 ${ampacity}A ≥ FLC ${flc}×1.25=${cond.value}A`]);
  }
  return makeFail(article, [], [cond], [source, `허용전류 ${ampacity}A < 요구 ${cond.value}A`]);
}

function evaluateMultiMotorConductor(
  article: CodeArticle,
  params: Record<string, number>,
): JudgmentResult {
  const ampacity = params.multiMotorConductorAmpacity;
  const largest = params.largestMotorFLC_A;
  const others = params.otherMotorsFLCSum_A;
  const missing: string[] = [];
  if (ampacity == null || !Number.isFinite(ampacity)) missing.push('multiMotorConductorAmpacity (회로 전선 허용전류)');
  if (largest == null || !Number.isFinite(largest)) missing.push('largestMotorFLC_A (최대 전동기 FLC)');
  if (others == null || !Number.isFinite(others)) missing.push('otherMotorsFLCSum_A (나머지 전동기 FLC 합)');
  if (missing.length > 0) return makeHold(article, missing);

  const required = largest * 1.25 + others;
  const cond: Condition = {
    param: 'multiMotorConductorAmpacity', operator: '>=', value: Math.round(required * 100) / 100, unit: 'A', result: 'PASS',
    note: '≥ 최대 FLC×1.25 + 나머지 FLC 합',
  };
  const source = `출처: ${article.standard} ${article.article} (${article.version})`;
  if (ampacity >= required) {
    return makePass(article, [cond], [source, `허용전류 ${ampacity}A ≥ ${largest}×1.25+${others}=${cond.value}A`]);
  }
  return makeFail(article, [], [cond], [source, `허용전류 ${ampacity}A < 요구 ${cond.value}A`]);
}

/**
 * 보호도체(PE) 단면적 (IEC 60364-5-54 Table 54.3 공표 규칙):
 * 상도체 S ≤16mm² → PE ≥ S · 16<S≤35 → PE ≥ 16 · S>35 → PE ≥ S/2.
 * 브래킷과 계수 전부 표준 원문의 공표 값 — 추정 없음. (등전위본딩 계산기와 동일 근거)
 */
function evaluateProtectiveConductorSize(
  article: CodeArticle,
  params: Record<string, number>,
): JudgmentResult {
  const phase = params.phaseConductorSize_mm2;
  const pe = params.protectiveConductorSize_mm2;
  const missing: string[] = [];
  if (phase == null || !Number.isFinite(phase)) missing.push('phaseConductorSize_mm2 (상도체 단면적)');
  if (pe == null || !Number.isFinite(pe)) missing.push('protectiveConductorSize_mm2 (보호도체 단면적)');
  if (missing.length > 0) return makeHold(article, missing);

  const required = phase <= 16 ? phase : phase <= 35 ? 16 : phase / 2;
  const bracket = phase <= 16 ? 'S≤16 → PE≥S' : phase <= 35 ? '16<S≤35 → PE≥16' : 'S>35 → PE≥S/2';
  const cond: Condition = {
    param: 'protectiveConductorSize_mm2', operator: '>=', value: Math.round(required * 100) / 100, unit: 'mm²', result: 'PASS',
    note: `Table 54.3: ${bracket}`,
  };
  const source = `출처: ${article.standard} ${article.article} (${article.version}) Table 54.3`;
  if (pe >= required) {
    return makePass(article, [cond], [source, `PE ${pe}mm² ≥ 요구 ${cond.value}mm² (${bracket})`]);
  }
  return makeFail(article, [], [cond], [source, `PE ${pe}mm² < 요구 ${cond.value}mm² (${bracket})`]);
}

/** 조항 조회 + 평가를 묶는다. 조항이 없으면 null (디스패처가 폴백). */
function withArticle(
  article: CodeArticle | null,
  evaluate: (a: CodeArticle) => JudgmentResult,
): JudgmentResult | null {
  return article ? evaluate(article) : null;
}

/**
 * 조항 id → 전용 평가기. registry.evaluateStandard가 범용 경로보다 먼저
 * 이 맵을 조회한다. 반환이 null이면(조항 미존재 등) 범용 경로로 폴백.
 */
export const DEDICATED_EVALUATORS: Map<
  string,
  (params: Record<string, number>) => JudgmentResult | null
> = new Map<string, (params: Record<string, number>) => JudgmentResult | null>([
  ['IEC-434.1', (p) => withArticle(getIECArticle('IEC-434.1'), (a) => evaluateBreakingCapacity(a, p))],
  ['IEC-533.1', (p) => withArticle(getIECArticle('IEC-533.1'), (a) => evaluateBreakingCapacity(a, p))],
  ['JIS-434.1', (p) => withArticle(getJISArticle('JIS-434.1'), (a) => evaluateBreakingCapacity(a, p))],
  ['NEC-310.16', (p) => withArticle(getNECArticleFull('NEC-310.16'), (a) => evaluateAmpacity(a, p))],
  // G1 승격 (2026-07-20): 입력↔입력 비교 + 표준 원문 공표 계수(1.25·Table 54.3)만.
  ['NEC-240.4', (p) => withArticle(getNECArticleFull('NEC-240.4'), (a) => evaluateOcpdVsAmpacity(a, p))],
  ['NEC-210.19', (p) => withArticle(getNECArticleFull('NEC-210.19'), (a) => evaluateContinuousLoadAmpacity(a, p, 'conductorAmpacity'))],
  ['NEC-215.2', (p) => withArticle(getNECArticleFull('NEC-215.2'), (a) => evaluateContinuousLoadAmpacity(a, p, 'feederAmpacity'))],
  ['NEC-430.22', (p) => withArticle(getNECArticleFull('NEC-430.22'), (a) => evaluateMotorBranchConductor(a, p))],
  ['NEC-430.24', (p) => withArticle(getNECArticleFull('NEC-430.24'), (a) => evaluateMultiMotorConductor(a, p))],
  ['IEC-543.1', (p) => withArticle(getIECArticle('IEC-543.1'), (a) => evaluateProtectiveConductorSize(a, p))],
  ['IEC-523.1', (p) => withArticle(getIECArticle('IEC-523.1'), (a) => evaluateAmpacity(a, p))],
  // 분류·적용범위 조항 — pass/fail 대상 아님, 정확한 사유로 HOLD
  ['KEC-111.1', () => withArticle(getKECArticle('KEC-111.1'), evaluateInformational)],
  ['KEC-250.1', () => withArticle(getKECArticle('KEC-250.1'), evaluateInformational)],
  ['JIS-701.1', () => withArticle(getJISArticle('JIS-701.1'), evaluateInformational)],
]);

// IDENTITY_SEAL: standards/dedicated-evaluators | role=자리표시자 조항 실판정 승격 | inputs=params | outputs=JudgmentResult
