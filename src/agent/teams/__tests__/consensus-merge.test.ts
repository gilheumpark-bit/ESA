/**
 * consensus 병합 — 최악 판정 보존 (독립 심사 CRITICAL 재현 잠금)
 *
 * 종전 dedup은 `${standard}-${clause}` 키에서 먼저 온 행이 무조건 이겨서,
 * 같은 조항이 인스턴스마다 다른 판정일 때(변압기 2대 중 1대 위반) 뒤에 온
 * FAIL이 병합표에서 사라지고 hasFail → verdict까지 놓쳤다.
 */

import { executeConsensusTeam } from '../consensus-team';
import type { TeamResult } from '../types';

function sldResult(standards: TeamResult['standards']): TeamResult {
  return {
    teamId: 'TEAM-SLD',
    success: true,
    confidence: 0.95,
    durationMs: 1,
    components: [],
    connections: [],
    calculations: [],
    standards,
    violations: [],
  };
}

describe('consensus 병합 — 같은 조항 키의 최악 판정 보존', () => {
  it('PASS가 먼저 와도 뒤의 FAIL이 병합표에 남고 verdict가 FAIL이 된다', async () => {
    const { teamResult, report } = await executeConsensusTeam({
      sessionId: 't',
      projectName: 't',
      projectType: 't',
      teamResults: [
        sldResult([
          { standard: '사내규정', clause: 'TR-CAP', title: '변압기 최소 용량', judgment: 'PASS', note: 'TR-1: 충족' },
          { standard: '사내규정', clause: 'TR-CAP', title: '변압기 최소 용량', judgment: 'FAIL', note: 'TR-2: 300<500 위반' },
        ]),
      ],
    });

    const merged = (teamResult.standards ?? []).filter((s) => s.clause === 'TR-CAP');
    expect(merged).toHaveLength(1);
    expect(merged[0].judgment).toBe('FAIL');
    expect(merged[0].note).toMatch(/TR-2/);
    expect(report.verdict).toBe('FAIL');
  });

  it('FAIL이 먼저 오면 뒤의 PASS가 덮지 못한다', async () => {
    const { teamResult } = await executeConsensusTeam({
      sessionId: 't', projectName: 't', projectType: 't',
      teamResults: [
        sldResult([
          { standard: 'KEC', clause: '232.52', title: '전압강하', judgment: 'FAIL', note: 'A→B 위반' },
          { standard: 'KEC', clause: '232.52', title: '전압강하', judgment: 'PASS', note: 'B→C 적합' },
        ]),
      ],
    });
    const merged = (teamResult.standards ?? []).filter((s) => s.clause === '232.52');
    expect(merged).toHaveLength(1);
    expect(merged[0].judgment).toBe('FAIL');
  });

  it('HOLD와 PASS 사이에선 HOLD가 남는다 (미판정을 적합으로 위장 금지)', async () => {
    const { teamResult } = await executeConsensusTeam({
      sessionId: 't', projectName: 't', projectType: 't',
      teamResults: [
        sldResult([
          { standard: 'KEC', clause: '311.1', title: '변압기 용량', judgment: 'PASS', note: 'TR-1' },
          { standard: 'KEC', clause: '311.1', title: '변압기 용량', judgment: 'HOLD', note: 'TR-2 정격 미상' },
        ]),
      ],
    });
    const merged = (teamResult.standards ?? []).filter((s) => s.clause === '311.1');
    expect(merged[0].judgment).toBe('HOLD');
  });

  it('서로 다른 조항은 병합되지 않는다', async () => {
    const { teamResult } = await executeConsensusTeam({
      sessionId: 't', projectName: 't', projectType: 't',
      teamResults: [
        sldResult([
          { standard: 'KEC', clause: '232.52', title: 'VD', judgment: 'PASS', note: '' },
          { standard: '사내규정', clause: '232.52', title: 'VD', judgment: 'FAIL', note: '' },
        ]),
      ],
    });
    // standard가 다르면 키가 달라 둘 다 생존
    expect((teamResult.standards ?? []).length).toBe(2);
  });
});
