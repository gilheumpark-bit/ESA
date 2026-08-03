function finiteCount(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function exactScore(actual, expected) {
  if (expected === 0) return actual === 0 ? 1 : 0;
  return Math.max(0, 1 - Math.abs(actual - expected) / Math.max(actual, expected, 1));
}

function minimumScore(actual, expectedMinimum) {
  if (expectedMinimum <= 0) return 1;
  return Math.min(1, actual / expectedMinimum);
}

export function scoreDrawingLabelEvidence(evidence = {}, expected = {}) {
  const actualTypes = evidence.actualSymbolTypes ?? {};
  const symbolChecks = [];

  for (const [type, expectedCount] of Object.entries(expected.symbolTypes ?? {})) {
    const actual = finiteCount(actualTypes[type]);
    const target = finiteCount(expectedCount);
    symbolChecks.push({
      type,
      mode: 'exact',
      expected: target,
      actual,
      score: exactScore(actual, target),
    });
  }
  for (const [type, expectedMinimum] of Object.entries(expected.minimumSymbolTypes ?? {})) {
    const actual = finiteCount(actualTypes[type]);
    const target = finiteCount(expectedMinimum);
    symbolChecks.push({
      type,
      mode: 'minimum',
      expected: target,
      actual,
      score: minimumScore(actual, target),
    });
  }

  const symbolScore = symbolChecks.length > 0
    ? symbolChecks.reduce((sum, item) => sum + item.score, 0) / symbolChecks.length
    : null;
  const expectedRelations = Number.isSafeInteger(expected.minRelations)
    ? expected.minRelations
    : null;
  const actualRelations = finiteCount(evidence.relations);
  const relationScore = expectedRelations === null
    ? null
    : minimumScore(actualRelations, expectedRelations);

  let combined = 0;
  if (symbolScore !== null && relationScore !== null) combined = symbolScore * 0.7 + relationScore * 0.3;
  else if (symbolScore !== null) combined = symbolScore;
  else if (relationScore !== null) combined = relationScore;

  return {
    labelAccuracyPct: Math.round(combined * 100),
    symbolAccuracyPct: symbolScore === null ? null : Math.round(symbolScore * 100),
    relationCoveragePct: relationScore === null ? null : Math.round(relationScore * 100),
    actualRelations,
    expectedMinimumRelations: expectedRelations,
    symbolChecks,
  };
}
