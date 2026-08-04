import assert from 'node:assert/strict';
import test from 'node:test';

import { foldRunSpread, formatSpread, symbolTypeSpread } from './drawing-run-spread.mjs';

function run(labelAccuracyPct, overrides = {}) {
  return {
    status: 'COMPLETE',
    verdict: 'FAIL',
    durationMs: 130_000,
    vlmCalls: 34,
    scores: { labelAccuracyPct, relationCoveragePct: 100, symbolChecks: [] },
    ...overrides,
  };
}

test('대표값은 평균이 아니라 최저점이다', () => {
  // 평균을 쓰면 무너진 회차가 지워진다. 그 산출물로는 검토서를 못 쓴다.
  const folded = foldRunSpread([run(73), run(75), run(70)]);
  assert.equal(folded.accuracy.worst, 70);
  assert.equal(folded.accuracy.best, 75);
  assert.equal(folded.accuracy.spread, 5);
  assert.equal(folded.accuracy.median, 73);
  assert.deepEqual(folded.accuracy.values, [73, 75, 70]);
});

test('대표 회차는 최저 종합 회차이며 동점이면 먼저 실행한 쪽이다', () => {
  assert.equal(foldRunSpread([run(73), run(75), run(70)]).representativeIndex, 3);
  assert.equal(foldRunSpread([run(70), run(75), run(70)]).representativeIndex, 1);
});

test('한 회차라도 못 돌면 셀 전체가 그 상태다', () => {
  // 한 번이라도 실패한 설정을 안정적이라고 말할 수 없다.
  const folded = foldRunSpread([run(75), run(0, { status: 'ERROR', error: 'boom' }), run(73)]);
  assert.equal(folded.status, 'ERROR');
});

test('한 회차라도 PASS 가 아니면 셀은 PASS 가 아니다', () => {
  assert.equal(foldRunSpread([run(90, { verdict: 'PASS' }), run(88, { verdict: 'PASS' })]).verdict, 'PASS');
  assert.equal(foldRunSpread([run(90, { verdict: 'PASS' }), run(70, { verdict: 'FAIL' })]).verdict, 'FAIL');
  assert.equal(foldRunSpread([run(90, { verdict: 'PASS' }), run(80, { verdict: 'HOLD' })]).verdict, 'HOLD');
});

test('기호 타입별로 어느 축이 흔들리는지 남긴다', () => {
  const runs = [
    run(73, { scores: { labelAccuracyPct: 73, relationCoveragePct: 100, symbolChecks: [
      { type: 'fuse', expected: 15, actual: 14 },
      { type: 'switch', expected: 1, actual: 8 },
    ] } }),
    run(75, { scores: { labelAccuracyPct: 75, relationCoveragePct: 100, symbolChecks: [
      { type: 'fuse', expected: 15, actual: 11 },
      { type: 'switch', expected: 1, actual: 2 },
    ] } }),
    run(70, { scores: { labelAccuracyPct: 70, relationCoveragePct: 100, symbolChecks: [
      { type: 'fuse', expected: 15, actual: 5 },
      { type: 'switch', expected: 1, actual: 2 },
    ] } }),
  ];
  const spread = symbolTypeSpread(runs);
  assert.deepEqual(spread.fuse, {
    expected: 15, worst: 5, best: 14, median: 11, spread: 9, values: [14, 11, 5],
  });
  assert.equal(spread.switch.spread, 6);
});

test('1회 실행은 종전과 같은 단일 수치로 적는다', () => {
  const folded = foldRunSpread([run(78)]);
  assert.equal(folded.runCount, 1);
  assert.equal(formatSpread(folded.accuracy, '%'), '78%');
});

test('2회 이상은 최저~최고로 적어 단발로 오독되지 않게 한다', () => {
  const folded = foldRunSpread([run(73), run(75), run(70)]);
  assert.equal(formatSpread(folded.accuracy, '%'), '70~75%');
  assert.equal(formatSpread(null), '-');
});

test('빈 회차 묶음은 조용히 통과시키지 않는다', () => {
  assert.throws(() => foldRunSpread([]), /EMPTY_RUN_SET/);
});
