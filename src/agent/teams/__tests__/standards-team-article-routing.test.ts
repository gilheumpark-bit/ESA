import { executeStandardsTeam } from '../standards-team';
import type { TeamInput } from '../types';

function input(query: string): TeamInput {
  return { query, params: {} } as TeamInput;
}

describe('TEAM-STD article routing', () => {
  test('returns an NEC article through the NEC registry', async () => {
    const result = await executeStandardsTeam(input('NEC 310.16'));

    expect(result.success).toBe(true);
    expect(result.standards).toEqual(expect.arrayContaining([
      expect.objectContaining({ standard: 'NEC', clause: '310.16' }),
    ]));
  });

  test('returns an IEC article through the IEC registry', async () => {
    const result = await executeStandardsTeam(input('IEC 411.3.2'));

    expect(result.success).toBe(true);
    expect(result.standards).toEqual(expect.arrayContaining([
      expect.objectContaining({ standard: 'IEC 60364', clause: '411.3.2' }),
    ]));
  });

  test('does not report success when an explicit article is absent', async () => {
    const result = await executeStandardsTeam(input('NEC 999.9'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('NEC 999.9');
  });

  test('전압강하 부적합 문구의 적합 부분문자열을 PASS로 오인하지 않는다', async () => {
    const result = await executeStandardsTeam({
      ...input('전압강하 판정'),
      params: { voltageDropPercent: 5, circuitType: 'branch' },
    });

    expect(result.standards).toEqual(expect.arrayContaining([
      expect.objectContaining({ standard: 'KEC', clause: '232.52', judgment: 'FAIL' }),
    ]));
    expect(result.calculations).toEqual(expect.arrayContaining([
      expect.objectContaining({ calculatorId: 'voltage-drop-judgment', compliant: false }),
    ]));
  });
});
