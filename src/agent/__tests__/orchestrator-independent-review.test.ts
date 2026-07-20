import { runOrchestrator, type OrchestratorDeps, type OrchestratorRequest } from '../orchestrator';
import type { DrawingSynthesis } from '../electrical/synthesis';
import type { ConsensusTeamInput } from '../teams/consensus-team';
import type { ESVAVerifiedReport, TeamResult } from '../teams/types';

function teamResult(teamId: TeamResult['teamId'], overrides: Partial<TeamResult> = {}): TeamResult {
  return { teamId, success: true, confidence: 0.9, durationMs: 1, ...overrides };
}

function drawingSynthesis(overrides: Partial<DrawingSynthesis> = {}): DrawingSynthesis {
  const base: DrawingSynthesis = {
    drawingHash: 'drawing-hash-1',
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
    evidenceRegistry: [],
    calculations: [],
    issues: [],
    conflicts: [],
    claims: [],
    recommendations: [],
    graphConflicts: [],
    verdict: 'PASS',
    requiresHumanReview: false,
  };

  return {
    ...base,
    ...overrides,
    stages: { ...base.stages, ...overrides.stages },
    reviewIntegrity: { ...base.reviewIntegrity, ...overrides.reviewIntegrity },
  };
}

function drawingRequest(): OrchestratorRequest {
  return {
    sessionId: 'independent-review',
    file: {
      buffer: new ArrayBuffer(1),
      name: 'sld.png',
      mimeType: 'image/png',
    },
  };
}

function reportFixture(drawingSynthesis?: DrawingSynthesis): ESVAVerifiedReport {
  return {
    reportId: 'RPT-IMAGE',
    createdAt: '2026-07-20T00:00:00.000Z',
    version: 'ESVA Report v1.0',
    projectName: '독립 심사',
    projectType: 'SLD',
    verdict: drawingSynthesis?.verdict ?? 'CONDITIONAL',
    grade: 'B',
    compositeScore: 80,
    teamResults: [],
    debateResults: [],
    markings: [],
    summary: {
      totalComponents: 0,
      totalConnections: 0,
      totalCalculations: 0,
      passedChecks: 0,
      failedChecks: 0,
      warningChecks: 0,
      criticalViolations: [],
      topRecommendations: [],
      appliedStandards: [],
      textKo: '독립 심사 보고서',
      textEn: 'Independent review report',
    },
    requiresHumanReview: Boolean(drawingSynthesis?.requiresHumanReview),
    evidenceIds: [],
    hash: 'fixture-hash',
    ...(drawingSynthesis ? { drawingSynthesis } : {}),
  };
}

function runWithDeps(
  synthesis: DrawingSynthesis | undefined,
  consensus = jest.fn(async (input: ConsensusTeamInput) => ({
    teamResult: teamResult('TEAM-CONSENSUS'),
    report: reportFixture(input.drawingSynthesis),
  })),
) {
  const deps: OrchestratorDeps = {
    executeSLD: async () => teamResult('TEAM-SLD', synthesis ? { drawingSynthesis: synthesis } : {}),
    executeStandards: async () => teamResult('TEAM-STD'),
    executeLayout: async () => teamResult('TEAM-LAYOUT'),
    executeConsensus: consensus,
  };

  return {
    consensus,
    result: runOrchestrator(drawingRequest(), deps),
  };
}

describe('orchestrator independent SLD review', () => {
  test('uses TEAM-SLD alone as the complete image reviewer and preserves the report synthesis', async () => {
    const synthesis = drawingSynthesis();
    const { result, consensus } = runWithDeps(synthesis);

    const response = await result;

    expect(response.consensus).toEqual(expect.objectContaining({
      executed: true,
      participatingTeams: ['TEAM-SLD'],
      reason: '원본 격리 심사 4개를 메인 종합 단계에서 대조했습니다.',
    }));
    expect(consensus).toHaveBeenCalledWith(expect.objectContaining({ drawingSynthesis: synthesis }));
    expect(response.drawingSynthesis).toEqual(response.report?.drawingSynthesis);
    expect(response.drawingSynthesis).toEqual(synthesis);
  });

  test('does not create an image success or report from TEAM-STD when TEAM-SLD has no synthesis', async () => {
    const { result, consensus } = runWithDeps(undefined);

    const response = await result;

    expect(response).toMatchObject({ success: false, consensus: { executed: false, participatingTeams: [] } });
    expect(response.report).toBeUndefined();
    expect(consensus).not.toHaveBeenCalled();
  });

  test('keeps a missing role synthesis usable without claiming four-way comparison', async () => {
    const synthesis = drawingSynthesis({
      missingRoles: ['logic'],
      verdict: 'CONDITIONAL',
      requiresHumanReview: true,
    });
    const { result } = runWithDeps(synthesis);

    const response = await result;

    expect(response).toMatchObject({ success: true, consensus: {
      executed: false,
      participatingTeams: ['TEAM-SLD'],
      reason: '원본 격리 심사 필수 역할 누락: logic. 사람 검토가 필요합니다.',
    } });
    expect(response.consensus.reason).not.toContain('4개를 메인 종합 단계에서 대조했습니다');
  });
});
