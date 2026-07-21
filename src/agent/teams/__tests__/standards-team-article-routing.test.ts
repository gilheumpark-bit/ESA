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
});
