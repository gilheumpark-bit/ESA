import type { Receipt } from '@engine/receipt/types';
import { anonymizeReceipt } from '../ipfs';

function receiptWithInputs(inputs: Record<string, unknown>): Receipt {
  return {
    id: 'receipt-1',
    calcId: 'voltage-drop',
    userId: 'firebase-user',
    countryCode: 'KR',
    appliedStandard: 'KEC',
    unitSystem: 'SI',
    difficultyLevel: 'basic',
    inputs,
    result: { value: 3.2, unit: '%', source: [] },
    steps: [],
    formulaUsed: 'x',
    standardsUsed: [],
    warnings: [],
    recommendations: [],
    disclaimerText: '',
    disclaimerVersion: 'v3.1',
    calculatedAt: '2026-07-20T00:00:00.000Z',
    standardVersion: 'KEC snapshot',
    engineVersion: '1.0.0',
    isStandardCurrent: false,
    receiptHash: 'abc123',
    isPublic: false,
  };
}

describe('IPFS receipt minimization', () => {
  test('removes nested identity, credential, and free-text contact data', () => {
    const receipt = receiptWithInputs({
      voltage: 380,
      conductor: 'Cu',
      customer: {
        email: 'person@example.com',
        profile: { phone_number: '010-1234-5678', apiKey: 'secret-key' },
      },
      notes: '현장 담당 person@example.com에게 연락',
      phases: [{ current: 12 }, { current: 14, clientName: '홍길동' }],
    });

    const minimized = anonymizeReceipt(receipt);
    const serialized = JSON.stringify(minimized.inputs);

    expect(minimized.inputs).toMatchObject({
      voltage: 380,
      conductor: 'Cu',
      phases: [{ current: 12 }, { current: 14 }],
    });
    expect(serialized).not.toContain('person@example.com');
    expect(serialized).not.toContain('010-1234-5678');
    expect(serialized).not.toContain('secret-key');
    expect(serialized).not.toContain('홍길동');
  });
});
