import { runOrchestrator } from '../orchestrator';
import { executeSLDTeam } from '../teams/sld-team';
import { executeStandardsTeam } from '../teams/standards-team';
import { executeConsensusTeam } from '../teams/consensus-team';

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

  test('records the distinct teams that actually participated in consensus', async () => {
    const result = await runOrchestrator(drawingRequest());

    expect(result).toHaveProperty('consensus.executed', true);
    expect(result).toHaveProperty(
      'consensus.participatingTeams',
      expect.arrayContaining(['TEAM-SLD', 'TEAM-STD']),
    );
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
});
