/**
 * Keep the production pipeline evidence that accuracy-only drawing scripts used
 * to discard. A recognition score and an electrical compliance finding are
 * different axes, so this helper does not merge them into one model grade.
 */
export function pipelineEvidenceFromPayload(payload = {}) {
  const review = payload?.review ?? null;
  const findings = Array.isArray(review?.findings) ? review.findings : [];
  const summary = review?.summary && typeof review.summary === 'object'
    ? review.summary
    : null;
  const proposalCount = findings.reduce(
    (count, finding) => count + (Array.isArray(finding?.proposal) ? finding.proposal.length : 0),
    0,
  );

  let reviewStatus = 'HOLD';
  if (review && !review.skipped && summary) {
    const topologyIssues = Array.isArray(payload?.topology?.issues)
      ? payload.topology.issues.length
      : 0;
    const topologyHeld = payload?.topology?.valid === false || topologyIssues > 0;
    const unverifiedSource = /HOLD|미검증/i.test(String(review.extractionSource ?? ''));
    const fail = Number(summary.fail ?? 0);
    const warn = Number(summary.warn ?? 0);
    const unknown = Number(summary.unknown ?? 0);
    const pass = Number(summary.pass ?? 0);
    reviewStatus = fail > 0
      ? 'FAIL'
      : warn > 0 || unknown > 0 || pass === 0 || topologyHeld || unverifiedSource
        ? 'HOLD'
        : 'PASS';
  }

  return {
    textQuality: payload?.textQuality ?? null,
    constraints: Array.isArray(payload?.constraints) ? payload.constraints : [],
    calcChain: Array.isArray(payload?.calcChain) ? payload.calcChain : [],
    review,
    reviewStatus,
    proposalCount,
    topology: payload?.topology ?? null,
    saga: payload?.saga ?? null,
  };
}
