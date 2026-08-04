import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CALIBRATION_DURATION_LIMIT_MS,
  CALIBRATION_EFFORTS,
  CALIBRATION_MODELS,
  buildDrawingCalibrationPlan,
  calibrationProfileLabel,
  parseCalibrationEffortProfile,
  calibrationQualityGate,
  isCalibrationDurationWithinLimit,
  selectCalibrationValues,
} from './drawing-calibration-plan.mjs';

test('builds the requested 17-cell model and effort calibration plan per drawing', () => {
  const plan = buildDrawingCalibrationPlan({ tiers: ['intermediate'] });

  assert.deepEqual(CALIBRATION_EFFORTS, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(plan.cells.length, 17);
  assert.deepEqual(
    plan.cells.filter((cell) => cell.modelId === 'gpt').map((cell) => cell.effort),
    ['low', 'medium', 'high', 'xhigh'],
  );
  assert.deepEqual(
    plan.cells.filter((cell) => cell.modelId === 'luna').map((cell) => cell.effort),
    ['high', 'xhigh', 'max'],
  );
  assert.equal(plan.cells.filter((cell) => cell.modelId === 'terra').length, 5);
  assert.equal(plan.cells.filter((cell) => cell.modelId === 'sol').length, 5);
});

test('records unsupported requested cells instead of silently substituting an effort', () => {
  const plan = buildDrawingCalibrationPlan({
    models: ['gpt', 'luna'],
    efforts: ['low', 'max'],
    tiers: ['beginner'],
  });

  assert.deepEqual(plan.cells.map((cell) => `${cell.modelId}:${cell.effort}`), ['gpt:low', 'luna:max']);
  assert.deepEqual(plan.skipped.map((cell) => `${cell.modelId}:${cell.effort}:${cell.reason}`), [
    'gpt:max:MODEL_EFFORT_UNSUPPORTED',
    'luna:low:MODEL_EFFORT_POLICY_EXCLUDED',
  ]);
  assert.equal(CALIBRATION_MODELS.gpt.model, 'gpt-5.5');
  assert.equal(CALIBRATION_MODELS.luna.model, 'gpt-5.6-luna');
});

test('uses ten minutes as a boundary without ranking faster successful cells higher', () => {
  assert.equal(CALIBRATION_DURATION_LIMIT_MS, 600_000);
  assert.equal(isCalibrationDurationWithinLimit(599_999), true);
  assert.equal(isCalibrationDurationWithinLimit(600_000), true);
  assert.equal(isCalibrationDurationWithinLimit(600_001), false);
  assert.equal(isCalibrationDurationWithinLimit(Number.NaN), false);
});

test('keeps array defaults as effort values rather than array indexes', () => {
  assert.deepEqual(selectCalibrationValues(undefined, CALIBRATION_EFFORTS), CALIBRATION_EFFORTS);
  assert.deepEqual(selectCalibrationValues('high,max', CALIBRATION_EFFORTS), ['high', 'max']);
  assert.throws(
    () => selectCalibrationValues('ultra', CALIBRATION_EFFORTS),
    /UNKNOWN_CALIBRATION_VALUE:ultra/,
  );
});

test('rejects a high surface score when required review roles are missing', () => {
  assert.deepEqual(calibrationQualityGate({
    configurationMatched: true,
    durationWithinLimit: true,
    finalStatus: 'PARTIAL',
    verdict: 'FAIL',
    reasoning: {
      stages: [{
        id: 'coverage-and-roles',
        evidence: { failedRoleCalls: 7, missingRoles: ['symbols', 'connections', 'coverage-auditor'] },
      }],
    },
  }), {
    eligible: false,
    reasons: [
      'DOCUMENT_NOT_COMPLETE',
      'QUALITY_FAIL',
      'REQUIRED_ROLES_MISSING',
      'COVERAGE_AUDIT_UNRESOLVED',
    ],
    failedRoleCalls: 7,
    missingRoles: ['symbols', 'connections', 'coverage-auditor'],
    missingCoreRoles: ['symbols', 'connections'],
    auditUnresolved: true,
    auditReceiptMissing: false,
  });
});

test('역할별 프로필은 알 수 없는 역할·단계를 거부한다', () => {
  assert.equal(parseCalibrationEffortProfile(undefined), undefined);
  assert.equal(parseCalibrationEffortProfile(''), undefined);
  assert.equal(parseCalibrationEffortProfile('{}'), undefined);
  assert.deepEqual(parseCalibrationEffortProfile('{"symbols":"low"}'), { symbols: 'low' });
  assert.throws(() => parseCalibrationEffortProfile('{"symbol":"low"}'), /UNKNOWN_CALIBRATION_PROFILE_ROLE:symbol/);
  assert.throws(() => parseCalibrationEffortProfile('{"symbols":"ultra"}'), /UNKNOWN_CALIBRATION_PROFILE_EFFORT:symbols/);
  assert.throws(() => parseCalibrationEffortProfile('nope'), /INVALID_CALIBRATION_PROFILE_JSON/);
  assert.throws(() => parseCalibrationEffortProfile('[]'), /INVALID_CALIBRATION_PROFILE/);
});

test('프로필 라벨은 역할 순서와 무관하고 서로 다른 프로필을 구분한다', () => {
  // 라벨이 같으면 A/B 두 실행이 같은 영수증 파일을 덮어쓴다.
  assert.equal(
    calibrationProfileLabel({ text: 'low', symbols: 'low' }),
    calibrationProfileLabel({ symbols: 'low', text: 'low' }),
  );
  assert.notEqual(calibrationProfileLabel({ symbols: 'low' }), calibrationProfileLabel({ symbols: 'medium' }));
  assert.equal(calibrationProfileLabel(undefined), 'uniform');
});

test('감사기만 빠졌을 때 판독 역할 손실로 세지 않는다', () => {
  // coverage-auditor 는 파생 판정이라 다른 역할·재검사·그래프 충돌이 하나만
  // 남아도 rolesPresent 에서 빠진다. 이를 기호·연결 손실과 같은 칸에 세면
  // 모델 판독력 문제로 오진하게 된다. 후보 자격은 그대로 박탈한다.
  const gate = calibrationQualityGate({
    configurationMatched: true,
    durationWithinLimit: true,
    finalStatus: 'PARTIAL',
    verdict: 'HOLD',
    reasoning: {
      stages: [{
        id: 'coverage-and-roles',
        evidence: {
          failedRoleCalls: 0,
          missingRoles: ['coverage-auditor'],
          missingCoreRoles: [],
          auditReceiptMissing: false,
        },
      }],
    },
  });
  assert.equal(gate.eligible, false);
  assert.deepEqual(gate.missingCoreRoles, []);
  assert.ok(!gate.reasons.includes('REQUIRED_ROLES_MISSING'));
  assert.ok(gate.reasons.includes('COVERAGE_AUDIT_UNRESOLVED'));
});

test('감사기 무응답은 미해결 잔존과 다른 사유로 기록한다', () => {
  const gate = calibrationQualityGate({
    configurationMatched: true,
    durationWithinLimit: true,
    finalStatus: 'PARTIAL',
    verdict: 'FAIL',
    reasoning: {
      stages: [{
        id: 'coverage-and-roles',
        evidence: {
          failedRoleCalls: 1,
          missingRoles: ['coverage-auditor'],
          missingCoreRoles: [],
          auditReceiptMissing: true,
        },
      }],
    },
  });
  assert.ok(gate.reasons.includes('COVERAGE_AUDIT_NO_RECEIPT'));
  assert.ok(!gate.reasons.includes('COVERAGE_AUDIT_UNRESOLVED'));
  assert.equal(gate.auditReceiptMissing, true);
});

test('missingCoreRoles 가 없는 옛 영수증도 감사기를 분리한다', () => {
  // 이전 실행이 남긴 영수증에는 missingCoreRoles 가 없다. 그 경우에도
  // 판독 역할 손실과 감사 미해결을 합치지 않는다.
  const gate = calibrationQualityGate({
    configurationMatched: true,
    durationWithinLimit: true,
    finalStatus: 'PARTIAL',
    verdict: 'HOLD',
    reasoning: {
      stages: [{
        id: 'coverage-and-roles',
        evidence: { failedRoleCalls: 0, missingRoles: ['coverage-auditor'] },
      }],
    },
  });
  assert.deepEqual(gate.missingCoreRoles, []);
  assert.ok(!gate.reasons.includes('REQUIRED_ROLES_MISSING'));
  assert.ok(gate.reasons.includes('COVERAGE_AUDIT_UNRESOLVED'));
});

test('accepts only a complete, within-limit, configuration-matched quality pass', () => {
  assert.deepEqual(calibrationQualityGate({
    configurationMatched: true,
    durationWithinLimit: true,
    finalStatus: 'COMPLETE',
    verdict: 'PASS',
    reasoning: {
      stages: [{ id: 'coverage-and-roles', evidence: { failedRoleCalls: 0, missingRoles: [] } }],
    },
  }), {
    eligible: true,
    reasons: [],
    failedRoleCalls: 0,
    missingRoles: [],
    missingCoreRoles: [],
    auditUnresolved: false,
    auditReceiptMissing: false,
  });
});
