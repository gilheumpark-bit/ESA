import { generateKeyPairSync } from 'node:crypto';

import type { DrawingDocumentV3 } from '../types-v3';
import { ENGINE_VERSION, PREPROCESS_VERSION, PROMPT_VERSION } from '../types-v3';
import { applyEvaluationSuiteBadge } from '../drawing-evaluation-gate';
import {
  buildEvaluationSuiteResult,
  evaluatePredictionAgainstLabel,
  shouldActivateVerified95,
} from '../sld-evaluator-v2';

function fixture(): DrawingDocumentV3 {
  return {
    schemaVersion: 3,
    documentHash: 'a'.repeat(64),
    pageCount: 1,
    requestedPages: 'all',
    jobStatus: 'COMPLETE',
    pages: [{ pageIndex: 0, status: 'complete', drawingKind: 'sld', vlmCalls: 18 }],
    coverageLedger: { plannedRegionCount: 0, regionsComplete: 0, regionsFailed: 0, regionsSkippedEmpty: 0, regions: [], rolesPresent: [], unresolvedRescans: 0, allPlannedFinished: true },
    evidenceGraph: {
      symbols: [
        { id: 's1', displayId: 'P01-S001', typeCandidates: ['vcb'], confirmedType: 'vcb', rawLabel: 'VCB-1', certainty: 'confirmed', evidence: [{ evidenceId: 'se1', pageIndex: 0, bounds: { x: 10, y: 10, w: 20, h: 20 }, confidence: 1 }] },
        { id: 's2', displayId: 'P01-S002', typeCandidates: ['transformer'], confirmedType: 'transformer', rawLabel: 'TR-1', certainty: 'confirmed', evidence: [{ evidenceId: 'se2', pageIndex: 0, bounds: { x: 70, y: 10, w: 20, h: 20 }, confidence: 1 }] },
      ],
      lines: [{ id: 'l1', displayId: 'P01-L001', lineKind: 'power', path: [{ x: 30, y: 20 }, { x: 70, y: 20 }], junctions: [{ x: 50, y: 20 }], crossovers: [], certainty: 'confirmed', evidence: [{ evidenceId: 'le1', pageIndex: 0, bounds: { x: 30, y: 20, w: 40, h: 1 }, confidence: 1 }] }],
      texts: [{ id: 't1', displayId: 'P01-T001', rawText: '100A', confirmedText: '100A', candidates: ['100A'], certainty: 'confirmed', evidence: [{ evidenceId: 'te1', pageIndex: 0, bounds: { x: 30, y: 30, w: 20, h: 8 }, confidence: 1 }] }],
      relations: [{ id: 'r1', displayId: 'P01-R001', from: 's1', to: 's2', lineId: 'l1', certainty: 'confirmed', evidence: [{ evidenceId: 'le1', pageIndex: 0, bounds: { x: 30, y: 20, w: 40, h: 1 }, confidence: 1 }] }],
    },
    crossPageRelations: [], equipmentCounts: [], ratedValues: [], calculations: [],
    recommendations: [{ id: 'rec1', severity: 'major', priority: 1, problem: '접지 경로 누락', relatedDisplayIds: ['P01-S001'], evidenceIds: [], calcReceiptIds: [], standardRefs: [], requiredInputs: [], recommendedAction: '접지 확인', status: 'SUPPORTED' }],
    unresolvedItems: [], userCorrections: [],
    verification: { claimsComplete: true, documentStatus: 'COMPLETE', holdReasons: [], evidenceTraceRate: 1, verified95: false, productionFingerprint: { engineVersion: ENGINE_VERSION, promptVersion: PROMPT_VERSION, preprocessVersion: PREPROCESS_VERSION } },
    title: '전체 도면 판독표', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('SLD evaluator V2 spatial and signed gate', () => {
  const label = {
    labelId: 'gold-1',
    stratum: 'real-adjudicated-low-resolution',
    symbols: [
      { type: 'vcb', label: 'VCB-1', bounds: { x: 10, y: 10, w: 20, h: 20 }, pageIndex: 0 },
      { type: 'transformer', label: 'TR-1', bounds: { x: 70, y: 10, w: 20, h: 20 }, pageIndex: 0 },
    ],
    edges: [{ fromLabel: 'VCB-1', toLabel: 'TR-1', pageIndex: 0 }],
    texts: [{ text: '100A', pageIndex: 0 }],
    junctions: [{ pageIndex: 0, x: 50, y: 20, kind: 'junction' as const }],
    logicFindings: [{ pageIndex: 0, expected: 'recommendation' as const, contains: '접지 경로 누락' }],
  };

  it('uses one-to-one spatial matching and computes traceability from claims', () => {
    const prediction = fixture();
    prediction.verification.evidenceTraceRate = 1;
    const result = evaluatePredictionAgainstLabel(prediction, label);

    expect(result.metrics.symbolMacroF1).toBe(1);
    expect(result.metrics.junctionAccuracy).toBe(1);
    expect(result.metrics.logicRecall).toBe(1);
    expect(result.metrics.evidenceTraceRate).toBeLessThan(1);
    expect(result.metrics.unsourcedPassCount).toBe(1);
    expect(result.receipt.signature).toBe('');

    const shifted = fixture();
    shifted.evidenceGraph.symbols[0].evidence[0].bounds.x = 500;
    shifted.evidenceGraph.lines[0].junctions[0].x = 500;
    const failed = evaluatePredictionAgainstLabel(shifted, label);
    expect(failed.metrics.symbolMacroF1).toBeLessThan(1);
    expect(failed.metrics.junctionAccuracy).toBe(0);
  });

  it('requires an external signature, real adjudicated data, strata and three runs before badge activation', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const result = evaluatePredictionAgainstLabel(fixture(), label, {
      datasetId: 'dataset-1',
      datasetKind: 'real-adjudicated',
      provider: 'gemini',
      model: 'gemini-test',
      runCount: 3,
      signingPrivateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    });
    const fingerprint = { ...fixture().verification.productionFingerprint!, provider: 'gemini', model: 'gemini-test' };

    expect(shouldActivateVerified95(result, fingerprint)).toBe(false);
    expect(shouldActivateVerified95(result, fingerprint, {
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      requiredStrata: ['real-adjudicated-low-resolution'],
      realAdjudicated: true,
    })).toBe(false); // unsupported PASS keeps this fixture below threshold
  });

  it('activates only a signed three-run worst-case suite when every required stratum passes', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const prediction = fixture();
    prediction.recommendations[0].evidenceIds = ['se1'];
    const runs = [1, 2, 3].map(() => evaluatePredictionAgainstLabel(prediction, label, {
      datasetId: 'dataset-1', stratum: label.stratum,
    }));
    const suite = buildEvaluationSuiteResult(runs, {
      provider: 'gemini', model: 'gemini-test', datasetKind: 'real-adjudicated', runsPerCase: 3,
      signingPrivateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    });
    const fingerprint = { ...prediction.verification.productionFingerprint!, provider: 'gemini', model: 'gemini-test' };
    expect(suite.failedMetrics).toEqual([]);
    expect(shouldActivateVerified95(suite, fingerprint, {
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      requiredStrata: ['real-adjudicated-low-resolution'], realAdjudicated: true,
    })).toBe(true);
    const badgeDocument = fixture();
    badgeDocument.verification.productionFingerprint = fingerprint;
    expect(applyEvaluationSuiteBadge(
      badgeDocument,
      suite,
      publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      ['real-adjudicated-low-resolution'],
    ).verification).toMatchObject({ verified95: true, verified95Receipt: { runCount: 3, provider: 'gemini', model: 'gemini-test' } });

    suite.strata['real-adjudicated-low-resolution'].edgeF1 = 0.94;
    expect(shouldActivateVerified95(suite, fingerprint, {
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      requiredStrata: ['real-adjudicated-low-resolution'], realAdjudicated: true,
    })).toBe(false);
  });
});
