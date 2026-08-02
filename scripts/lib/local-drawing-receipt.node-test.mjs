import test from 'node:test';
import assert from 'node:assert/strict';

import { pipelineEvidenceFromPayload } from './local-drawing-receipt.mjs';

test('benchmark receipt preserves review, KEC proposals, calculations, and topology', () => {
  const evidence = pipelineEvidenceFromPayload({
    textQuality: { score: 0.72 },
    constraints: [{ field: 'transformer', status: 'bounded' }],
    calcChain: [{ step: 1, calculatorId: 'cable-sizing' }],
    review: {
      summary: { pass: 1, warn: 0, fail: 1, unknown: 1, info: 0 },
      findings: [
        {
          rule: 'CABLE-AMPACITY',
          severity: 'FAIL',
          proposal: [{ action: '케이블 상향', basis: 'KEC 허용전류표' }],
        },
      ],
    },
    topology: { valid: false, issues: [{ type: 'DANGLING_INLINE_DEVICE' }] },
    saga: { status: 'COMPLETED' },
  });

  assert.equal(evidence.reviewStatus, 'FAIL');
  assert.equal(evidence.proposalCount, 1);
  assert.equal(evidence.calcChain.length, 1);
  assert.equal(evidence.topology.issues.length, 1);
  assert.equal(evidence.saga.status, 'COMPLETED');
});

test('skipped or absent review is recorded as HOLD rather than success', () => {
  assert.equal(pipelineEvidenceFromPayload({ review: { skipped: true } }).reviewStatus, 'HOLD');
  assert.equal(pipelineEvidenceFromPayload({}).reviewStatus, 'HOLD');
});

test('empty, warning, unverified scan, or topology-defective reviews never become PASS', () => {
  const summary = (patch = {}) => ({ pass: 0, warn: 0, fail: 0, unknown: 0, info: 0, ...patch });
  assert.equal(pipelineEvidenceFromPayload({ review: { summary: summary() } }).reviewStatus, 'HOLD');
  assert.equal(pipelineEvidenceFromPayload({ review: { summary: summary({ warn: 1 }) } }).reviewStatus, 'HOLD');
  assert.equal(pipelineEvidenceFromPayload({
    review: { summary: summary({ pass: 1 }), extractionSource: 'VLM-scan (미검증·HOLD)' },
  }).reviewStatus, 'HOLD');
  assert.equal(pipelineEvidenceFromPayload({
    review: { summary: summary({ pass: 1 }) },
    topology: { valid: false, issues: [{ type: 'DANGLING_INLINE_DEVICE' }] },
  }).reviewStatus, 'HOLD');
  assert.equal(pipelineEvidenceFromPayload({
    review: { summary: summary({ pass: 1 }) },
    topology: { valid: true, issues: [] },
  }).reviewStatus, 'PASS');
});
