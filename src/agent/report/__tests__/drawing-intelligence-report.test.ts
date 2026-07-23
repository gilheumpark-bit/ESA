import type { DrawingSynthesis } from '../../electrical/synthesis';
import type { DrawingReviewArtifact } from '../../teams/types';
import { buildDrawingIntelligenceReport } from '../drawing-intelligence-report';

const HASH = 'drawing-hash';
const bounds = { x: 1, y: 2, w: 30, h: 40, page: 1 };

function artifact(): DrawingReviewArtifact {
  return {
    snapshot: {
      drawingHash: HASH, mimeType: 'image/png', page: 1, width: 100, height: 80,
      quality: { width: 100, height: 80, channels: 4, contrast: 1, edgeDensity: 1, gradientVariance: 1, lowContrast: false, blurry: false, recommendedScale: 1, warnings: [] },
    },
    envelopes: [{
      role: 'logic', drawingHash: HASH, provider: 'openai', model: 'test', promptVersion: 'v1', outputHash: 'output', durationMs: 1,
      data: { warnings: [], confidence: 1, logic: [{ id: 'LOGIC-1', sourceId: 'source:logic-1', topic: 'DIRECTION', subjectIds: ['TR-1'], statement: 'TR-1 feeds load', evidenceBounds: [bounds], confidence: 1 }] },
    }],
    graph: {
      drawingHash: HASH,
      symbols: [{ id: 'TR-1', sourceId: 'source:tr-1', originalEvidenceId: 'original:tr-1', originalEvidenceIds: ['original:tr-1'], sourceIds: ['source:tr-1'], typeCandidates: ['TR'], rawLabel: 'TR-1', bounds, ports: [], confidence: 1 }],
      lines: [{ id: 'LINE-1', sourceId: 'source:line-1', originalEvidenceId: 'original:line-1', originalEvidenceIds: ['original:line-1'], sourceIds: ['source:line-1'], pages: [1], lineKind: 'power', path: [{ x: 0, y: 0 }, { x: 10, y: 0 }], start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, junctions: [], crossovers: [], confidence: 1 }],
      texts: [{ id: 'TEXT-1', sourceId: 'source:text-1', originalEvidenceId: 'original:text-1', originalEvidenceIds: ['original:text-1'], sourceIds: ['source:text-1'], raw: '380V', candidates: ['380V'], bounds, confidence: 1 }],
      junctions: [], crossovers: [], edges: [{ id: 'EDGE-1', from: 'TR-1', to: 'TR-1', lineId: 'LINE-1', confidence: 1 }], textLinks: [], conflicts: [],
    },
    failures: [],
    coverage: { roles: {
      symbols: { variantId: 'original', expectedRegionCount: 1, actualRegionCount: 1, plannedCalls: 1 },
      connections: { variantId: 'original', expectedRegionCount: 1, actualRegionCount: 1, plannedCalls: 1 },
      text: { variantId: 'original', expectedRegionCount: 1, actualRegionCount: 1, plannedCalls: 1 },
      logic: { variantId: 'original', expectedRegionCount: 1, actualRegionCount: 1, plannedCalls: 1 },
      'coverage-auditor': { variantId: 'original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
    }, plannedCalls: 5, complete: true, maxRegionCallsPerRole: 1 },
  };
}

function synthesis(): DrawingSynthesis {
  return {
    drawingHash: HASH,
    requiredRoles: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'], completedRoles: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'], missingRoles: [],
    reviewIntegrity: { coverageComplete: true, roleFailures: [] },
    stages: { normalizer: 'COMPLETE', invariants: 'COMPLETE', calculator: 'COMPLETE', logicResolver: 'COMPLETE', synthesis: 'COMPLETE' },
    evidenceRegistry: [
      { id: 'TR-1', drawingHash: HASH, kind: 'source', originalEvidenceIds: ['original:tr-1'], sourceIds: ['source:tr-1'], pages: [1], parentEvidenceIds: [] },
      { id: 'LINE-1', drawingHash: HASH, kind: 'source', originalEvidenceIds: ['original:line-1'], sourceIds: ['source:line-1'], pages: [1], parentEvidenceIds: [] },
      { id: 'TEXT-1', drawingHash: HASH, kind: 'source', originalEvidenceIds: ['original:text-1'], sourceIds: ['source:text-1'], pages: [1], parentEvidenceIds: [] },
      { id: 'LOGIC-1', drawingHash: HASH, kind: 'source', originalEvidenceIds: ['LOGIC-1'], sourceIds: ['source:logic-1'], pages: [1], parentEvidenceIds: [] },
    ],
    calculations: [{ id: 'calc-1', calculatorId: 'transformer-capacity', scopeKey: 'TR-1@1', status: 'CALCULATED', judgment: 'HOLD', missingInputs: [], ambiguousInputs: [], inputEvidence: [{ adapterField: 'voltage', normalizedField: 'voltage_V', value: 380, sourceUnit: 'V', targetUnit: 'V', evidenceId: 'TEXT-1', originalEvidenceIds: ['original:text-1'], sourceIds: ['source:text-1'], bounds, confidence: 1, transform: 'identity' }], optionalDefaultsUsed: [], internalMechanics: [], scopeIssues: [] }],
    issues: [{ id: 'issue-1', code: 'INPUT_REQUIRED', judgment: 'HOLD', severity: 'minor', message: 'more evidence', evidence: { drawingHash: HASH, stableIds: ['TR-1'], originalEvidenceIds: ['original:tr-1'], sourceIds: ['source:tr-1'], pages: [1], bounds: [bounds] }, requiredInputs: ['rating'] }],
    conflicts: [{ id: 'conflict-1', kind: 'UNRESOLVED_LOGIC_REFERENCE', topic: 'DIRECTION', severity: 'major', status: 'hold', action: 'TARGETED_REVIEW', reasonCode: 'MISSING', message: 'logic hold', graphEvidenceIds: ['TR-1'], graphOriginalEvidenceIds: ['original:tr-1'], graphSourceIds: ['source:tr-1'], graphEvidencePages: [1], graphEvidenceBounds: [bounds], logicEvidenceIds: ['LOGIC-1'], logicEvidenceBounds: [bounds], graphConflictIds: [] }],
    claims: [{ id: 'claim-1', text: 'current observation', evidenceIds: ['TEXT-1'], status: 'verified', requiredInputs: [] }],
    recommendations: [{ id: 'rec-1', category: 'safety', title: 'verify rating', description: 'check current drawing', impact: 'high', evidenceIds: ['TR-1'], requiredInputs: [], status: 'SUPPORTED' }],
    graphConflicts: [], verdict: 'CONDITIONAL', requiresHumanReview: true,
  };
}

describe('drawing intelligence report v2', () => {
  it('preserves current graph provenance in immutable relations, quantities, and findings', () => {
    const report = buildDrawingIntelligenceReport({ drawingReview: artifact(), synthesis: synthesis(), verified95: false });

    expect(report).toMatchObject({
      schemaVersion: 2,
      drawingHash: HASH,
      source: { assetKey: HASH, mimeType: 'image/png', width: 100, height: 80, page: 1 },
      verified95: false,
      traceability: 1,
    });
    expect(report.relations).toEqual([expect.objectContaining({ id: 'EDGE-1', evidenceIds: expect.arrayContaining(['TR-1', 'LINE-1']) })]);
    expect(report.quantities).toEqual([expect.objectContaining({ evidenceId: 'TEXT-1', value: 380, page: 1 })]);
    expect(report.issues).toHaveLength(1);
    expect(report.conflicts).toHaveLength(1);
    expect(report.calculations).toHaveLength(1);
    expect(report.recommendations).toHaveLength(1);
    expect(report.holds).toEqual(expect.arrayContaining(['HOLD_INVARIANT', 'HOLD_LOGIC']));
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.symbols)).toBe(true);
  });

  it('fails closed to HOLD without exposing a mismatched or unresolvable category', () => {
    const bad = synthesis();
    bad.calculations = bad.calculations.map((calculation) => ({
      ...calculation,
      inputEvidence: calculation.inputEvidence.map((evidence) => ({ ...evidence, evidenceId: 'foreign-evidence' })),
    }));
    const mismatched = artifact();
    mismatched.snapshot.drawingHash = 'other-drawing';

    const report = buildDrawingIntelligenceReport({ drawingReview: mismatched, synthesis: bad, verified95: true });

    expect(report.verified95).toBe(false);
    expect(report.calculations).toEqual([]);
    expect(report.symbols).toEqual([]);
    expect(report.holds).toEqual(expect.arrayContaining(['HOLD_DRAWING_HASH_MISMATCH', 'HOLD_UNRESOLVED_CALCULATION']));
    expect(JSON.stringify(report)).not.toContain('foreign-evidence');
  });

  it('rejects swapped category and cross-record lineage instead of accepting aliases independently', () => {
    const review = artifact();
    review.graph!.edges[0] = { ...review.graph!.edges[0], from: 'TEXT-1' };
    const current = synthesis();
    current.calculations[0] = {
      ...current.calculations[0],
      inputEvidence: [{
        ...current.calculations[0].inputEvidence[0],
        originalEvidenceIds: ['original:tr-1'],
        sourceIds: ['source:tr-1'],
      }],
    };

    const report = buildDrawingIntelligenceReport({ drawingReview: review, synthesis: current, verified95: true });

    expect(report.relations).toEqual([]);
    expect(report.calculations).toEqual([]);
    expect(report.quantities).toEqual([]);
    expect(report.verified95).toBe(false);
    expect(report.holds).toEqual(expect.arrayContaining([
      'HOLD_UNRESOLVED_RELATION',
      'HOLD_UNRESOLVED_CALCULATION',
    ]));
  });

  it('rejects logic-only invariant evidence and counts the dropped finding in traceability', () => {
    const current = synthesis();
    current.issues[0] = {
      ...current.issues[0],
      evidence: {
        ...current.issues[0].evidence,
        stableIds: ['LOGIC-1'],
        originalEvidenceIds: ['LOGIC-1'],
        sourceIds: ['source:logic-1'],
      },
    };

    const report = buildDrawingIntelligenceReport({ drawingReview: artifact(), synthesis: current, verified95: true });

    expect(report.issues).toEqual([]);
    expect(report.traceability).toBeLessThan(1);
    expect(report.holds).toEqual(expect.arrayContaining([
      'HOLD_UNRESOLVED_ISSUE',
      'HOLD_UNRESOLVED_TRACEABILITY',
    ]));
    expect(report.verified95).toBe(false);
  });

  it('drops a relation when the same alias names both a symbol and a line', () => {
    const review = artifact();
    review.graph!.lines[0] = { ...review.graph!.lines[0], id: 'TR-1' };
    review.graph!.edges[0] = { ...review.graph!.edges[0], lineId: 'TR-1' };

    const report = buildDrawingIntelligenceReport({ drawingReview: review, synthesis: synthesis(), verified95: true });

    expect(report.relations).toEqual([]);
    expect(report.traceability).toBeLessThan(1);
    expect(report.holds).toEqual(expect.arrayContaining([
      'HOLD_AMBIGUOUS_PROVENANCE',
      'HOLD_UNRESOLVED_RELATION',
    ]));
  });

  it('never combines a foreign snapshot page with the synthesis drawing key', () => {
    const review = artifact();
    review.snapshot.drawingHash = 'foreign-drawing';
    review.snapshot.page = 99;

    const report = buildDrawingIntelligenceReport({ drawingReview: review, synthesis: synthesis(), verified95: true });

    expect(report.drawingHash).toBe(HASH);
    expect(report.source).toMatchObject({ assetKey: 'foreign-drawing', page: 99 });
    expect(report.source.assetKey).not.toBe(report.drawingHash);
    expect(report.holds).toContain('HOLD_DRAWING_HASH_MISMATCH');
    expect(report.verified95).toBe(false);
  });

  it('keeps ambiguous claim and recommendation aliases unresolved', () => {
    const review = artifact();
    review.graph!.texts[0].sourceIds = ['shared'];
    review.graph!.texts.push({
      ...structuredClone(review.graph!.texts[0]), id: 'TEXT-2', sourceId: 'shared',
      originalEvidenceId: 'original:text-2', originalEvidenceIds: ['original:text-2'], sourceIds: ['shared'],
    });
    const current = synthesis();
    current.claims[0].evidenceIds = ['shared'];
    current.recommendations[0].evidenceIds = ['shared'];

    const report = buildDrawingIntelligenceReport({ drawingReview: review, synthesis: current, verified95: true });

    expect(report.recommendations).toEqual([]);
    expect(report.traceability).toBeLessThan(1);
    expect(report.holds).toEqual(expect.arrayContaining([
      'HOLD_AMBIGUOUS_PROVENANCE', 'HOLD_UNRESOLVED_CLAIM', 'HOLD_UNRESOLVED_RECOMMENDATION',
    ]));
  });

  it('deeply freezes nested report values', () => {
    const report = buildDrawingIntelligenceReport({ drawingReview: artifact(), synthesis: synthesis(), verified95: false });

    expect(Object.isFrozen(report.lines[0].path[0])).toBe(true);
    expect(Object.isFrozen(report.issues[0].evidence.bounds[0])).toBe(true);
  });

});
