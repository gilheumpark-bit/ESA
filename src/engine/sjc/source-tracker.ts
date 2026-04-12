/**
 * Source Tracker — 값의 출처 추적 시스템
 *
 * ESVA의 핵심 원칙: "LLM은 귀, ESVA 엔진은 뇌"
 * 모든 값은 반드시 출처(SourceTag)를 가져야 한다.
 * 출처 없는 값은 BLOCK 판정의 트리거가 된다.
 *
 * SourceType 4종:
 *   USER  — 사용자 직접 입력값
 *   CODE  — 기준서 DB에서 조회한 값 (예: 허용전류표)
 *   CALC  — ESVA 엔진이 계산한 출력값
 *   CONST — 물리 상수 (예: 구리 비저항)
 *
 * LLM이 생성한 값은 태그 불가 → BLOCK.
 */

import { SourceTag } from './types';

// ---------------------------------------------------------------------------
// PART 1 — Source 타입 정의
// ---------------------------------------------------------------------------

/** 값의 출처 유형 */
export type SourceType = 'USER' | 'CODE' | 'CALC' | 'CONST';

/** 출처 태그가 부착된 값 */
export interface TrackedValue<T = unknown> {
  /** 실제 값 */
  value: T;
  /** 출처 유형 */
  sourceType: SourceType;
  /** 기준서 참조 (CODE, CALC 유형일 때) */
  sourceTag?: SourceTag;
  /** 추적 타임스탬프 (ISO-8601) */
  trackedAt: string;
  /** 출처 설명 (사람이 읽을 수 있는 형태) */
  description?: string;
}

/** 추적 검증 결과 */
export interface SourceValidation {
  /** 모든 값에 소스 태그가 있는지 */
  valid: boolean;
  /** 소스 태그가 없는 필드명 목록 */
  untagged: string[];
  /** 소스 태그가 있는 필드명 목록 */
  tagged: string[];
}

// ---------------------------------------------------------------------------
// PART 2 — 내부 저장소 (WeakMap 기반)
// ---------------------------------------------------------------------------

/**
 * 값→출처 매핑 저장소.
 * 객체 값은 WeakMap, 원시값은 일반 Map으로 관리.
 * WeakMap을 사용하여 GC 누수를 방지한다.
 */
const objectSourceMap = new WeakMap<object, TrackedValue>();
const primitiveSourceMap = new Map<string, TrackedValue>();

/** 원시값의 고유 키 생성 (type + value 결합) */
function primitiveKey(value: unknown): string {
  return `${typeof value}::${String(value)}`;
}

// ---------------------------------------------------------------------------
// PART 3 — 핵심 API
// ---------------------------------------------------------------------------

/**
 * 값에 출처 태그를 부착한다.
 *
 * @param value - 추적할 값
 * @param sourceType - 출처 유형 (USER, CODE, CALC, CONST)
 * @param sourceTag - 기준서 참조 (선택)
 * @param description - 출처 설명 (선택)
 * @returns TrackedValue<T> — 출처가 부착된 값 객체
 */
export function trackSource<T>(
  value: T,
  sourceType: SourceType,
  sourceTag?: SourceTag,
  description?: string,
): TrackedValue<T> {
  const tracked: TrackedValue<T> = {
    value,
    sourceType,
    sourceTag,
    trackedAt: new Date().toISOString(),
    description,
  };

  // 저장소에 등록
  if (value !== null && value !== undefined && typeof value === 'object') {
    objectSourceMap.set(value as object, tracked as TrackedValue);
  } else {
    primitiveSourceMap.set(primitiveKey(value), tracked as TrackedValue);
  }

  return tracked;
}

/**
 * 값에 출처 태그가 부착되어 있는지 확인한다.
 *
 * @param value - 확인할 값
 * @returns boolean — 출처 태그 존재 여부
 */
export function isSourced(value: unknown): boolean {
  if (value === null || value === undefined) return false;

  // TrackedValue 객체 자체인 경우
  if (isTrackedValue(value)) return true;

  // 저장소 조회
  if (typeof value === 'object') {
    return objectSourceMap.has(value as object);
  }

  return primitiveSourceMap.has(primitiveKey(value));
}

/**
 * 값의 출처 정보를 조회한다.
 *
 * @param value - 조회할 값
 * @returns TrackedValue | null
 */
export function getSource(value: unknown): TrackedValue | null {
  if (value === null || value === undefined) return null;

  if (isTrackedValue(value)) return value as TrackedValue;

  if (typeof value === 'object') {
    return objectSourceMap.get(value as object) ?? null;
  }

  return primitiveSourceMap.get(primitiveKey(value)) ?? null;
}

/**
 * CalcResult 객체의 모든 필드에 대해 소스 태그 검증을 수행한다.
 *
 * @param result - 검증할 CalcResult (또는 임의의 Record)
 * @returns SourceValidation — { valid, untagged[], tagged[] }
 */
export function validateSources(
  result: Record<string, unknown>,
): SourceValidation {
  const tagged: string[] = [];
  const untagged: string[] = [];

  for (const [key, value] of Object.entries(result)) {
    // 메타 필드는 검증 스킵
    if (key === 'source' || key === 'judgment' || key === 'formula') {
      continue;
    }

    // CalcResult.source 배열이 존재하고 비어있지 않으면 태그 있음
    if (key === 'value' && Array.isArray(result.source) && result.source.length > 0) {
      tagged.push(key);
      continue;
    }

    if (isSourced(value) || isTrackedValue(value)) {
      tagged.push(key);
    } else if (value !== null && value !== undefined) {
      untagged.push(key);
    }
  }

  return {
    valid: untagged.length === 0,
    untagged,
    tagged,
  };
}

// ---------------------------------------------------------------------------
// PART 4 — 편의 헬퍼
// ---------------------------------------------------------------------------

/** USER 소스 생성 (사용자 직접 입력) */
export function fromUser<T>(value: T, description?: string): TrackedValue<T> {
  return trackSource(value, 'USER', undefined, description ?? '사용자 입력값');
}

/** CODE 소스 생성 (기준서 DB 조회) */
export function fromCode<T>(value: T, sourceTag: SourceTag, description?: string): TrackedValue<T> {
  return trackSource(value, 'CODE', sourceTag, description ?? `기준서 조회: ${sourceTag.standard} ${sourceTag.clause}`);
}

/** CALC 소스 생성 (엔진 계산 결과) */
export function fromCalc<T>(value: T, sourceTag?: SourceTag, description?: string): TrackedValue<T> {
  return trackSource(value, 'CALC', sourceTag, description ?? 'ESVA 엔진 계산값');
}

/** CONST 소스 생성 (물리 상수) */
export function fromConst<T>(value: T, description: string): TrackedValue<T> {
  return trackSource(value, 'CONST', undefined, description);
}

// ---------------------------------------------------------------------------
// PART 5 — 타입 가드
// ---------------------------------------------------------------------------

/** TrackedValue 타입 가드 */
export function isTrackedValue(value: unknown): value is TrackedValue {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }
  const tv = value as Record<string, unknown>;
  return (
    'value' in tv &&
    'sourceType' in tv &&
    'trackedAt' in tv &&
    typeof tv.sourceType === 'string' &&
    ['USER', 'CODE', 'CALC', 'CONST'].includes(tv.sourceType as string)
  );
}

/**
 * 추적 저장소를 초기화한다 (테스트용).
 * 주의: WeakMap은 명시적 clear가 불가하므로 primitiveSourceMap만 초기화.
 */
export function clearSourceTracking(): void {
  primitiveSourceMap.clear();
}
