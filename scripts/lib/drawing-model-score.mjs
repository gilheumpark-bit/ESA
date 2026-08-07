/**
 * 도면 판독 채점기.
 *
 * 2026-08-07 정정 — 이전 판은 "정확 수량 70% + 관계 회수율 30%" 로 합산했는데
 * 관계축이 `min(1, 실측/하한)` 이었다. 하한은 사람이 공개 그림을 직접 센
 * **회귀 하한**이지 정답이 아니다. 실측이 그것을 넘기만 하면 언제나 100% 다.
 *
 *   고급 PDF  관계 463 vs 하한 12 → 100%   (38.6배)
 *   중급      관계  24 vs 하한 15 → 100%
 *   고급 PDF  차단기 78 vs 하한 9 → 100%   (8.7배)
 *
 * 즉 **종합의 30% 는 무료였고, 과다 계수는 오히려 점수를 올렸다.** 이 저장소가
 * 17~27차에 걸쳐 잡아 온 결함이 바로 과다 계수인데 자가 그것에 상을 주고 있었다.
 * 24차(계수 등록기)·26차(타입 구분자)와 같은 자리의 결함이다 — 코드보다 자가
 * 먼저 틀려 있었다.
 *
 * 그래서 하한은 점수가 아니라 **관문**으로 분리한다.
 *
 * - 종합 점수는 정답 수량을 아는 축(`symbolTypes`, exact)만으로 매긴다.
 * - 하한(`minimumSymbolTypes`, `minRelations`)은 충족 여부와 초과 배율만 낸다.
 *   정답의 상한을 모르므로 초과를 감점하지 않는다. 다만 100% 로 뭉개지도 않는다.
 */

function finiteCount(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function exactScore(actual, expected) {
  if (expected === 0) return actual === 0 ? 1 : 0;
  return Math.max(0, 1 - Math.abs(actual - expected) / Math.max(actual, expected, 1));
}

/**
 * 하한 관문. 점수가 아니라 충족 여부와 하한 대비 배율을 낸다.
 * 배율을 남기는 이유는 "하한 12 에 463" 같은 값이 100% 뒤에 숨지 않게 하려는 것이다.
 */
function floorGate(name, actual, floor) {
  return {
    name,
    actual,
    floor,
    met: floor <= 0 ? true : actual >= floor,
    ratio: floor > 0 ? Number((actual / floor).toFixed(2)) : null,
  };
}

export function scoreDrawingLabelEvidence(evidence = {}, expected = {}) {
  const actualTypes = evidence.actualSymbolTypes ?? {};
  const symbolChecks = [];
  const floorGates = [];

  for (const [type, expectedCount] of Object.entries(expected.symbolTypes ?? {})) {
    const actual = finiteCount(actualTypes[type]);
    const target = finiteCount(expectedCount);
    symbolChecks.push({
      type,
      mode: 'exact',
      expected: target,
      actual,
      score: exactScore(actual, target),
      scored: true,
    });
  }

  for (const [type, expectedMinimum] of Object.entries(expected.minimumSymbolTypes ?? {})) {
    const actual = finiteCount(actualTypes[type]);
    const target = finiteCount(expectedMinimum);
    const gate = floorGate(type, actual, target);
    floorGates.push(gate);
    // 타입별 폭 표(symbolTypeSpread)에는 남기되 점수에는 넣지 않는다.
    symbolChecks.push({
      type,
      mode: 'minimum',
      expected: target,
      actual,
      score: null,
      scored: false,
      met: gate.met,
      ratio: gate.ratio,
    });
  }

  const scoredChecks = symbolChecks.filter((item) => item.scored);
  const symbolScore = scoredChecks.length > 0
    ? scoredChecks.reduce((sum, item) => sum + item.score, 0) / scoredChecks.length
    : null;

  const expectedRelations = Number.isSafeInteger(expected.minRelations)
    ? expected.minRelations
    : null;
  const actualRelations = finiteCount(evidence.relations);
  const relationGate = expectedRelations === null
    ? null
    : floorGate('relations', actualRelations, expectedRelations);
  if (relationGate) floorGates.push(relationGate);

  const accuracyPct = symbolScore === null ? null : Math.round(symbolScore * 100);

  return {
    // 정답 수량을 아는 축만 들어간다. 지금은 그 축이 기호 정확도뿐이라
    // labelAccuracyPct 와 symbolAccuracyPct 가 같은 값이다 — 합칠 다른 축이
    // 생기기 전까지는 이것이 정직한 상태다.
    labelAccuracyPct: accuracyPct,
    symbolAccuracyPct: accuracyPct,
    // 하한 충족률. 점수가 아니라 관문이므로 종합에 합산하지 않는다.
    relationCoveragePct: relationGate === null
      ? null
      : Math.round((expectedRelations <= 0 ? 1 : Math.min(1, actualRelations / expectedRelations)) * 100),
    relationFloorRatio: relationGate?.ratio ?? null,
    actualRelations,
    expectedMinimumRelations: expectedRelations,
    floorGates,
    floorGatesMet: floorGates.every((gate) => gate.met),
    symbolChecks,
  };
}
