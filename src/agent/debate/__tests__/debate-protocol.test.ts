import { detectDisagreements, executeDebateRound, runDebate, validatePhysicsLaw, buildEscalation } from '../debate-protocol';
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
  standards: [{ standard: 'KEC', clause: '232.52', title: 'VD', judgment: 'PASS' as const }],
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
