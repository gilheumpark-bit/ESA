import type { DrawingCalculationReceipt } from '../drawing-calculation-router';
import type { ElectricalIssue } from '../electrical-invariants';
import type { LogicConflict } from '../logic-conflicts';
import type { NormalizedElectricalGraph, NormalizedSpec } from '../domain-normalizer';
import type { RoleReviewEnvelope } from '../../vision/review-types';
import { UnsupportedSynthesisClaimError, synthesizeDrawingReview, type DrawingSynthesisInput } from '../synthesis';

const DRAWING_HASH = 'drawing-hash';
const bounds = (page = 1) => ({ x: 10, y: 20, w: 30, h: 40, page });

function normalized(options: { conflict?: boolean; ambiguousAlias?: boolean } = {}): NormalizedElectricalGraph {
  const text = {
    id: 'TEXT-1',
    sourceId: 'source:TEXT-1',
    originalEvidenceId: 'orig:TEXT-1',
    originalEvidenceIds: ['orig:TEXT-1'],
    sourceIds: ['source:TEXT-1'],
    raw: 'FILE-BUFFER-SENTINEL 380V',
    candidates: ['380V'],
    bounds: bounds(),
    confidence: 0.9,
  };
  const extraTexts = options.ambiguousAlias
    ? [{
      ...text,
      id: 'TEXT-2',
      sourceId: 'source:TEXT-2',
      originalEvidenceId: 'orig:AMBIGUOUS',
      originalEvidenceIds: ['orig:AMBIGUOUS'],
      sourceIds: ['source:TEXT-2'],
      raw: 'different OCR observation',
    }, {
      ...text,
      id: 'TEXT-3',
      sourceId: 'source:TEXT-3',
      originalEvidenceId: 'orig:AMBIGUOUS',
      originalEvidenceIds: ['orig:AMBIGUOUS'],
      sourceIds: ['source:TEXT-3'],
      raw: 'another OCR observation',
    }]
    : [];
  const spec: NormalizedSpec = {
    drawingHash: DRAWING_HASH,
    field: 'voltage_V',
    value: 380,
    unit: 'V',
    raw: 'FILE-BUFFER-SENTINEL 380V',
    evidenceId: 'TEXT-1',
    originalEvidenceIds: ['orig:TEXT-1'],
    sourceIds: ['source:TEXT-1'],
    bounds: bounds(),
    confidence: 0.9,
  };
  return {
    drawingHash: DRAWING_HASH,
    graph: {
      drawingHash: DRAWING_HASH,
      symbols: [{
        id: 'TR-1',
        sourceId: 'source:TR-1',
        originalEvidenceId: 'orig:TR-1',
        originalEvidenceIds: ['orig:TR-1'],
        sourceIds: ['source:TR-1'],
        typeCandidates: ['TR'],
        rawLabel: 'TR-1',
        bounds: bounds(),
        ports: [],
        confidence: 0.9,
      }],
      lines: [],
      texts: [text, ...extraTexts],
      junctions: [],
      crossovers: [],
      edges: [],
      textLinks: [],
      conflicts: options.conflict ? ['AMBIGUOUS_TEXT_LINK:TEXT-1'] : [],
    },
    specs: [spec],
    warnings: [],
  };
}

function logicEnvelope(): RoleReviewEnvelope {
  return {
    role: 'logic',
    drawingHash: DRAWING_HASH,
    provider: 'openai',
    model: 'test-model',
    promptVersion: 'test-v1',
    outputHash: 'safe-output-hash',
    durationMs: 1,
    data: {
      warnings: [],
      confidence: 0.9,
      logic: [{
        id: 'LOGIC-1',
        sourceId: 'source:LOGIC-1',
        topic: 'DIRECTION',
        subjectIds: ['TR-1'],
        statement: 'safe logic statement',
        evidenceBounds: [bounds()],
        confidence: 0.9,
      }],
    },
  };
}

function calculation(): DrawingCalculationReceipt {
  return {
    id: 'drawing-calc:transformer-capacity:TR-1@1',
    calculatorId: 'transformer-capacity',
    scopeKey: 'TR-1@1',
    status: 'CALCULATED',
    judgment: 'HOLD',
    missingInputs: [],
    ambiguousInputs: [],
    inputEvidence: [{
      adapterField: 'voltage',
      normalizedField: 'voltage_V',
      value: 380,
      sourceUnit: 'V',
      targetUnit: 'V',
      evidenceId: 'TEXT-1',
      originalEvidenceIds: ['orig:TEXT-1'],
      sourceIds: ['source:TEXT-1'],
      bounds: bounds(),
      confidence: 0.9,
      transform: 'identity',
    }],
    optionalDefaultsUsed: [],
    internalMechanics: [],
    scopeIssues: [],
  };
}

function issue(judgment: ElectricalIssue['judgment']): ElectricalIssue {
  return {
    id: `issue:${judgment}`,
    code: 'INPUT_REQUIRED',
    judgment,
    severity: 'major',
    message: 'safe issue',
    evidence: {
      drawingHash: DRAWING_HASH,
      stableIds: ['TR-1'],
      originalEvidenceIds: ['orig:TR-1'],
      sourceIds: ['source:TR-1'],
      pages: [1],
      bounds: [bounds()],
    },
    requiredInputs: ['drawing input'],
  };
}

function conflict(kind: LogicConflict['kind'], status: LogicConflict['status']): LogicConflict {
  return {
    id: `conflict:${kind}:${status}`,
    kind,
    topic: 'DIRECTION',
    severity: 'critical',
    status,
    action: 'TARGETED_REVIEW',
    reasonCode: 'test-conflict',
    message: 'safe conflict',
    graphEvidenceIds: ['TR-1'],
    graphOriginalEvidenceIds: ['orig:TR-1'],
    graphSourceIds: ['source:TR-1'],
    graphEvidencePages: [1],
    graphEvidenceBounds: [bounds()],
    logicEvidenceIds: ['LOGIC-1'],
    logicEvidenceBounds: [bounds()],
    graphConflictIds: [],
  };
}

function input(options: {
  completedRoles?: DrawingSynthesisInput['completedRoles'];
  coverageComplete?: boolean;
  roleFailures?: DrawingSynthesisInput['roleFailures'];
  normalizedGraph?: NormalizedElectricalGraph;
  calculations?: DrawingCalculationReceipt[];
  issues?: ElectricalIssue[];
  logicConflicts?: LogicConflict[];
  logicEnvelope?: RoleReviewEnvelope;
  claims?: DrawingSynthesisInput['claims'];
  recommendations?: DrawingSynthesisInput['recommendations'];
} = {}): DrawingSynthesisInput {
  return {
    drawingHash: DRAWING_HASH,
    completedRoles: options.completedRoles ?? ['symbols', 'connections', 'text', 'logic'],
    coverageComplete: options.coverageComplete ?? true,
    roleFailures: options.roleFailures ?? [],
    normalizedGraph: options.normalizedGraph ?? normalized(),
    logicEnvelope: options.logicEnvelope ?? logicEnvelope(),
    issues: options.issues ?? [],
    calculations: options.calculations ?? [calculation()],
    logicConflicts: options.logicConflicts ?? [],
    claims: options.claims ?? [],
    recommendations: options.recommendations ?? [],
  };
}

function inputWithGap(gap: 'missing-role' | 'incomplete-review' | 'role-failure' | 'graph-conflict' | 'missing-calculation' | 'unresolved-logic'): DrawingSynthesisInput {
  if (gap === 'missing-role') return input({ completedRoles: ['symbols', 'connections', 'text'] });
  if (gap === 'incomplete-review') return input({ coverageComplete: false });
  if (gap === 'role-failure') return input({ roleFailures: [{ role: 'text', sourceId: 'source:text', fatal: true }] });
  if (gap === 'graph-conflict') return input({ normalizedGraph: normalized({ conflict: true }) });
  if (gap === 'missing-calculation') return input({ calculations: [] });
  return input({ logicConflicts: [conflict('UNRESOLVED_LOGIC_REFERENCE', 'hold')] });
}

describe('synthesizeDrawingReview', () => {
  it('preserves a verified claim only when its current evidence resolves uniquely', () => {
    const result = synthesizeDrawingReview(input({
      claims: [{ id: 'claim-1', text: '380V observed', evidenceIds: ['orig:TEXT-1'], status: 'verified', requiredInputs: [] }],
    }));

    expect(result.claims).toEqual([{ id: 'claim-1', text: '380V observed', evidenceIds: ['orig:TEXT-1'], status: 'verified', requiredInputs: [] }]);
    expect(result.evidenceRegistry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'TEXT-1',
        drawingHash: DRAWING_HASH,
        kind: 'source',
        originalEvidenceIds: ['orig:TEXT-1'],
        sourceIds: ['source:TEXT-1'],
        pages: [1],
      }),
    ]));
  });

  it.each([
    { label: 'empty', evidenceIds: [], graph: normalized() },
    { label: 'unknown', evidenceIds: ['unknown:evidence'], graph: normalized() },
    { label: 'foreign', evidenceIds: ['foreign:evidence'], graph: normalized() },
    { label: 'ambiguous', evidenceIds: ['orig:AMBIGUOUS'], graph: normalized({ ambiguousAlias: true }) },
  ])('rejects $label verified claims without exposing claim content', ({ evidenceIds, graph }) => {
    const claim = { id: 'secret-claim-id', text: 'SECRET-CLAIM-TEXT', evidenceIds, status: 'verified' as const, requiredInputs: [] };

    expect(() => synthesizeDrawingReview(input({ normalizedGraph: graph, claims: [claim] }))).toThrow(UnsupportedSynthesisClaimError);
    try {
      synthesizeDrawingReview(input({ normalizedGraph: graph, claims: [claim] }));
    } catch (error) {
      expect(String(error)).toContain('UNSUPPORTED_SYNTHESIS_CLAIM');
      expect(String(error)).not.toContain(claim.id);
      expect(String(error)).not.toContain(claim.text);
    }
  });

  it('keeps an ambiguous evidence alias at CONDITIONAL even when no claim selects it', () => {
    const result = synthesizeDrawingReview(input({ normalizedGraph: normalized({ ambiguousAlias: true }) }));

    expect(result).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it('holds an unsupported recommendation without repeating its factual text', () => {
    const unsupportedText = '도면에 2500kVA 변압기가 필요합니다.';
    const result = synthesizeDrawingReview(input({
      recommendations: [{
        id: 'rec-foreign', category: 'safety', title: '변압기 증설', description: unsupportedText,
        impact: 'high', evidenceIds: ['foreign:evidence'], requiredInputs: [],
      }],
    }));

    expect(result.recommendations).toEqual([expect.objectContaining({
      status: 'HOLD',
      title: '도면 근거 확인 필요',
      description: '제안 판단에 필요한 현재 도면 근거를 확인해야 합니다.',
      requiredInputs: ['current drawing evidence'],
    })]);
    expect(JSON.stringify(result.recommendations)).not.toContain(unsupportedText);
  });

  it.each([
    'missing-role',
    'incomplete-review',
    'role-failure',
    'graph-conflict',
    'missing-calculation',
    'unresolved-logic',
  ] as const)('keeps %s at CONDITIONAL with human review', (gap) => {
    expect(synthesizeDrawingReview(inputWithGap(gap))).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it('keeps confirmed current-drawing failures above review gaps', () => {
    for (const failure of [
      input({ issues: [issue('FAIL')], coverageComplete: false }),
      input({ logicConflicts: [conflict('CONTRADICTION', 'open')], calculations: [] }),
    ]) {
      expect(synthesizeDrawingReview(failure)).toMatchObject({ verdict: 'FAIL', requiresHumanReview: true });
    }
  });

  it('does not use a calculator receipt judgment as the synthesis verdict', () => {
    expect(synthesizeDrawingReview(input())).toMatchObject({ verdict: 'PASS', requiresHumanReview: false });
  });

  it('distinguishes stages that were not run from stages that completed without findings', () => {
    const notRun = input();
    delete notRun.issues;
    delete notRun.calculations;
    delete notRun.logicConflicts;
    const empty = input({ issues: [], calculations: [], logicConflicts: [] });

    expect(synthesizeDrawingReview(notRun).stages).toMatchObject({
      invariants: 'NOT_RUN', calculator: 'NOT_RUN', logicResolver: 'NOT_RUN',
    });
    expect(synthesizeDrawingReview(empty).stages).toMatchObject({
      invariants: 'COMPLETE', calculator: 'HOLD', logicResolver: 'COMPLETE',
    });
  });

  it('preserves an evidence-backed SKIPPED receipt without treating expected missing input as an integrity failure', () => {
    const receipt = {
      ...calculation(),
      status: 'SKIPPED' as const,
      missingInputs: [{ adapterField: 'length', normalizedFields: ['length_m'] }],
      calculatorResult: undefined,
    };

    expect(synthesizeDrawingReview(input({ calculations: [receipt] }))).toMatchObject({
      verdict: 'PASS',
      requiresHumanReview: false,
      stages: { calculator: 'COMPLETE' },
      calculations: [expect.objectContaining({
        id: receipt.id,
        status: 'SKIPPED',
        missingInputs: [{ adapterField: 'length', normalizedFields: ['length_m'] }],
      })],
    });
  });

  it('preserves an ERROR receipt and keeps calculator failure at CONDITIONAL', () => {
    const receipt = { ...calculation(), status: 'ERROR' as const, error: { code: 'CALCULATOR_UNAVAILABLE' as const, message: 'safe error' } };

    expect(synthesizeDrawingReview(input({ calculations: [receipt] }))).toMatchObject({
      verdict: 'CONDITIONAL',
      requiresHumanReview: true,
      stages: { calculator: 'HOLD' },
      calculations: [expect.objectContaining({ id: receipt.id, status: 'ERROR' })],
    });
  });

  it('sanitizes an evidence-free hold claim and registers only current derived evidence', () => {
    const result = synthesizeDrawingReview(input({
      issues: [issue('HOLD')],
      logicConflicts: [conflict('UNRESOLVED_LOGIC_REFERENCE', 'hold')],
      claims: [{ id: 'hold-claim', text: 'UNSAFE HOLD TEXT', evidenceIds: [], status: 'hold', requiredInputs: [] }],
    }));

    expect(result.claims).toEqual([{
      id: 'hold-claim',
      text: '종합 판단에 필요한 현재 도면 근거를 확인해야 합니다.',
      evidenceIds: [],
      status: 'hold',
      requiredInputs: ['current drawing evidence'],
    }]);
    expect(result.evidenceRegistry).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: calculation().id, kind: 'derived', parentEvidenceIds: ['TEXT-1'] }),
      expect.objectContaining({ id: 'issue:HOLD', kind: 'derived', parentEvidenceIds: ['TR-1'] }),
      expect.objectContaining({ id: 'conflict:UNRESOLVED_LOGIC_REFERENCE:hold', kind: 'derived' }),
    ]));
  });

  it('rejects foreign derived evidence from the synthesis output', () => {
    const foreignIssue = issue('FAIL');
    foreignIssue.evidence.drawingHash = 'foreign-drawing-hash';
    const result = synthesizeDrawingReview(input({ issues: [foreignIssue] }));

    expect(result.issues).toEqual([]);
    expect(result.evidenceRegistry.some((record) => record.id === foreignIssue.id)).toBe(false);
    expect(result).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it('rejects an issue whose provenance aliases only current logic evidence', () => {
    const logicOnlyIssue = issue('FAIL');
    logicOnlyIssue.evidence.stableIds = ['LOGIC-1'];
    logicOnlyIssue.evidence.originalEvidenceIds = ['LOGIC-1'];
    logicOnlyIssue.evidence.sourceIds = ['source:LOGIC-1'];

    const result = synthesizeDrawingReview(input({ issues: [logicOnlyIssue] }));

    expect(result.issues).toEqual([]);
    expect(result.evidenceRegistry.some((record) => record.id === logicOnlyIssue.id)).toBe(false);
    expect(result).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it('rejects a receipt whose input evidence aliases only current logic evidence', () => {
    const sourceReceipt = calculation();
    const logicOnlyReceipt: DrawingCalculationReceipt = {
      ...sourceReceipt,
      id: 'drawing-calc:logic-only',
      inputEvidence: sourceReceipt.inputEvidence.map((evidence) => ({
        ...evidence,
        evidenceId: 'LOGIC-1',
        originalEvidenceIds: ['LOGIC-1'],
        sourceIds: ['source:LOGIC-1'],
      })),
    };
    const recommendation = {
      id: 'rec-logic-receipt', category: 'safety' as const, title: 'logic receipt', description: 'logic receipt', impact: 'high' as const,
      evidenceIds: [logicOnlyReceipt.id], requiredInputs: [],
    };

    const result = synthesizeDrawingReview(input({ calculations: [logicOnlyReceipt], recommendations: [recommendation] }));
    expect(result.calculations).toEqual([]);
    expect(result.evidenceRegistry.some((record) => record.id === logicOnlyReceipt.id)).toBe(false);
    expect(result.recommendations).toEqual([expect.objectContaining({ status: 'HOLD', evidenceIds: [] })]);
    expect(() => synthesizeDrawingReview(input({
      calculations: [logicOnlyReceipt],
      claims: [{ id: 'claim-logic-receipt', text: 'unsupported receipt', evidenceIds: [logicOnlyReceipt.id], status: 'verified', requiredInputs: [] }],
    }))).toThrow(UnsupportedSynthesisClaimError);
  });

  it('rejects a receipt whose graph aliases resolve to different source records', () => {
    const sourceReceipt = calculation();
    const crossRecordReceipt: DrawingCalculationReceipt = {
      ...sourceReceipt,
      id: 'drawing-calc:cross-record',
      inputEvidence: sourceReceipt.inputEvidence.map((evidence) => ({
        ...evidence,
        evidenceId: 'TEXT-1',
        originalEvidenceIds: ['TR-1'],
        sourceIds: ['TR-1'],
      })),
    };

    const result = synthesizeDrawingReview(input({ calculations: [crossRecordReceipt] }));

    expect(result.calculations).toEqual([]);
    expect(result.evidenceRegistry.some((record) => record.id === crossRecordReceipt.id)).toBe(false);
    expect(result).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it('retains a receipt with separately coherent graph input lineages', () => {
    const sourceReceipt = calculation();
    const multiInputReceipt: DrawingCalculationReceipt = {
      ...sourceReceipt,
      id: 'drawing-calc:multi-input',
      inputEvidence: [
        ...sourceReceipt.inputEvidence,
        {
          ...sourceReceipt.inputEvidence[0],
          adapterField: 'secondary',
          evidenceId: 'TR-1',
          originalEvidenceIds: ['orig:TR-1'],
          sourceIds: ['source:TR-1'],
        },
      ],
    };

    const result = synthesizeDrawingReview(input({ calculations: [multiInputReceipt] }));

    expect(result.calculations).toEqual([multiInputReceipt]);
    expect(result.evidenceRegistry).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: multiInputReceipt.id, kind: 'derived' }),
    ]));
  });

  it('rejects a FAIL issue whose graph aliases resolve to different source records', () => {
    const crossRecordIssue = issue('FAIL');
    crossRecordIssue.evidence.stableIds = ['TEXT-1'];
    crossRecordIssue.evidence.originalEvidenceIds = ['TR-1'];
    crossRecordIssue.evidence.sourceIds = ['TR-1'];

    const result = synthesizeDrawingReview(input({ issues: [crossRecordIssue] }));

    expect(result.issues).toEqual([]);
    expect(result.evidenceRegistry.some((record) => record.id === crossRecordIssue.id)).toBe(false);
    expect(result).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it('rejects a conflict when graph and logic namespaces share the same alias', () => {
    const collidingLogic = logicEnvelope();
    if (!collidingLogic.data.logic?.[0]) throw new Error('logic fixture is missing');
    collidingLogic.data.logic[0].id = 'TR-1';
    const collision = conflict('CONTRADICTION', 'open');
    collision.logicEvidenceIds = ['TR-1'];

    const result = synthesizeDrawingReview(input({ logicEnvelope: collidingLogic, logicConflicts: [collision] }));

    expect(result.conflicts).toEqual([]);
    expect(result.evidenceRegistry.some((record) => record.id === collision.id)).toBe(false);
    expect(result).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it('rejects a conflict when graph and logic evidence namespaces are swapped', () => {
    const swapped = conflict('CONTRADICTION', 'open');
    swapped.id = 'conflict:swapped';
    swapped.graphEvidenceIds = ['LOGIC-1'];
    swapped.graphOriginalEvidenceIds = [];
    swapped.graphSourceIds = [];
    swapped.logicEvidenceIds = ['TR-1'];

    const result = synthesizeDrawingReview(input({ logicConflicts: [swapped] }));

    expect(result.conflicts).toEqual([]);
    expect(result.evidenceRegistry.some((record) => record.id === swapped.id)).toBe(false);
    expect(result).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it('is deterministic, does not mutate input, and excludes raw evidence payloads', () => {
    const source = input({
      claims: [
        { id: 'b', text: 'second', evidenceIds: ['TEXT-1'], status: 'verified', requiredInputs: [] },
        { id: 'a', text: 'first', evidenceIds: ['orig:TEXT-1'], status: 'disputed', requiredInputs: [] },
      ],
      recommendations: [{ id: 'rec', category: 'reliability', title: 'safe', description: 'safe', impact: 'low', evidenceIds: ['source:TEXT-1'], requiredInputs: [] }],
    });
    const before = structuredClone(source);
    const permuted = { ...source, claims: [...source.claims].reverse(), recommendations: [...source.recommendations].reverse() };

    const first = synthesizeDrawingReview(source);
    const second = synthesizeDrawingReview(permuted);

    expect(source).toEqual(before);
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toContain('FILE-BUFFER-SENTINEL');
    expect(JSON.stringify(first)).not.toContain('apiKey');
    expect(JSON.stringify(first)).not.toContain('request');
  });
});
