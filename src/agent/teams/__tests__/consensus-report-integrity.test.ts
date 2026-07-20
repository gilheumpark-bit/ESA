import { createHash } from 'crypto';
import { canonicalize } from '@/engine/receipt/receipt-hash';
import { executeConsensusTeam } from '../consensus-team';
import type { DrawingSynthesis } from '../../electrical/synthesis';
import type { DrawingReviewArtifact } from '../types';

describe('consensus report integrity', () => {
  test('seals the complete report and records real in-report evidence IDs', async () => {
    const { report } = await executeConsensusTeam({
      sessionId: 'integrity-test',
      projectName: 'Integrity',
      projectType: 'SLD',
      teamResults: [{
        teamId: 'TEAM-STD',
        success: true,
        confidence: 0.9,
        durationMs: 1,
        calculations: [{
          id: 'calc-vd-1',
          calculatorId: 'voltage-drop',
          label: '전압강하',
          value: 2.4,
          unit: '%',
          compliant: true,
          standardRef: 'KEC 232.52',
        }],
      }],
    });

    const { hash, ...claim } = report;
    const expected = createHash('sha256').update(canonicalize(claim)).digest('hex');

    expect(hash).toBe(expected);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(report).toHaveProperty(
      'evidenceIds',
      expect.arrayContaining(['team:TEAM-STD', 'calculation:calc-vd-1']),
    );
    expect(report).not.toHaveProperty('receiptIds');
  });

  test('preserves conditional drawing synthesis in the sealed report without promoting generic recommendations', async () => {
    const drawingSynthesis: DrawingSynthesis = {
      drawingHash: 'drawing-hash-integrity',
      requiredRoles: ['symbols', 'connections', 'text', 'logic'],
      completedRoles: ['symbols', 'connections', 'text', 'logic'],
      missingRoles: [],
      reviewIntegrity: { coverageComplete: true, roleFailures: [] },
      stages: {
        normalizer: 'COMPLETE',
        invariants: 'COMPLETE',
        calculator: 'COMPLETE',
        logicResolver: 'COMPLETE',
        synthesis: 'COMPLETE',
      },
      verdict: 'CONDITIONAL',
      requiresHumanReview: true,
      evidenceRegistry: [{
        id: 'evidence:text-1',
        drawingHash: 'drawing-hash-integrity',
        kind: 'source',
        originalEvidenceIds: ['original:text-1'],
        sourceIds: ['source:text-1'],
        pages: [1],
        parentEvidenceIds: [],
      }],
      claims: [{
        id: 'claim-1',
        text: '도면 근거가 확인되었습니다.',
        evidenceIds: ['evidence:text-1'],
        status: 'verified',
        requiredInputs: [],
      }],
      calculations: [{
        id: 'receipt-1',
        calculatorId: 'voltage-drop',
        scopeKey: 'scope-1',
        status: 'CALCULATED',
        judgment: 'HOLD',
        missingInputs: [],
        ambiguousInputs: [],
        inputEvidence: [{
          adapterField: 'voltage',
          normalizedField: 'voltage_V',
          value: 220,
          sourceUnit: 'V',
          targetUnit: 'V',
          evidenceId: 'evidence:text-1',
          originalEvidenceIds: ['original:text-1'],
          sourceIds: ['source:text-1'],
          bounds: { page: 1, x: 0, y: 0, w: 1, h: 1 },
          confidence: 1,
          transform: 'identity',
        }],
        optionalDefaultsUsed: [],
        internalMechanics: [],
        scopeIssues: [],
      }],
      issues: [{
        id: 'issue-1',
        code: 'INPUT_REQUIRED',
        judgment: 'HOLD',
        severity: 'minor',
        message: '추가 입력이 필요합니다.',
        evidence: {
          drawingHash: 'drawing-hash-integrity',
          stableIds: ['symbol-1'],
          originalEvidenceIds: ['original:text-1'],
          sourceIds: ['source:text-1'],
          pages: [1],
          bounds: [{ page: 1, x: 0, y: 0, w: 1, h: 1 }],
        },
        requiredInputs: ['전압'],
      }],
      conflicts: [{
        id: 'conflict-1',
        kind: 'UNRESOLVED_LOGIC_REFERENCE',
        topic: 'DIRECTION',
        severity: 'major',
        status: 'hold',
        action: 'TARGETED_REVIEW',
        reasonCode: 'MISSING_REFERENCE',
        message: '논리 참조를 확인해야 합니다.',
        graphEvidenceIds: ['evidence:text-1'],
        graphOriginalEvidenceIds: ['original:text-1'],
        graphSourceIds: ['source:text-1'],
        graphEvidencePages: [1],
        graphEvidenceBounds: [{ page: 1, x: 0, y: 0, w: 1, h: 1 }],
        logicEvidenceIds: ['logic-1'],
        logicEvidenceBounds: [{ page: 1, x: 0, y: 0, w: 1, h: 1 }],
        graphConflictIds: [],
      }],
      recommendations: [{
        id: 'rec-drawing-1',
        category: 'safety',
        title: '도면 근거 권고',
        description: '현재 도면 근거에 따른 권고입니다.',
        impact: 'high',
        evidenceIds: ['evidence:text-1'],
        status: 'SUPPORTED',
        requiredInputs: [],
      }],
      graphConflicts: [],
    };
    const drawingReview: DrawingReviewArtifact = {
      snapshot: {
        drawingHash: 'drawing-hash-integrity',
        mimeType: 'image/png',
        page: 1,
        width: 1600,
        height: 900,
        quality: {
          width: 1600,
          height: 900,
          channels: 4,
          contrast: 1,
          edgeDensity: 1,
          gradientVariance: 1,
          lowContrast: false,
          blurry: false,
          recommendedScale: 1,
          warnings: [],
        },
      },
      envelopes: [{
        role: 'logic',
        drawingHash: 'drawing-hash-integrity',
        provider: 'openai',
        model: 'fixture',
        promptVersion: 'fixture-v1',
        outputHash: 'fixture-output',
        durationMs: 1,
        data: {
          warnings: [],
          confidence: 1,
          logic: [{
            id: 'logic-1',
            sourceId: 'source:logic-1',
            topic: 'DIRECTION',
            subjectIds: ['symbol-1', 'symbol-2'],
            statement: 'symbol-1 feeds symbol-2',
            evidenceBounds: [{ page: 1, x: 0, y: 0, w: 10, h: 10 }],
            confidence: 1,
          }],
        },
      }],
      graph: {
        drawingHash: 'drawing-hash-integrity',
        symbols: [
          { id: 'symbol-1', originalEvidenceId: 'original:symbol-1', originalEvidenceIds: ['original:symbol-1'], sourceIds: ['source:symbol-1'], typeCandidates: ['VCB'], rawLabel: 'VCB-1', bounds: { page: 1, x: 100, y: 100, w: 50, h: 50 }, ports: [], confidence: 1 },
          { id: 'symbol-2', originalEvidenceId: 'original:symbol-2', originalEvidenceIds: ['original:symbol-2'], sourceIds: ['source:symbol-2'], typeCandidates: ['TR'], rawLabel: 'TR-1', bounds: { page: 1, x: 700, y: 100, w: 50, h: 50 }, ports: [], confidence: 1 },
        ],
        lines: [{ id: 'line-1', originalEvidenceId: 'original:line-1', originalEvidenceIds: ['original:line-1'], sourceIds: ['source:line-1'], pages: [1], lineKind: 'power', path: [{ x: 150, y: 125 }, { x: 700, y: 125 }], start: { x: 150, y: 125 }, end: { x: 700, y: 125 }, junctions: [], crossovers: [], confidence: 1 }],
        texts: [{ id: 'evidence:text-1', originalEvidenceId: 'original:text-1', originalEvidenceIds: ['original:text-1'], sourceIds: ['source:text-1'], raw: '220V', candidates: ['220V'], bounds: { page: 1, x: 200, y: 80, w: 80, h: 20 }, confidence: 1 }],
        junctions: [],
        crossovers: [],
        edges: [{ id: 'edge-1', from: 'symbol-1', lineId: 'line-1', to: 'symbol-2', confidence: 1 }],
        textLinks: [],
        conflicts: [],
      },
      failures: [],
      coverage: {
        roles: {
          symbols: { variantId: 'original', expectedRegionCount: 1, actualRegionCount: 1, plannedCalls: 1 },
          connections: { variantId: 'original', expectedRegionCount: 1, actualRegionCount: 1, plannedCalls: 1 },
          text: { variantId: 'original', expectedRegionCount: 1, actualRegionCount: 1, plannedCalls: 1 },
          logic: { variantId: 'original', expectedRegionCount: 1, actualRegionCount: 1, plannedCalls: 1 },
        },
        plannedCalls: 4,
        complete: true,
        maxRegionCallsPerRole: 1,
      },
    };

    const { teamResult, report } = await executeConsensusTeam({
      sessionId: 'drawing-integrity-test',
      projectName: 'Drawing Integrity',
      projectType: 'SLD',
      drawingSynthesis,
      teamResults: [{
        teamId: 'TEAM-SLD',
        success: true,
        confidence: 0.9,
        durationMs: 1,
        drawingReview,
        drawingSynthesis,
        recommendations: [{
          id: 'rec-generic-1',
          category: 'cost',
          title: '일반 비용 권고',
          description: '도면 출처가 없는 일반 권고입니다.',
          impact: 'medium',
        }],
      }],
    });

    const { hash, ...claim } = report;
    expect(report).toMatchObject({
      verdict: 'CONDITIONAL',
      requiresHumanReview: true,
      drawingSynthesis,
      drawingIntelligence: expect.objectContaining({
        schemaVersion: 2,
        drawingHash: 'drawing-hash-integrity',
        source: { assetKey: 'drawing-hash-integrity', mimeType: 'image/png', width: 1600, height: 900, page: 1 },
        verified95: false,
        relations: [expect.objectContaining({ id: 'edge-1', from: 'symbol-1', line: 'line-1', to: 'symbol-2' })],
      }),
      summary: {
        topRecommendations: [expect.objectContaining({
          id: 'rec-drawing-1',
          evidenceIds: ['evidence:text-1'],
          status: 'SUPPORTED',
          requiredInputs: [],
        })],
      },
    });
    expect(report.summary.topRecommendations.map((recommendation) => recommendation.id)).not.toContain('rec-generic-1');
    expect(teamResult.recommendations?.map((recommendation) => recommendation.id)).toEqual(['rec-drawing-1']);
    expect(report.evidenceIds).toEqual(expect.arrayContaining([
      'evidence:text-1',
      'claim-1',
      'receipt-1',
      'issue-1',
      'conflict-1',
    ]));
    expect(hash).toBe(createHash('sha256').update(canonicalize(claim)).digest('hex'));
    if (!claim.drawingSynthesis) throw new Error('drawing synthesis fixture is missing');
    const tampered = structuredClone(claim);
    if (!tampered.drawingSynthesis) throw new Error('tampered drawing synthesis fixture is missing');
    tampered.drawingSynthesis.claims[0].text = 'tampered';
    expect(createHash('sha256').update(canonicalize(tampered)).digest('hex')).not.toBe(hash);
    const tamperedOverlay = structuredClone(claim);
    if (!tamperedOverlay.drawingIntelligence) throw new Error('drawing intelligence fixture is missing');
    tamperedOverlay.drawingIntelligence.symbols[0].label = 'tampered-overlay';
    expect(createHash('sha256').update(canonicalize(tamperedOverlay)).digest('hex')).not.toBe(hash);
  });
});
