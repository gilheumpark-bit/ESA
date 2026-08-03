import test from 'node:test';
import assert from 'node:assert/strict';

import { comparisonStatusForReceipts } from './drawing-model-comparison.mjs';

test('서로 다른 워크스페이스 스냅샷의 모델 결과는 직접 비교 불가로 봉인한다', () => {
  assert.deepEqual(comparisonStatusForReceipts([
    { workspaceSnapshot: { changeHash: 'snapshot-a' } },
    { workspaceSnapshot: { changeHash: 'snapshot-b' } },
    { workspaceSnapshot: { changeHash: 'snapshot-a' } },
  ]), {
    valid: false,
    reason: 'MIXED_WORKSPACE_SNAPSHOTS',
    snapshotHashes: ['snapshot-a', 'snapshot-b'],
  });
});

test('동일 스냅샷 결과만 있으면 모델 비교가 유효하다', () => {
  assert.deepEqual(comparisonStatusForReceipts([
    { workspaceSnapshot: { changeHash: 'snapshot-a' } },
    { workspaceSnapshot: { changeHash: 'snapshot-a' } },
  ]), {
    valid: true,
    reason: null,
    snapshotHashes: ['snapshot-a'],
  });
});
