import type { DrawingSynthesis } from '@/agent/electrical/synthesis';

import { adaptDrawingCalculations } from '../calculation-adapter';

describe('drawing calculation receipt adapter', () => {
  it('preserves calculator result and evidence while keeping design compliance on HOLD', () => {
    const synthesis = {
      calculations: [{
        id: 'calc-1', calculatorId: 'breaker-sizing', scopeKey: 'VCB-01@p1',
        status: 'CALCULATED', judgment: 'HOLD', missingInputs: [], ambiguousInputs: [],
        inputEvidence: [{ evidenceId: 'spec-1', originalEvidenceIds: ['txt-1'], sourceIds: ['variant:text'], adapterField: 'loadCurrent', normalizedField: 'current_A', value: 80, sourceUnit: 'A', targetUnit: 'A', bounds: { page: 1, x: 1, y: 2, w: 3, h: 4 }, confidence: 0.95, transform: 'identity' }],
        optionalDefaultsUsed: [], internalMechanics: [], scopeIssues: [],
        calculatorResult: { value: 100, unit: 'A' },
      }],
    } as unknown as DrawingSynthesis;

    const [calculation] = adaptDrawingCalculations(synthesis);

    expect(calculation).toMatchObject({
      id: 'calc-1', calculatorId: 'breaker-sizing', value: 100, unit: 'A',
      compliant: null, evidenceIds: ['spec-1', 'txt-1'],
    });
    expect(calculation.receiptHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('turns missing inputs into an explicit HOLD note without inventing a value', () => {
    const synthesis = {
      calculations: [{
        id: 'calc-2', calculatorId: 'voltage-drop', scopeKey: 'LINE-01@p1',
        status: 'SKIPPED', judgment: 'HOLD',
        missingInputs: [{ adapterField: 'length', normalizedFields: ['length_m'] }],
        ambiguousInputs: [], inputEvidence: [], optionalDefaultsUsed: [], internalMechanics: [], scopeIssues: [],
      }],
    } as unknown as DrawingSynthesis;

    expect(adaptDrawingCalculations(synthesis)[0]).toMatchObject({
      value: undefined, compliant: null, evidenceIds: [],
      note: expect.stringContaining('length'),
    });
  });
});
