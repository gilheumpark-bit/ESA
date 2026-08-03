export const CALIBRATION_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const CALIBRATION_DURATION_LIMIT_MS = 600_000;

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

export function calibrationQualityGate(result) {
  const coverage = result.reasoning?.stages?.find((stage) => stage.id === 'coverage-and-roles');
  const missingRoles = Array.isArray(coverage?.evidence?.missingRoles)
    ? coverage.evidence.missingRoles.filter((role) => typeof role === 'string')
    : [];
  const failedRoleCalls = Number.isFinite(coverage?.evidence?.failedRoleCalls)
    ? coverage.evidence.failedRoleCalls
    : 0;
  const reasons = [];
  if (result.configurationMatched !== true) reasons.push('CONFIGURATION_MISMATCH');
  if (result.durationWithinLimit !== true) reasons.push('DURATION_LIMIT_EXCEEDED');
  if (result.finalStatus !== 'COMPLETE') reasons.push('DOCUMENT_NOT_COMPLETE');
  if (result.verdict === 'FAIL') reasons.push('QUALITY_FAIL');
  else if (result.verdict !== 'PASS') reasons.push('QUALITY_NOT_PASS');
  if (missingRoles.length > 0) reasons.push('REQUIRED_ROLES_MISSING');
  return {
    eligible: reasons.length === 0,
    reasons,
    failedRoleCalls,
    missingRoles,
  };
}
