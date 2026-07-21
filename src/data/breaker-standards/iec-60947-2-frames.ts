/**
 * IEC 60947-2 표준 MCCB 프레임/트립 정격 — 무발명 시정 제안의 출처 표.
 * ──────────────────────────────────────────────────────────────────────
 * "고쳐라"는 제안값을 엔진이 지어내면 안 된다(§2.10 도메인 진실·false 제안=최악).
 * 이 표는 시정 후보(프레임 상향·트립 하향)를 **공표 표준 정격에 스냅**하기 위한
 * 사다리다 — 임의 숫자는 만들지 않고, 사다리에 있는 값만 제안한다. 범위 밖이면
 * null을 돌려 "보류"로 떨어뜨린다(발명 대신 침묵).
 *
 * 출처: IEC 60947-2(저압 차단기) 표준 프레임 정격 + IEC 60947-1 선호 정격 사다리.
 * 국내 제조사(LS ELECTRIC 등)의 프레임 세트(150/175/225AT 등)가 다를 수 있으며,
 * 그 경우 사내규정(custom-rules)의 저자 제공 remedy가 이 일반 제안을 우선한다.
 */

/** 표준 프레임 정격(AF) — 오름차순. IEC 60947-2 표준 세트(개발자 승인). */
export const IEC_STANDARD_FRAMES_A: readonly number[] = [
  16, 32, 40, 50, 63, 100, 125, 160, 225, 250, 400, 630, 800, 1000, 1250, 1600,
];

/** 표준 트립 정격(AT) — 오름차순. IEC 60947-1 선호 정격. */
export const IEC_STANDARD_TRIPS_A: readonly number[] = [
  16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 225, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600,
];

export const IEC_FRAME_SOURCE = 'IEC 60947-2 표준 프레임 정격';
export const IEC_TRIP_SOURCE = 'IEC 60947-1 표준 트립 정격(선호수)';

/**
 * 트립을 수용하는 최소 표준 프레임(≥ tripA). 사다리 최대치를 넘으면 null.
 * 예: smallestFrameFor(150) = 160 — 100AF/150AT 위반 시 "프레임을 160AF 이상으로".
 */
export function smallestFrameFor(tripA: number): number | null {
  for (const f of IEC_STANDARD_FRAMES_A) if (f >= tripA) return f;
  return null;
}

/**
 * 상한(A) 이하 최대 표준 트립(≤ limitA). 사다리 최소치보다 작으면 null.
 * 프레임 유지 시 트립 하향(limit=frameA)·케이블 허용전류에 맞춘 트립 하향
 * (limit=ampacity) 양쪽에 쓴다. 배열이 오름차순이라 초과 시 조기 종료.
 */
export function largestTripAtMost(limitA: number): number | null {
  let best: number | null = null;
  for (const t of IEC_STANDARD_TRIPS_A) {
    if (t <= limitA) best = t;
    else break;
  }
  return best;
}

// IDENTITY_SEAL: data/breaker-standards/iec-60947-2-frames | role=무발명 제안 출처(표준 정격 사다리) | inputs=tripA·limitA | outputs=표준 프레임/트립 스냅값
