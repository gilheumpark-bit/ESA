export const CALIBRATION_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const CALIBRATION_DURATION_LIMIT_MS = 600_000;

/**
 * 역할별 추론 프로필의 역할 목록. 정본은 `src/lib/drawing-reasoning-effort.ts`
 * 의 `DRAWING_EFFORT_ROLES` 이고, 이 파일은 .mjs 라 TS 를 가져올 수 없어
 * 복제한다(`CALIBRATION_EFFORTS` 와 같은 이유). 정본이 바뀌면 여기도 바꾼다.
 */
export const CALIBRATION_EFFORT_ROLES = ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'];

/**
 * `--profile` 인자를 읽는다. 알 수 없는 역할·단계는 거부한다 — 조용히 버리면
 * 요청한 프로필과 실제 호출이 어긋나 A/B 결과가 거짓말이 된다.
 */
export function parseCalibrationEffortProfile(raw) {
  if (!raw) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('INVALID_CALIBRATION_PROFILE_JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('INVALID_CALIBRATION_PROFILE');
  }
  for (const [role, effort] of Object.entries(parsed)) {
    if (!CALIBRATION_EFFORT_ROLES.includes(role)) throw new Error(`UNKNOWN_CALIBRATION_PROFILE_ROLE:${role}`);
    if (!CALIBRATION_EFFORTS.includes(effort)) throw new Error(`UNKNOWN_CALIBRATION_PROFILE_EFFORT:${role}`);
  }
  return Object.keys(parsed).length === 0 ? undefined : parsed;
}

/**
 * 영수증 파일 이름과 표에 쓸 짧은 라벨. 프로필이 다르면 라벨도 달라야
 * 이전 실행의 영수증을 덮어쓰지 않는다.
 */
export function calibrationProfileLabel(profile) {
  if (!profile) return 'uniform';
  return CALIBRATION_EFFORT_ROLES
    .filter((role) => profile[role] !== undefined)
    .map((role) => `${role.slice(0, 3)}-${profile[role]}`)
    .join('_');
}

export const CALIBRATION_MODELS = {
  gpt: {
    provider: 'chatgpt-local',
    model: 'gpt-5.5',
    label: 'GPT-5.5',
    efforts: ['low', 'medium', 'high', 'xhigh'],
  },
  luna: {
    provider: 'chatgpt-local',
    model: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    efforts: ['high', 'xhigh', 'max'],
    excludedEfforts: ['low', 'medium'],
  },
  terra: {
    provider: 'chatgpt-local',
    model: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    efforts: [...CALIBRATION_EFFORTS],
  },
  sol: {
    provider: 'chatgpt-local',
    model: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    efforts: [...CALIBRATION_EFFORTS],
  },
};

export function buildDrawingCalibrationPlan({
  models = Object.keys(CALIBRATION_MODELS),
  efforts = CALIBRATION_EFFORTS,
  tiers = ['beginner', 'intermediate', 'advanced'],
} = {}) {
  const cells = [];
  const skipped = [];
  for (const modelId of models) {
    const model = CALIBRATION_MODELS[modelId];
    if (!model) throw new Error(`UNKNOWN_CALIBRATION_MODEL:${modelId}`);
    for (const effort of efforts) {
      if (!CALIBRATION_EFFORTS.includes(effort)) throw new Error(`UNKNOWN_CALIBRATION_EFFORT:${effort}`);
      if (!model.efforts.includes(effort)) {
        skipped.push({
          modelId,
          effort,
          reason: model.excludedEfforts?.includes(effort)
            ? 'MODEL_EFFORT_POLICY_EXCLUDED'
            : 'MODEL_EFFORT_UNSUPPORTED',
        });
        continue;
      }
      for (const tier of tiers) cells.push({ modelId, effort, tier, ...model });
    }
  }
  return { cells, skipped };
}

export function isCalibrationDurationWithinLimit(durationMs) {
  return Number.isFinite(durationMs)
    && durationMs >= 0
    && durationMs <= CALIBRATION_DURATION_LIMIT_MS;
}

export function selectCalibrationValues(raw, allowed) {
  if (!raw) return [...allowed];
  const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
  const unknown = values.filter((value) => !allowed.includes(value));
  if (unknown.length > 0) throw new Error(`UNKNOWN_CALIBRATION_VALUE:${unknown.join(',')}`);
  return values;
}

/**
 * 후보 게이트. 판정 강도는 그대로다 — 아래 사유가 하나라도 있으면 후보가
 * 아니다. 다만 `coverage-auditor` 는 판독 역할이 아니라 파생 판정이므로
 * 기호·연결·문자·논리 역할 손실과 같은 사유로 접지 않는다. 두 원인은 수리
 * 방향이 정반대다: 판독 역할 손실은 모델·호출 문제, 감사 미해결은 재검사
 * 대상이나 그래프 충돌이 남았다는 뜻이다.
 */
export function calibrationQualityGate(result) {
  const coverage = result.reasoning?.stages?.find((stage) => stage.id === 'coverage-and-roles');
  const stringList = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);
  const missingRoles = stringList(coverage?.evidence?.missingRoles);
  const missingCoreRoles = coverage?.evidence?.missingCoreRoles === undefined
    ? missingRoles.filter((role) => role !== 'coverage-auditor')
    : stringList(coverage.evidence.missingCoreRoles);
  const auditUnresolved = missingRoles.includes('coverage-auditor');
  const auditReceiptMissing = coverage?.evidence?.auditReceiptMissing === true;
  const failedRoleCalls = Number.isFinite(coverage?.evidence?.failedRoleCalls)
    ? coverage.evidence.failedRoleCalls
    : 0;
  const reasons = [];
  if (result.configurationMatched !== true) reasons.push('CONFIGURATION_MISMATCH');
  if (result.durationWithinLimit !== true) reasons.push('DURATION_LIMIT_EXCEEDED');
  if (result.finalStatus !== 'COMPLETE') reasons.push('DOCUMENT_NOT_COMPLETE');
  if (result.verdict === 'FAIL') reasons.push('QUALITY_FAIL');
  else if (result.verdict !== 'PASS') reasons.push('QUALITY_NOT_PASS');
  if (missingCoreRoles.length > 0) reasons.push('REQUIRED_ROLES_MISSING');
  if (auditReceiptMissing) reasons.push('COVERAGE_AUDIT_NO_RECEIPT');
  else if (auditUnresolved) reasons.push('COVERAGE_AUDIT_UNRESOLVED');
  return {
    eligible: reasons.length === 0,
    reasons,
    failedRoleCalls,
    missingRoles,
    missingCoreRoles,
    auditUnresolved,
    auditReceiptMissing,
  };
}
