import { runOrchestrator } from '../orchestrator';
import type { DrawingSynthesis } from '../electrical/synthesis';

const baseTeamResult = {
  success: true,
  confidence: 0.9,
  durationMs: 1,
};

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

function drawingRequest() {
  return {
    sessionId: 'independent-review',
    file: {
      buffer: new ArrayBuffer(1),
      name: 'sld.png',
      mimeType: 'image/png',
    },
  };
}

function runWithDeps(
  synthesis: DrawingSynthesis | undefined,
  consensus = jest.fn(async (input: { drawingSynthesis?: typeof synthesis }) => ({
    teamResult: { teamId: 'TEAM-CONSENSUS', ...baseTeamResult },
    report: { reportId: 'RPT-IMAGE', drawingSynthesis: input.drawingSynthesis } as never,
  })),
) {
  return {
    consensus,
    result: (runOrchestrator as unknown as (request: ReturnType<typeof drawingRequest>, deps: Record<string, unknown>) => ReturnType<typeof runOrchestrator>)(drawingRequest(), {
      executeSLD: jest.fn().mockResolvedValue({ teamId: 'TEAM-SLD', ...baseTeamResult, ...(synthesis ? { drawingSynthesis: synthesis } : {}) }),
      executeStandards: jest.fn().mockResolvedValue({ teamId: 'TEAM-STD', ...baseTeamResult }),
      executeLayout: jest.fn(),
      executeConsensus: consensus,
    }),
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
    expect((response as { drawingSynthesis?: unknown }).drawingSynthesis).toEqual(response.report?.drawingSynthesis);
    expect((response as { drawingSynthesis?: unknown }).drawingSynthesis).toEqual(synthesis);
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
