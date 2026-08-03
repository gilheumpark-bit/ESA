import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreDrawingLabelEvidence } from './drawing-model-score.mjs';

test('정확 수량·최소 수량·관계 회수율을 분리하고 70/30으로 합산한다', () => {
  const scored = scoreDrawingLabelEvidence({
    actualSymbolTypes: { transformer: 3, generator: 0, breaker: 12 },
    relations: 9,
  }, {
    symbolTypes: { transformer: 3, generator: 0 },
    minimumSymbolTypes: { breaker: 9 },
    minRelations: 12,
  });

  assert.equal(scored.symbolAccuracyPct, 100);
  assert.equal(scored.relationCoveragePct, 75);
  assert.equal(scored.labelAccuracyPct, 93);
  assert.equal(scored.symbolChecks.find((item) => item.type === 'breaker')?.mode, 'minimum');
});

test('정답이 0인 환각 축은 하나라도 검출되면 0점이다', () => {
  const scored = scoreDrawingLabelEvidence({
    actualSymbolTypes: { generator: 1 },
    relations: 0,
  }, {
    symbolTypes: { generator: 0 },
  });

  assert.equal(scored.symbolAccuracyPct, 0);
  assert.equal(scored.labelAccuracyPct, 0);
});
