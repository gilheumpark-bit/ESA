import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CALIBRATION_DURATION_LIMIT_MS,
  CALIBRATION_EFFORTS,
  CALIBRATION_MODELS,
  buildDrawingCalibrationPlan,
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
    reasons: ['DOCUMENT_NOT_COMPLETE', 'QUALITY_FAIL', 'REQUIRED_ROLES_MISSING'],
    failedRoleCalls: 7,
    missingRoles: ['symbols', 'connections', 'coverage-auditor'],
  });
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
  });
});
