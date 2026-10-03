import { runOrchestrator } from '../orchestrator';
import { executeSLDTeam } from '../teams/sld-team';
import { executeLayoutTeam } from '../teams/layout-team';
import { executeStandardsTeam } from '../teams/standards-team';
import { executeConsensusTeam } from '../teams/consensus-team';
import { classifyInput } from '../teams/team-registry';
import type { TeamResult } from '../teams/types';

jest.mock('../teams/sld-team', () => ({ executeSLDTeam: jest.fn() }));
jest.mock('../teams/layout-team', () => ({ executeLayoutTeam: jest.fn() }));
jest.mock('../teams/standards-team', () => ({ executeStandardsTeam: jest.fn() }));
jest.mock('../teams/consensus-team', () => ({ executeConsensusTeam: jest.fn() }));

const mockSLD = jest.mocked(executeSLDTeam);
const mockLayout = jest.mocked(executeLayoutTeam);
const mockStandards = jest.mocked(executeStandardsTeam);
const mockConsensus = jest.mocked(executeConsensusTeam);

const ok = (teamId: TeamResult['teamId']): TeamResult => ({ teamId, success: true, confidence: 0.9, durationMs: 1 });
const QUERY = '계통도와 조명 평면도를 함께 검토';

/**
 * 질의에 계통도와 평면도 낱말이 함께 있으면 분류가 `mixed` 가 되고 세 팀이 모두 불린다.
 * 그런데 두 도면팀은 `sld_*` / `layout_*` 로만 분기해서, `mixed` 를 그대로 받으면
 * 아무것도 읽지 않고 실패했다 — 파일을 올리고도 합의 보고서가 나오지 않았다.
 * 각 도면팀에는 파일 형식에 맞는 자기 분류를 넘긴다.
 */
describe('mixed 분류의 팀 배정', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSLD.mockResolvedValue(ok('TEAM-SLD'));
    mockLayout.mockResolvedValue(ok('TEAM-LAYOUT'));
    mockStandards.mockResolvedValue(ok('TEAM-STD'));
    mockConsensus.mockResolvedValue({ debateResults: [], markings: [], report: undefined } as never);
  });

  it.each([
    ['application/pdf', 'plan.pdf', 'sld_pdf', 'layout_pdf'],
    ['application/dxf', 'plan.dxf', 'sld_dxf', 'layout_dxf'],
    ['image/png', 'plan.png', 'sld_image', 'layout_image'],
  ])('%s 파일은 도면팀마다 자기 분류로 넘어간다', async (mimeType, name, sldKind, layoutKind) => {
    expect(classifyInput(mimeType, name, QUERY)).toBe('mixed');

    await runOrchestrator({
      sessionId: 'mixed-routing',
      query: QUERY,
      file: { buffer: new Uint8Array([1]).buffer, name, mimeType },
    });

    expect(mockSLD).toHaveBeenCalledWith(expect.objectContaining({ classification: sldKind }));
    expect(mockLayout).toHaveBeenCalledWith(expect.objectContaining({ classification: layoutKind }));
    expect(mockStandards).toHaveBeenCalledWith(expect.objectContaining({ classification: 'mixed' }));
  });

  // 이미지 계통도 판독은 호출마다 비용이 든다 — 단독 경로와 같이 재시도하지 않는다.
  it('mixed 이미지에서도 계통도 판독은 실패 시 재시도하지 않는다', async () => {
    mockSLD.mockRejectedValue(new Error('vision unavailable'));

    await runOrchestrator({
      sessionId: 'mixed-no-retry',
      query: QUERY,
      file: { buffer: new Uint8Array([1]).buffer, name: 'plan.png', mimeType: 'image/png' },
    });

    expect(mockSLD).toHaveBeenCalledTimes(1);
  });
});
