import type { NormalizedElectricalGraph, NormalizedSpec } from '../domain-normalizer';
import { getCalculator } from '@/engine/calculators';
import { routeDrawingCalculations } from '../drawing-calculation-router';

const DRAWING_HASH = 'd'.repeat(64);
const OWNER = 'VCB-01';

type ExtraField = 'efficiency' | 'maxLoadCurrent_A' | 'leadLength_m' | 'leadSize_mm2' | 'ctAccuracyClass';

function spec(field: NormalizedSpec['field'] | ExtraField, value: number | string, unit: string, overrides: Partial<NormalizedSpec> = {}): NormalizedSpec {
  return {
    drawingHash: DRAWING_HASH,
    ownerId: OWNER,
    field,
    value,
    unit,
    raw: `${field} ${value}${unit}`,
    evidenceId: `evidence:${field}`,
    originalEvidenceIds: [`original:${field}`],
    sourceIds: [`source:${field}`],
    bounds: { page: 1, x: 10, y: 10, w: 10, h: 10 },
    confidence: 0.9,
    ...overrides,
  } as unknown as NormalizedSpec;
}

function completeSpecs(): NormalizedSpec[] {
  return [
    spec('voltage_V', 380, 'V'),
    spec('current_A', 120, 'A'),
    spec('loadCurrent_A', 120, 'A'),
    spec('faultCurrent_kA', 25, 'kA'),
    spec('cableAmpacity_A', 150, 'A'),
    spec('length_m', 80, 'm'),
    spec('conductorSize_mm2', 35, 'mm2'),
    spec('conductorMaterial', 'Cu', 'material'),
    spec('powerFactor', 0.9, 'factor'),
    spec('phase', 3, 'phase'),
    spec('totalLoad_kW', 100, 'kW'),
    spec('efficiency', 0.95, 'factor'),
    spec('demandFactor', 0.8, 'factor'),
    spec('safetyMargin', 0.1, 'factor'),
    spec('maxLoadCurrent_A', 120, 'A'),
    spec('burden_VA', 10, 'VA'),
    spec('leadLength_m', 30, 'm'),
    spec('leadSize_mm2', 2.5, 'mm2'),
    spec('ctAccuracyClass', '5P', 'text'),
  ];
}

function normalized(specs: NormalizedSpec[]): NormalizedElectricalGraph {
  return {
    drawingHash: DRAWING_HASH,
    specs,
    warnings: [],
    graph: { conflicts: [] } as unknown as NormalizedElectricalGraph['graph'],
  };
}

describe('routeDrawingCalculations', () => {
  it('calls each real calculator only with complete, source-backed typed adapter inputs and keeps HOLD', () => {
    const receipts = routeDrawingCalculations(normalized(completeSpecs()));

    expect(receipts).toHaveLength(4);
    expect(receipts.map((receipt) => [receipt.calculatorId, receipt.status, receipt.judgment])).toEqual([
      ['breaker-sizing', 'CALCULATED', 'HOLD'],
      ['ct-sizing', 'CALCULATED', 'HOLD'],
      ['transformer-capacity', 'CALCULATED', 'HOLD'],
      ['voltage-drop', 'CALCULATED', 'HOLD'],
    ]);
    const voltageDrop = receipts.find((receipt) => receipt.calculatorId === 'voltage-drop');
    expect(voltageDrop?.inputEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ adapterField: 'voltage', normalizedField: 'voltage_V', sourceUnit: 'V', targetUnit: 'V', transform: 'identity' }),
      expect.objectContaining({ adapterField: 'conductor', normalizedField: 'conductorMaterial', value: 'Cu' }),
    ]));
    const withoutMargin = routeDrawingCalculations(normalized(completeSpecs().filter((item) => item.field !== 'safetyMargin')))
      .find((receipt) => receipt.calculatorId === 'transformer-capacity');
    expect(withoutMargin?.optionalDefaultsUsed).toEqual([
      expect.objectContaining({ name: 'growthMargin', value: 0, meaning: expect.stringContaining('calculator-internal') }),
    ]);
  });

  it('skips missing required input without invoking a calculator', () => {
    const receipts = routeDrawingCalculations(normalized(completeSpecs().filter((item) => item.field !== 'voltage_V')));
    const breaker = receipts.find((receipt) => receipt.calculatorId === 'breaker-sizing');
    const voltage = receipts.find((receipt) => receipt.calculatorId === 'voltage-drop');

    expect(breaker).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD', calculatorResult: undefined });
    expect(voltage).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD', calculatorResult: undefined });
    expect(breaker?.missingInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'voltage' })]));
  });

  it('does not substitute breaking capacity for prospective fault current', () => {
    const specs = completeSpecs().filter((item) => item.field !== 'faultCurrent_kA');
    specs.push(spec('breaking_kA', 25, 'kA'));
    const receipt = routeDrawingCalculations(normalized(specs)).find((item) => item.calculatorId === 'breaker-sizing');

    expect(receipt).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD', calculatorResult: undefined });
    expect(receipt?.missingInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'shortCircuitCurrent' })]));
  });

  it('fails closed on conflicting values and deduplicates same-lineage canonical evidence deterministically', () => {
    const ambiguous = [...completeSpecs(), spec('loadCurrent_A', 130, 'A', { evidenceId: 'evidence:load-conflict' })];
    const skipped = routeDrawingCalculations(normalized(ambiguous)).find((item) => item.calculatorId === 'breaker-sizing');
    expect(skipped).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
    expect(skipped?.ambiguousInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'loadCurrent' })]));

    const duplicate = spec('loadCurrent_A', 120, 'A', { evidenceId: 'evidence:load-duplicate' });
    const forward = routeDrawingCalculations(normalized([...completeSpecs(), duplicate]));
    const backward = routeDrawingCalculations(normalized([duplicate, ...completeSpecs().reverse()]));
    expect(backward).toEqual(forward);
  });

  it('treats missing normalizer fields and malformed provenance as missing evidence', () => {
    const specs = completeSpecs()
      .filter((item) => String(item.field) !== 'efficiency')
      .map((item) => String(item.field) === 'leadLength_m' ? { ...item, sourceIds: [] } : item);
    const receipts = routeDrawingCalculations(normalized(specs));

    expect(receipts.find((item) => item.calculatorId === 'transformer-capacity')).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
    expect(receipts.find((item) => item.calculatorId === 'ct-sizing')).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
  });

  it('redacts calculator errors and reports unavailable registry entries as ERROR/HOLD', () => {
    const lookup = (id: string) => id === 'breaker-sizing'
      ? { ...getCalculator(id)!, calculator: () => { throw new Error('token=secret raw OCR /C:/private'); } }
      : undefined;
    const receipts = routeDrawingCalculations(normalized(completeSpecs()), { getCalculator: lookup });
    const breaker = receipts.find((item) => item.calculatorId === 'breaker-sizing');
    const voltage = receipts.find((item) => item.calculatorId === 'voltage-drop');

    expect(breaker).toMatchObject({ status: 'ERROR', judgment: 'HOLD', error: { code: 'CALCULATOR_EXECUTION_FAILED', message: 'Calculator execution failed.' } });
    expect(JSON.stringify(breaker)).not.toMatch(/secret|OCR|private|stack/i);
    expect(voltage).toMatchObject({ status: 'ERROR', judgment: 'HOLD', error: { code: 'CALCULATOR_UNAVAILABLE' } });
  });
});
