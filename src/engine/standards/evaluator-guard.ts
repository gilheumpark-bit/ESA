// ============================================================
// Placeholder Threshold Guard
// ============================================================
// 일부 조항은 `value: 0`을 실제 임계값이 아니라 자리표시자로 들고 있다.
// 원래는 전용 평가기(KEC_EVALUATORS)가 붙은 조항에만 쓰던 관행인데,
// 평가기가 없는 조항으로 그대로 복사되었다. 범용 조건 트리 평가기는
// 이 0을 문자 그대로 비교하므로 두 방향으로 오판정한다.
//
//   `>= 0` → 어떤 입력이든 PASS   (위험을 통과시킴)
//            예: IEC-434.1 차단용량 — 단락전류를 못 끊는 차단기가 '적합'
//   `<= 0` → 실입력에 항상 FAIL   (정상을 반려함)
//            예: NEC-310.16 부하전류 — 10/50/100A 전부 FAIL
//
// 임계값을 추측해 채우는 것은 전기 실무자의 판단 영역이므로 여기서
// 채우지 않는다. 대신 자동 판정을 보류(HOLD)시킨다. 근거 없는 PASS보다
// "판정 불가"가 안전하고, 제품의 "추정하지 않는다" 원칙과도 일치한다.
//
// note 필드에는 진짜 규칙이 산문으로 적혀 있으므로 사용자에게 그대로 넘긴다.
// ============================================================

/** 조건 평가에 필요한 최소 형태. CodeArticle의 Condition과 구조적으로 호환된다. */
export interface ThresholdLike {
  operator: string;
  value: number;
}

/**
 * 자동 판정이 불가능한 자리표시자 임계값인지 판정한다.
 *
 * 부등호 계열(`>=` `<=` `>` `<`)에서 임계값이 0이면 자리표시자로 본다.
 * `==` / `!=` 는 "0이어야 한다"가 진짜 조건일 수 있으므로 제외한다
 * (예: bool 조항은 `== 1` / `== 0` 형태를 정상적으로 쓴다).
 */
export function isPlaceholderThreshold(cond: ThresholdLike): boolean {
  if (cond.value !== 0) return false;
  return (
    cond.operator === '>=' ||
    cond.operator === '<=' ||
    cond.operator === '>' ||
    cond.operator === '<'
  );
}

// IDENTITY_SEAL: standards/evaluator-guard | role=자리표시자 임계값 판정 보류 | inputs=condition | outputs=boolean
