import { runOrchestrator } from '../orchestrator';
import { executeSLDTeam } from '../teams/sld-team';
import { executeStandardsTeam } from '../teams/standards-team';
import { executeConsensusTeam } from '../teams/consensus-team';
import type { DrawingSynthesis } from '../electrical/synthesis';

jest.mock('../teams/sld-team', () => ({ executeSLDTeam: jest.fn() }));
jest.mock('../teams/layout-team', () => ({ executeLayoutTeam: jest.fn() }));
jest.mock('../teams/standards-team', () => ({ executeStandardsTeam: jest.fn() }));
jest.mock('../teams/consensus-team', () => ({ executeConsensusTeam: jest.fn() }));

const mockSLD = jest.mocked(executeSLDTeam);
const mockStandards = jest.mocked(executeStandardsTeam);
const mockConsensus = jest.mocked(executeConsensusTeam);
const requestScopedKey = ['request', 'only', 'gemini', 'key', 'value'].join('-');

const baseTeamResult = {
  success: true,
  confidence: 0.9,
  durationMs: 1,
};

const completeDrawingSynthesis: DrawingSynthesis = {
  drawingHash: 'drawing-hash-boundary',
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

function drawingRequest() {
  return {
    sessionId: 'consensus-boundary',
    file: {
      buffer: new ArrayBuffer(1),
      name: 'sld.png',
      mimeType: 'image/png',
    },
  };
}

describe('orchestrator consensus boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSLD.mockResolvedValue({ teamId: 'TEAM-SLD', ...baseTeamResult });
    mockStandards.mockResolvedValue({ teamId: 'TEAM-STD', ...baseTeamResult });
    mockConsensus.mockResolvedValue({
      teamResult: { teamId: 'TEAM-CONSENSUS', ...baseTeamResult },
      report: { reportId: 'RPT-TEST' } as never,
    });
  });

  test('does not claim consensus when fewer than two distinct expert teams succeed', async () => {
    mockStandards.mockResolvedValue({
      teamId: 'TEAM-STD',
      success: false,
      confidence: 0,
      durationMs: 1,
    });

    const result = await runOrchestrator(drawingRequest());

    expect(result).toHaveProperty('consensus.executed', false);
    expect(mockConsensus).not.toHaveBeenCalled();
  });

  test('does not count TEAM-STD as an independent image reviewer', async () => {
    mockSLD.mockResolvedValue({ teamId: 'TEAM-SLD', ...baseTeamResult, drawingSynthesis: completeDrawingSynthesis });
    mockConsensus.mockResolvedValue({
      teamResult: { teamId: 'TEAM-CONSENSUS', ...baseTeamResult },
      report: { reportId: 'RPT-TEST', drawingSynthesis: completeDrawingSynthesis } as never,
    });

    const result = await runOrchestrator(drawingRequest());

    expect(result).toHaveProperty('consensus.executed', true);
    expect(result).toHaveProperty('consensus.participatingTeams', ['TEAM-SLD']);
    expect(result).toHaveProperty('consensus.reason', '원본 격리 심사 4개를 메인 종합 단계에서 대조했습니다.');
    expect(mockConsensus).toHaveBeenCalledTimes(1);
  });

  test('passes request-scoped Vision credentials to the drawing team', async () => {
    await runOrchestrator({
      ...drawingRequest(),
      vision: { provider: 'gemini', apiKey: requestScopedKey },
    });

    expect(mockSLD).toHaveBeenCalledWith(expect.objectContaining({
      vision: { provider: 'gemini', apiKey: requestScopedKey },
    }));
  });

  test('does not dispatch or reach consensus when the request signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runOrchestrator({ ...drawingRequest(), signal: controller.signal });

    expect(mockSLD).not.toHaveBeenCalled();
    expect(mockConsensus).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, consensus: { executed: false } });
  });

  test('forwards the same live request signal to TEAM-SLD', async () => {
    const controller = new AbortController();
    await runOrchestrator({ ...drawingRequest(), signal: controller.signal });

    expect(mockSLD).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
  });

  test('drops a consensus report if the request aborts while consensus is running', async () => {
    const controller = new AbortController();
    mockConsensus.mockImplementationOnce(async () => {
      controller.abort();
      return { teamResult: { teamId: 'TEAM-CONSENSUS', ...baseTeamResult }, report: { reportId: 'must-not-return' } as never };
    });

    const result = await runOrchestrator({ ...drawingRequest(), signal: controller.signal });

    expect(result).toMatchObject({ success: false, consensus: { executed: false } });
    expect(result.report).toBeUndefined();
  });

  test('does not retry an image TEAM-SLD rejection', async () => {
    mockSLD.mockRejectedValue(new Error('source failure'));
    const result = await runOrchestrator(drawingRequest());

    expect(mockSLD).toHaveBeenCalledTimes(1);
    expect(result.consensus.executed).toBe(false);
  });
});
