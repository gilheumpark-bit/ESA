import { createHash } from 'crypto';
import { canonicalize } from '@/engine/receipt/receipt-hash';
import { executeConsensusTeam } from '../consensus-team';

describe('consensus report integrity', () => {
  test('seals the complete report and records real in-report evidence IDs', async () => {
    const { report } = await executeConsensusTeam({
      sessionId: 'integrity-test',
      projectName: 'Integrity',
      projectType: 'SLD',
      teamResults: [{
        teamId: 'TEAM-STD',
        success: true,
        confidence: 0.9,
        durationMs: 1,
        calculations: [{
          id: 'calc-vd-1',
          calculatorId: 'voltage-drop',
          label: '전압강하',
          value: 2.4,
          unit: '%',
          compliant: true,
          standardRef: 'KEC 232.52',
        }],
      }],
    });

    const { hash, ...claim } = report;
    const expected = createHash('sha256').update(canonicalize(claim)).digest('hex');

    expect(hash).toBe(expected);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(report).toHaveProperty(
      'evidenceIds',
      expect.arrayContaining(['team:TEAM-STD', 'calculation:calc-vd-1']),
    );
    expect(report).not.toHaveProperty('receiptIds');
  });
});
