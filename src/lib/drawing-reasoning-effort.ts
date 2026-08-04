export const DRAWING_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type DrawingReasoningEffort = (typeof DRAWING_REASONING_EFFORTS)[number];

const DEFAULT_ROLE_TIMEOUT_MS = 45_000;
const CALIBRATION_LOCAL_ROLE_TIMEOUT_MS = 75_000;
const HIGH_LOCAL_ROLE_TIMEOUT_MS = 120_000;

export function drawingRoleTimeoutMs(
  provider: string,
  effort: DrawingReasoningEffort | undefined,
): number {
  if (provider !== 'chatgpt-local') return DEFAULT_ROLE_TIMEOUT_MS;
  return effort === 'high' || effort === 'xhigh' || effort === 'max'
    ? HIGH_LOCAL_ROLE_TIMEOUT_MS
    : effort === 'low' || effort === 'medium'
      ? CALIBRATION_LOCAL_ROLE_TIMEOUT_MS
      : DEFAULT_ROLE_TIMEOUT_MS;
}

export function drawingDocumentDeadlineMs(
  provider: string,
  effort: string,
): number {
  void provider;
  // Calibration treats every explicit effort as quality-first: duration is a
  // pass/fail boundary at 9.5 minutes, not a score inside that boundary.
  return isDrawingReasoningEffort(effort) ? 570_000 : 270_000;
}

export function isDrawingReasoningEffort(value: string): value is DrawingReasoningEffort {
  return (DRAWING_REASONING_EFFORTS as readonly string[]).includes(value);
}

/**
 * 역할별 추론 단계.
 *
 * 하나의 effort 를 30~48개 전체·구획 역할 호출에 일괄 적용하면 기호·문자
 * 추출처럼 판독 위주인 역할까지 고추론 시간을 쓴다. 2026-08-03 캘리브레이션
 * 실패 414건 중 374건이 timeout·deadline 이었다(docs/VALIDATION_EVIDENCE.md 9차).
 *
 * 지정하지 않은 역할은 문서 기본 effort 를 그대로 쓴다. 기본값은 비어 있고,
 * 기본 프로필 승격은 같은 snapshot A/B 실측 뒤에만 한다.
 */
export const DRAWING_EFFORT_ROLES = [
  'symbols',
  'connections',
  'text',
  'logic',
  'coverage-auditor',
] as const;

export type DrawingEffortRole = (typeof DRAWING_EFFORT_ROLES)[number];

export type DrawingEffortProfile = Readonly<Partial<Record<DrawingEffortRole, DrawingReasoningEffort>>>;

export function isDrawingEffortRole(value: string): value is DrawingEffortRole {
  return (DRAWING_EFFORT_ROLES as readonly string[]).includes(value);
}

/** 해당 역할이 실제로 쓸 추론 단계. 프로필에 없으면 문서 기본값이다. */
export function resolveRoleEffort(
  role: string,
  documentEffort: DrawingReasoningEffort | undefined,
  profile: DrawingEffortProfile | undefined,
): DrawingReasoningEffort | undefined {
  if (!profile || !isDrawingEffortRole(role)) return documentEffort;
  return profile[role] ?? documentEffort;
}

/**
 * 지문에 넣을 정규 문자열. 역할 순서와 무관하게 같은 프로필이면 같은 값이라야
 * 페이지 재사용 판정이 흔들리지 않는다. 프로필이 없으면 undefined 를 돌려
 * 기존 지문과 동일하게 남긴다.
 */
export function drawingEffortProfileKey(
  profile: DrawingEffortProfile | undefined,
): string | undefined {
  if (!profile) return undefined;
  const entries = DRAWING_EFFORT_ROLES
    .filter((role) => profile[role] !== undefined)
    .map((role) => `${role}:${profile[role]}`);
  return entries.length === 0 ? undefined : entries.join(',');
}

/**
 * 신뢰할 수 없는 입력에서 프로필을 읽는다. 알 수 없는 역할과 단계는 통과시키지
 * 않고 거부한다 — 조용히 버리면 요청한 프로필과 실제 호출이 어긋난다.
 */
export function parseDrawingEffortProfile(raw: unknown): DrawingEffortProfile | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  let source: unknown = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      throw new Error('DRAWING_EFFORT_PROFILE_INVALID_JSON');
    }
  }
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    throw new Error('DRAWING_EFFORT_PROFILE_INVALID');
  }
  const entries = Object.entries(source as Record<string, unknown>);
  if (entries.length > DRAWING_EFFORT_ROLES.length) {
    throw new Error('DRAWING_EFFORT_PROFILE_INVALID');
  }
  const profile: Partial<Record<DrawingEffortRole, DrawingReasoningEffort>> = {};
  for (const [role, effort] of entries) {
    if (!isDrawingEffortRole(role)) throw new Error(`DRAWING_EFFORT_PROFILE_UNKNOWN_ROLE:${role}`);
    if (typeof effort !== 'string' || !isDrawingReasoningEffort(effort)) {
      throw new Error(`DRAWING_EFFORT_PROFILE_UNKNOWN_EFFORT:${role}`);
    }
    profile[role] = effort;
  }
  return Object.keys(profile).length === 0 ? undefined : profile;
}
