import type { ElectricalUnit, NormalizedElectricalGraph, NormalizedSpec } from '../domain-normalizer';
import { normalizeElectricalGraph } from '../domain-normalizer';
import type { SpatialEvidenceGraph, SpatialSymbol, SpatialText } from '../../vision/spatial-graph';
import { getCalculator } from '@/engine/calculators';
import { routeDrawingCalculations } from '../drawing-calculation-router';

const DRAWING_HASH = 'd'.repeat(64);

function bounds(x: number, page = 1) {
  return { page, x, y: 0, w: 10, h: 10 };
}

function symbol(id: string, type: string, x: number): SpatialSymbol {
  return {
    id,
    originalEvidenceId: `symbol:${id}`,
    originalEvidenceIds: [`symbol:${id}`],
    sourceIds: [`source:symbol:${id}`],
    typeCandidates: [type],
    rawLabel: id,
    bounds: bounds(x),
    ports: [],
    confidence: 0.9,
  };
}

function text(id: string, raw: string, x: number): SpatialText {
  return {
    id,
    originalEvidenceId: `text:${id}`,
    originalEvidenceIds: [`text:${id}`],
    sourceIds: [`source:text:${id}`],
    raw,
    candidates: [raw],
    bounds: bounds(x),
    confidence: 0.9,
  };
}

function graph(): SpatialEvidenceGraph {
  return {
    drawingHash: DRAWING_HASH,
    symbols: [symbol('CABLE-01', 'CABLE', 0), symbol('VCB-01', 'VCB', 100), symbol('TR-01', 'TRANSFORMER', 200), symbol('CT-01', 'CT', 300)],
    lines: [],
    texts: [],
    junctions: [],
    crossovers: [],
    edges: [],
    textLinks: [],
    conflicts: [],
  };
}

function spec(ownerId: string, field: NormalizedSpec['field'], value: number | string, unit: ElectricalUnit, x: number): NormalizedSpec {
  return {
    drawingHash: DRAWING_HASH,
    ownerId,
    field,
    value,
    unit,
    raw: `${field} ${value}${unit}`,
    evidenceId: `text:${ownerId}:${field}`,
    originalEvidenceIds: [`original:${ownerId}:${field}`],
    sourceIds: [`source:${ownerId}:${field}`],
    bounds: bounds(x),
    confidence: 0.9,
  };
}

function completeSpecs(): NormalizedSpec[] {
  return [
    spec('CABLE-01', 'voltage_V', 380, 'V', 0), spec('CABLE-01', 'current_A', 120, 'A', 0), spec('CABLE-01', 'length_m', 80, 'm', 0),
    spec('CABLE-01', 'conductorSize_mm2', 35, 'mm2', 0), spec('CABLE-01', 'conductorMaterial', 'Cu', 'material', 0), spec('CABLE-01', 'powerFactor', 0.9, 'factor', 0), spec('CABLE-01', 'phase', 3, 'phase', 0),
    spec('VCB-01', 'voltage_V', 380, 'V', 100), spec('VCB-01', 'loadCurrent_A', 120, 'A', 100), spec('VCB-01', 'faultCurrent_kA', 25, 'kA', 100), spec('VCB-01', 'cableAmpacity_A', 150, 'A', 100),
    spec('TR-01', 'totalLoad_kW', 100, 'kW', 200), spec('TR-01', 'powerFactor', 0.9, 'factor', 200), spec('TR-01', 'efficiency', 0.95, 'factor', 200), spec('TR-01', 'demandFactor', 0.8, 'factor', 200), spec('TR-01', 'safetyMargin', 0.1, 'factor', 200),
    spec('CT-01', 'maxLoadCurrent_A', 120, 'A', 300), spec('CT-01', 'burden_VA', 10, 'VA', 300), spec('CT-01', 'leadLength_m', 30, 'm', 300), spec('CT-01', 'leadSize_mm2', 2.5, 'mm2', 300), spec('CT-01', 'ctAccuracyClass', '5P', 'text', 300),
  ];
}

function normalized(specs: NormalizedSpec[]): NormalizedElectricalGraph {
  const source = graph();
  source.texts = specs.map((item): SpatialText => ({
    id: item.evidenceId,
    originalEvidenceId: item.originalEvidenceIds[0],
    originalEvidenceIds: [...item.originalEvidenceIds],
    sourceIds: [...item.sourceIds],
    raw: item.raw,
    candidates: [item.raw],
    bounds: { ...item.bounds },
    confidence: item.confidence,
  }));
  return { drawingHash: DRAWING_HASH, graph: source, specs, warnings: [] };
}

function receiptFor(receipts: ReturnType<typeof routeDrawingCalculations>, calculatorId: string, ownerId: string) {
  return receipts.find((receipt) => receipt.calculatorId === calculatorId && receipt.scopeKey.startsWith(`${ownerId}@`));
}

describe('routeDrawingCalculations', () => {
  it('calls all four real calculators only from complete graph-backed normalized evidence and keeps HOLD', () => {
    const receipts = routeDrawingCalculations(normalized(completeSpecs()));

    expect(receiptFor(receipts, 'voltage-drop', 'CABLE-01')).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(receiptFor(receipts, 'breaker-sizing', 'VCB-01')).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(receiptFor(receipts, 'transformer-capacity', 'TR-01')).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(receiptFor(receipts, 'ct-sizing', 'CT-01')).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(receiptFor(receipts, 'voltage-drop', 'CABLE-01')?.inputEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ adapterField: 'voltage', normalizedField: 'voltage_V', sourceUnit: 'V', targetUnit: 'V', transform: 'identity' }),
      expect.objectContaining({ adapterField: 'conductor', normalizedField: 'conductorMaterial', value: 'Cu' }),
    ]));
  });

  it('skips missing required input without invoking that calculator', () => {
    const receipt = receiptFor(routeDrawingCalculations(normalized(completeSpecs().filter((item) => !(item.ownerId === 'VCB-01' && item.field === 'voltage_V')))), 'breaker-sizing', 'VCB-01');

    expect(receipt).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD', calculatorResult: undefined });
    expect(receipt?.missingInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'voltage' })]));
  });

  it('does not substitute breaking capacity for prospective fault current', () => {
    const specs = completeSpecs().filter((item) => !(item.ownerId === 'VCB-01' && item.field === 'faultCurrent_kA'));
    specs.push(spec('VCB-01', 'breaking_kA', 25, 'kA', 100));
    const receipt = receiptFor(routeDrawingCalculations(normalized(specs)), 'breaker-sizing', 'VCB-01');

    expect(receipt).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD', calculatorResult: undefined });
    expect(receipt?.missingInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'shortCircuitCurrent' })]));
  });

  it('fails closed on conflicting values and preserves deterministic duplicate lineage', () => {
    const ambiguous = [...completeSpecs(), spec('VCB-01', 'loadCurrent_A', 130, 'A', 100)];
    const skipped = receiptFor(routeDrawingCalculations(normalized(ambiguous)), 'breaker-sizing', 'VCB-01');
    expect(skipped).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
    expect(skipped?.ambiguousInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'loadCurrent' })]));

    const duplicate = { ...spec('VCB-01', 'loadCurrent_A', 120, 'A', 100), evidenceId: 'text:VCB-01:load-duplicate' };
    const forward = routeDrawingCalculations(normalized([...completeSpecs(), duplicate]));
    const backward = routeDrawingCalculations(normalized([duplicate, ...completeSpecs().reverse()]));
    expect(backward).toEqual(forward);
  });

  it('discloses calculator defaults and refuses evidence with missing provenance', () => {
    const withoutMargin = receiptFor(
      routeDrawingCalculations(normalized(completeSpecs().filter((item) => !(item.ownerId === 'TR-01' && item.field === 'safetyMargin')))),
      'transformer-capacity',
      'TR-01',
    );
    const malformed = completeSpecs().map((item) => item.ownerId === 'VCB-01' && item.field === 'voltage_V' ? { ...item, sourceIds: [] } : item);
    const skipped = receiptFor(routeDrawingCalculations(normalized(malformed)), 'breaker-sizing', 'VCB-01');

    expect(withoutMargin).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(withoutMargin?.optionalDefaultsUsed).toEqual([
      expect.objectContaining({ name: 'growthMargin', value: 0, meaning: expect.stringContaining('calculator-internal') }),
    ]);
    expect(skipped).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
    expect(skipped?.missingInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'voltage' })]));
  });

  it('skips foreign, missing, and cross-page owner contexts before registry lookup', () => {
    const calls: string[] = [];
    const lookup = (id: string) => { calls.push(id); return getCalculator(id); };
    const foreign = completeSpecs().filter((item) => item.ownerId === 'VCB-01').map((item) => ({ ...item, ownerId: 'NOT-IN-GRAPH' }));
    const crossPage = completeSpecs().filter((item) => item.ownerId === 'TR-01').map((item) => ({ ...item, bounds: bounds(200, 2) }));
    const missing = completeSpecs().filter((item) => item.ownerId === 'CT-01').map(({ ownerId: _ownerId, ...item }) => item);
    const receipts = routeDrawingCalculations(normalized([...foreign, ...crossPage, ...missing]), { getCalculator: lookup });

    expect(calls).toEqual([]);
    expect(receipts).toHaveLength(12);
    expect(receipts.every((receipt) => receipt.status === 'SKIPPED' && receipt.judgment === 'HOLD')).toBe(true);
    expect(receipts.every((receipt) => receipt.scopeIssues.some((issue) => issue.startsWith('OWNER_CONTEXT_UNRESOLVED:')))).toBe(true);
  });

  it('uses actual normalizer output without invented fields and never turns unresolved owners into calculations', () => {
    const source = graph();
    source.texts = [text('TEXT-01', '부하전류 120A 단락전류 25kA 380V', 1_000)];
    const result = normalizeElectricalGraph(source);
    const receipts = routeDrawingCalculations(result);

    expect(receipts.every((receipt) => receipt.status === 'SKIPPED')).toBe(true);
    expect(receipts.every((receipt) => receipt.judgment === 'HOLD')).toBe(true);
    expect(receipts.every((receipt) => receipt.scopeIssues.some((issue) => issue.startsWith('OWNER_CONTEXT_UNRESOLVED:unresolved@')))).toBe(true);
  });

  it('redacts calculator errors and reports unavailable registry entries as ERROR/HOLD', () => {
    const lookup = (id: string) => id === 'breaker-sizing'
      ? { ...getCalculator(id)!, calculator: () => { throw new Error('token=secret raw OCR /C:/private'); } }
      : undefined;
    const receipts = routeDrawingCalculations(normalized(completeSpecs()), { getCalculator: lookup });
    const breaker = receiptFor(receipts, 'breaker-sizing', 'VCB-01');
    const voltage = receiptFor(receipts, 'voltage-drop', 'CABLE-01');

    expect(breaker).toMatchObject({ status: 'ERROR', judgment: 'HOLD', error: { code: 'CALCULATOR_EXECUTION_FAILED', message: 'Calculator execution failed.' } });
    expect(JSON.stringify(breaker)).not.toMatch(/secret|OCR|private|stack/i);
    expect(voltage).toMatchObject({ status: 'ERROR', judgment: 'HOLD', error: { code: 'CALCULATOR_UNAVAILABLE' } });
  });
});
