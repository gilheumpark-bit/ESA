import { createHash } from 'crypto';
import { canonicalize } from '@/engine/receipt/receipt-hash';
import { executeConsensusTeam } from '../consensus-team';
import type { DrawingSynthesis } from '../../electrical/synthesis';

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

    const { teamResult, report } = await executeConsensusTeam({
      sessionId: 'drawing-integrity-test',
      projectName: 'Drawing Integrity',
      projectType: 'SLD',
      drawingSynthesis,
      teamResults: [{
        teamId: 'TEAM-STD',
        success: true,
        confidence: 0.9,
        durationMs: 1,
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
  });
});
