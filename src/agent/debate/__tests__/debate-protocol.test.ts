import { detectDisagreements, runDebate, validatePhysicsLaw, buildEscalation } from '../debate-protocol';
import type { TeamResult } from '../../teams/types';

const makeTeamResult = (teamId: string, calcs: { id: string; value: number }[]): TeamResult => ({
  teamId: teamId as TeamResult['teamId'],
  success: true,
  confidence: 0.9,
  durationMs: 100,
  calculations: calcs.map(c => ({
    id: c.id,
    calculatorId: c.id,
    label: c.id,
    value: c.value,
    unit: '%',
    compliant: true,
  })),
  standards: [{ standard: 'KEC', clause: '232.3.9', title: 'VD', judgment: 'PASS' as const }],
});

describe('detectDisagreements', () => {
  test('no disagreement when values match', () => {
    const results = [
      makeTeamResult('TEAM-SLD', [{ id: 'vd', value: 2.5 }]),
      makeTeamResult('TEAM-STD', [{ id: 'vd', value: 2.5 }]),
    ];
    expect(detectDisagreements(results, 0.1)).toHaveLength(0);
  });

  test('detects disagreement above tolerance', () => {
    const results = [
      makeTeamResult('TEAM-SLD', [{ id: 'vd', value: 2.5 }]),
      makeTeamResult('TEAM-STD', [{ id: 'vd', value: 3.5 }]),
    ];
    const dis = detectDisagreements(results, 0.1);
    expect(dis).toHaveLength(1);
    expect(dis[0].maxDeviationPercent).toBeGreaterThan(10);
  });

  test('handles teams with no calculations', () => {
    const results: TeamResult[] = [
      { teamId: 'TEAM-SLD', success: true, confidence: 0.9, durationMs: 100 },
      makeTeamResult('TEAM-STD', [{ id: 'vd', value: 2.5 }]),
    ];
    expect(detectDisagreements(results)).toHaveLength(0);
  });

  /**
   * 도면팀은 장치마다 한 줄씩 낸다 — 차단기 두 대(100 A·400 A)는 같은 계산기 이름을
   * 달고 있어도 서로 다른 대상이다. 계산기 이름만으로 묶으면 한 팀이 자기 자신과
   * "불일치"한 것이 되고, 그 가짜 토론이 합의 실패 → 치명 위반 → FAIL 로 이어졌다.
   */
  const breaker = (id: string, value: number): NonNullable<TeamResult['calculations']>[number] => ({
    id,
    calculatorId: 'breaker-sizing',
    label: id,
    value,
    unit: 'A',
    compliant: null,
  });
  const teamWith = (teamId: TeamResult['teamId'], calculations: TeamResult['calculations']): TeamResult => ({
    teamId, success: true, confidence: 0.9, durationMs: 100, calculations,
  });

  test('한 팀이 낸 서로 다른 장치의 값은 불일치가 아니다', () => {
    const results = [
      teamWith('TEAM-SLD', [breaker('calc-br-cb1', 100), breaker('calc-br-cb2', 400)]),
      teamWith('TEAM-STD', []),
    ];

    expect(detectDisagreements(results, 0.1)).toEqual([]);
    expect(runDebate(results)).toEqual([]);
  });

  test('어느 장치를 가리키는지 알 수 없는 값끼리는 비교하지 않는다', () => {
    const results = [
      teamWith('TEAM-SLD', [breaker('calc-br-cb1', 100), breaker('calc-br-cb2', 400)]),
      teamWith('TEAM-STD', [breaker('calc-breaker', 125)]),
    ];

    expect(detectDisagreements(results, 0.1)).toEqual([]);
  });

  test('두 팀이 같은 대상을 같은 id 로 냈으면 장치가 여럿이어도 대상별로 비교한다', () => {
    const results = [
      teamWith('TEAM-SLD', [breaker('cb1', 100), breaker('cb2', 400)]),
      teamWith('TEAM-STD', [breaker('cb1', 100), breaker('cb2', 250)]),
    ];

    const found = detectDisagreements(results, 0.1);
    expect(found).toHaveLength(1);
    expect(found[0].entries.map((e) => e.value).sort((a, b) => a - b)).toEqual([250, 400]);
    expect(new Set(found[0].entries.map((e) => e.teamId)).size).toBe(2);
  });
});

describe('validatePhysicsLaw', () => {
  test('V=IR passes for correct values', () => {
    const result = validatePhysicsLaw('current_A', 10, { voltage_V: 100, resistance_ohm: 10 });
    expect(result.valid).toBe(true);
  });

  test('V=IR fails for incorrect current', () => {
    const result = validatePhysicsLaw('current_A', 50, { voltage_V: 100, resistance_ohm: 10 });
    expect(result.valid).toBe(false);
    expect(result.law).toContain('V=IR');
    expect(result.expected).toBe(10);
  });

  test('P=VI passes for correct power', () => {
    const result = validatePhysicsLaw('power_W', 1000, { voltage_V: 100, current_A: 10 });
    expect(result.valid).toBe(true);
  });

  test('P=VI fails for incorrect power', () => {
    const result = validatePhysicsLaw('power_W', 500, { voltage_V: 100, current_A: 10 });
    expect(result.valid).toBe(false);
    expect(result.law).toContain('P=VI');
  });

  test('unknown parameter always valid', () => {
    const result = validatePhysicsLaw('unknown_param', 42, {});
    expect(result.valid).toBe(true);
  });
});

describe('runDebate', () => {
  test('returns empty for no disagreements', () => {
    const results = [
      makeTeamResult('TEAM-SLD', [{ id: 'vd', value: 2.5 }]),
      makeTeamResult('TEAM-STD', [{ id: 'vd', value: 2.5 }]),
    ];
    expect(runDebate(results)).toHaveLength(0);
  });

  test('produces debate result for disagreement', () => {
    const results = [
      makeTeamResult('TEAM-SLD', [{ id: 'vd', value: 2.5 }]),
      makeTeamResult('TEAM-STD', [{ id: 'vd', value: 4.0 }]),
    ];
    const debates = runDebate(results);
    expect(debates).toHaveLength(1);
    expect(debates[0].totalRounds).toBeGreaterThanOrEqual(1);
    expect(debates[0].finalPosition).toBeTruthy();
  });

  test('does not turn two contradictory valid calculations into consensus', () => {
    const results = [
      makeTeamResult('TEAM-SLD', [{ id: 'vd', value: 2.5 }]),
      makeTeamResult('TEAM-STD', [{ id: 'vd', value: 4.0 }]),
    ];

    const debates = runDebate(results);

    expect(debates).toHaveLength(1);
    expect(debates[0].finalConsensus).toBe(false);
    expect(debates[0].maxRoundsReached).toBe(true);
    expect(buildEscalation(debates)?.requiresHumanReview).toBe(true);
  });

  test('전압강하 합의 실패 시 높은 값을 보수값으로 채택한다', () => {
    const debates = runDebate([
      makeTeamResult('TEAM-SLD', [{ id: 'voltage-drop', value: 2.5 }]),
      makeTeamResult('TEAM-STD', [{ id: 'voltage-drop', value: 4.0 }]),
    ], {
      maxRounds: 1,
      requiredAgreement: 1,
      tolerancePercent: 0.1,
      escalateOnFailure: true,
    });

    expect(debates[0].finalConsensus).toBe(false);
    expect(debates[0].finalPosition).toContain('4');
  });

  test('accepts only the numeric majority cluster and records the outlier', () => {
    const results = [
      makeTeamResult('TEAM-SLD', [{ id: 'vd', value: 2.5 }]),
      makeTeamResult('TEAM-LAYOUT', [{ id: 'vd', value: 2.501 }]),
      makeTeamResult('TEAM-STD', [{ id: 'vd', value: 4.0 }]),
    ];

    const debates = runDebate(results, {
      maxRounds: 1,
      requiredAgreement: 0.66,
      tolerancePercent: 0.1,
      escalateOnFailure: true,
    });

    expect(debates).toHaveLength(1);
    expect(debates[0].finalConsensus).toBe(true);
    expect(debates[0].rounds[0].dissenters).toContain('TEAM-STD');
  });
});

describe('buildEscalation', () => {
  test('returns null when all consensus reached', () => {
    const debates = [{ topic: 'test', rounds: [], finalConsensus: true, finalPosition: 'ok', totalRounds: 1, maxRoundsReached: false, participatingTeams: ['TEAM-SLD' as const] }];
    expect(buildEscalation(debates)).toBeNull();
  });

  test('returns escalation info when consensus fails', () => {
    const debates = [{
      topic: 'vd',
      rounds: [{ roundNumber: 1, topic: 'vd', arguments: [], consensus: false, dissenters: ['TEAM-SLD' as const] }],
      finalConsensus: false,
      finalPosition: '2.5% (보수적)',
      totalRounds: 3,
      maxRoundsReached: true,
      participatingTeams: ['TEAM-SLD' as const, 'TEAM-STD' as const],
      dissenterReport: '3건 합의 실패 (최대 15.00% 불일치)',
    }];
    const esc = buildEscalation(debates);
    expect(esc).not.toBeNull();
    expect(esc!.requiresHumanReview).toBe(true);
    expect(esc!.dissentingTeams.length).toBeGreaterThan(0);
  });
});
