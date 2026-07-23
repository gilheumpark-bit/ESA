import { IsolationMatrix } from '../isolation';

describe('IsolationMatrix audit retention', () => {
  test('keeps only the newest bounded audit records', () => {
    const matrix = new IsolationMatrix();

    for (let index = 0; index < 1_100; index += 1) {
      matrix.logCrossAccess(
        'kr-electrical',
        'us-electrical',
        `bridge-${index}`,
      );
    }

    const log = matrix.getAuditLog();
    expect(log).toHaveLength(1_000);
    expect(log[0].reason).toBe('bridge-100');
    expect(log.at(-1)?.reason).toBe('bridge-1099');
  });
});
