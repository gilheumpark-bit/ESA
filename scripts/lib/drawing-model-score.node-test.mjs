import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreDrawingLabelEvidence } from './drawing-model-score.mjs';

/**
 * 2026-08-07: 이 파일의 첫 시험은 원래 "70/30 으로 합산한다" 를 계약으로
 * 못박고 있었다. 그런데 그 시험은 관계 9 vs 하한 12 처럼 **하한 미달**만
 * 넣어 봤다. 하한을 넘긴 경우를 한 번도 넣지 않았으므로 `min(1, …)` 이
 * 무료 100% 를 준다는 사실이 드러날 수 없었다. 시험이 결함을 계약으로
 * 굳히고 있었던 자리다 — 아래 첫 두 시험이 그 구멍을 메운다.
 */

test('하한을 크게 넘긴 관계는 종합 점수를 만들어 내지 않는다', () => {
  // 실측(고급 PDF): 변압기 정답 4 에 8, 관계 하한 12 에 463.
  // 옛 판은 50*0.7 + 100*0.3 = 65% 를 줬다. 과다 계수가 점수를 올린 것이다.
  const scored = scoreDrawingLabelEvidence({
    actualSymbolTypes: { transformer: 8 },
    relations: 463,
  }, {
    symbolTypes: { transformer: 4 },
    minRelations: 12,
  });

  assert.equal(scored.symbolAccuracyPct, 50);
  assert.equal(scored.labelAccuracyPct, 50);
  // 하한은 채웠다. 다만 38.58배라는 사실이 100% 뒤에 숨지 않는다.
  assert.equal(scored.floorGatesMet, true);
  assert.equal(scored.relationFloorRatio, 38.58);
});

test('최소 수량 관문은 기호 정확도를 올리지 않는다', () => {
  // 실측(고급 PDF): 차단기 하한 9 에 78. 옛 판은 (50+100)/2 = 75% 였다.
  const scored = scoreDrawingLabelEvidence({
    actualSymbolTypes: { transformer: 8, breaker: 78 },
    relations: 12,
  }, {
    symbolTypes: { transformer: 4 },
    minimumSymbolTypes: { breaker: 9 },
    minRelations: 12,
  });

  assert.equal(scored.symbolAccuracyPct, 50);
  assert.equal(scored.floorGatesMet, true);
  assert.equal(scored.floorGates.find((gate) => gate.name === 'breaker')?.ratio, 8.67);
  // 타입별 폭 표에는 남되 점수 대상은 아니다.
  const breaker = scored.symbolChecks.find((item) => item.type === 'breaker');
  assert.equal(breaker.mode, 'minimum');
  assert.equal(breaker.scored, false);
  assert.equal(breaker.score, null);
});

test('하한 미달은 감점이 아니라 관문 실패로 드러난다', () => {
  // 실측(초급): 기호는 전부 맞았는데 관계 11 로 하한 13 에 미달했다.
  // 옛 판은 이것을 96% 라는 한 숫자에 섞어 미달을 지웠다.
  const scored = scoreDrawingLabelEvidence({
    actualSymbolTypes: { transformer: 1, generator: 1, breaker: 6, reactor: 1 },
    relations: 11,
  }, {
    symbolTypes: { transformer: 1, generator: 1, breaker: 6, reactor: 1 },
    minRelations: 13,
  });

  assert.equal(scored.symbolAccuracyPct, 100);
  assert.equal(scored.floorGatesMet, false);
  assert.equal(scored.floorGates.find((gate) => gate.name === 'relations')?.met, false);
  assert.equal(scored.relationCoveragePct, 85);
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

test('정확 수량 축이 하나도 없으면 점수를 지어내지 않는다', () => {
  // 하한만 있는 정답표는 정확도를 말할 근거가 없다. null 이지 100 이 아니다.
  const scored = scoreDrawingLabelEvidence({
    actualSymbolTypes: { breaker: 78 },
    relations: 463,
  }, {
    minimumSymbolTypes: { breaker: 9 },
    minRelations: 12,
  });

  assert.equal(scored.labelAccuracyPct, null);
  assert.equal(scored.symbolAccuracyPct, null);
  assert.equal(scored.floorGatesMet, true);
});
