import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assemblyMetrics,
  boundsAdjacent,
  foldAssemblyMetrics,
  sameNameplate,
} from './drawing-assembly-metrics.mjs';

const sym = (id, type, label, bounds, certainty = 'confirmed') => ({
  id,
  displayId: id,
  confirmedType: certainty === 'confirmed' ? type : undefined,
  typeCandidates: [type],
  rawLabel: label,
  certainty,
  evidence: [{ evidenceId: `${id}-e`, pageIndex: 0, bounds, confidence: 1 }],
});

test('같은 명판은 접두 관계를 허용하되 숫자를 가르지 않는다', () => {
  assert.equal(sameNameplate('MOLD TR-3', 'MOLD TR-3 6.6KV/380.220V 3 1000KVA'), true);
  assert.equal(sameNameplate('DOWN TR', 'DOWN TR 380/110V 3 10KVA'), true);
  assert.equal(sameNameplate('FU5', 'FU5'), true);
  // "TR-1" 은 "TR-10" 의 접두이지만 다른 기기다.
  assert.equal(sameNameplate('TR-1', 'TR-10'), false);
  assert.equal(sameNameplate('FU3', 'FU4'), false);
  // 홑 숫자는 기기명이 아니라 단자 번호다.
  assert.equal(sameNameplate('1', '1'), false);
  assert.equal(sameNameplate(undefined, 'FU5'), false);
});

test('근접은 서로의 짧은 변을 기준으로 판단한다', () => {
  const a = { x: 100, y: 100, w: 30, h: 80 };
  // 20px 떨어짐 — 짧은 변 30 이내라 근접.
  assert.equal(boundsAdjacent(a, { x: 150, y: 100, w: 30, h: 80 }), true);
  // 도면 반대편 — 근접 아님.
  assert.equal(boundsAdjacent(a, { x: 900, y: 100, w: 30, h: 80 }), false);
});

test('조각은 같은 종류의 중앙 크기 대비로 센다 — 절대 크기가 아니다', () => {
  // 큰 기기와 작은 기기가 섞인 도면에서 절대 크기로 자르면 작은 종류가 통째로
  // 조각으로 잡힌다. 종류별 중앙값 기준이라야 한다.
  const metrics = assemblyMetrics({
    symbols: [
      sym('t1', 'transformer', 'TR-1', { x: 0, y: 0, w: 60, h: 60 }),
      sym('t2', 'transformer', 'TR-2', { x: 200, y: 0, w: 60, h: 60 }),
      sym('t3', 'transformer', 'TR-3', { x: 400, y: 0, w: 60, h: 60 }),
      // 변압기 중앙 3600 의 40% 미만 — 조각.
      sym('t4', 'transformer', 'TR-4', { x: 600, y: 0, w: 20, h: 20 }),
      // 단자는 작지만 같은 종류끼리는 정상 크기 — 조각이 아니다.
      sym('m1', 'terminal', 'X1', { x: 0, y: 300, w: 10, h: 10 }),
      sym('m2', 'terminal', 'X2', { x: 40, y: 300, w: 10, h: 10 }),
    ],
    relations: [],
  });
  assert.equal(metrics.slivers, 1);
  assert.equal(metrics.confirmed, 6);
});

test('미병합쌍은 겹침과 인접으로 나눠 센다', () => {
  const metrics = assemblyMetrics({
    symbols: [
      // 겹침: 같은 명판이 23% 겹쳐 남아 있다.
      sym('a', 'transformer', 'MOLD TR-3', { x: 1439, y: 502, w: 67, h: 64 }),
      sym('b', 'transformer', 'MOLD TR-3 6.6KV', { x: 1491, y: 502, w: 62, h: 44 }),
      // 인접: 겹치지 않지만 짧은 변 안쪽이다.
      sym('c', 'transformer', 'DOWN TR 380/110V', { x: 100, y: 800, w: 48, h: 34 }),
      sym('d', 'transformer', 'DOWN TR', { x: 152, y: 801, w: 25, h: 28 }),
    ],
    relations: [],
  });
  assert.equal(metrics.unmergedOverlapping, 1);
  assert.equal(metrics.unmergedAdjacent, 1);
  assert.equal(metrics.unmergedPairs, 2);
});

test('다른 종류나 먼 거리의 동명 기기는 미병합쌍이 아니다', () => {
  const metrics = assemblyMetrics({
    symbols: [
      sym('a', 'transformer', 'MOLD TR-1', { x: 100, y: 500, w: 60, h: 60 }),
      // 도면 반대편의 같은 이름 — 두 반에 하나씩 있는 정상 배치다.
      sym('b', 'transformer', 'MOLD TR-1', { x: 1500, y: 500, w: 60, h: 60 }),
      // 이름은 같지만 종류가 다르면 같은 기기가 아니다.
      sym('c', 'fuse', 'MOLD TR-1', { x: 130, y: 500, w: 60, h: 60 }),
    ],
    relations: [],
  });
  assert.equal(metrics.unmergedPairs, 0);
});

test('비율은 확정 수로 나눈다 — 모델이 몇 개를 읽었든 비교되게', () => {
  const few = assemblyMetrics({
    symbols: [
      sym('a', 'fuse', 'FU1', { x: 0, y: 0, w: 30, h: 80 }),
      sym('b', 'fuse', 'FU1 250A', { x: 40, y: 0, w: 30, h: 80 }),
    ],
    relations: [],
  });
  assert.equal(few.confirmed, 2);
  assert.equal(few.unmergedPairs, 1);
  assert.equal(few.unmergedPairRatio, 0.5);

  const none = assemblyMetrics({ symbols: [], relations: [] });
  assert.equal(none.unmergedPairRatio, 0);
  assert.equal(none.sliverRatio, 0);
  assert.equal(none.ambiguousRatio, 0);
});

test('갇힌표기와 지정문자는 발화 확인용 절대값이다', () => {
  const metrics = assemblyMetrics(
    { symbols: [sym('a', 'fuse', 'FU5', { x: 0, y: 0, w: 30, h: 80 })], relations: [] },
    [
      { id: 'contained-marking-sym-1', code: 'UNREADABLE_SYMBOL' },
      { id: 'line-unbound-2', code: 'LINE_CONTINUITY_UNCERTAIN' },
    ],
  );
  assert.equal(metrics.containedMarkings, 1);
  assert.equal(metrics.designatorLabels, 1);
});

test('여러 실행은 최악·최선·폭으로 접는다 — 평균이 아니다', () => {
  const folded = foldAssemblyMetrics([
    { confirmed: 100, sliverRatio: 0.04 },
    { confirmed: 90, sliverRatio: 0.15 },
    { confirmed: 95, sliverRatio: 0.11 },
  ]);
  assert.equal(folded.runCount, 3);
  // 조각비는 높을수록 나쁘므로 최악이 최대값이다.
  assert.equal(folded.sliverRatio.worst, 0.15);
  assert.equal(folded.sliverRatio.best, 0.04);
  assert.equal(folded.confirmed.spread, 10);
  assert.deepEqual(folded.sliverRatio.values, [0.04, 0.15, 0.11]);
});
