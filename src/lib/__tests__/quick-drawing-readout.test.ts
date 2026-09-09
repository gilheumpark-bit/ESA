import { parseSLDResponse, generateCalcChainFromSLD, generateSuggestions, type SLDAnalysis } from '../sld-recognition';
import { buildQuickDrawingReadout, quickFieldRead } from '../quick-drawing-readout';
import { prepareDrawingCalculationInputs } from '../drawing-calculation-inputs';
import { CALCULATOR_PARAMS } from '../calculator-params';
import type { ExtendedParamDef } from '@/components/CalculatorForm';

const analysis = (): SLDAnalysis => parseSLDResponse(JSON.stringify({ confidence: 1, components: [
  { id: 'known', type: 'breaker', label: 'QF1', current: '100A', position: { x: 20, y: 20 }, certainty: 'confirmed' },
  { id: 'unread', type: 'unsupported-device', position: { x: 80, y: 20 } },
], connections: [{ id: 'c1', from: 'known', to: 'unread' }] }));

it('does not drop a detected unknown or fabricate a load', () => {
  expect(analysis().components[1]).toMatchObject({ type: 'unknown', typeCandidates: ['unsupported-device'], position: { x: 80, y: 20 } });
  expect(analysis().connections).toHaveLength(1);
});
it('missing type with valid coordinates remains visible', () => {
  const result = parseSLDResponse(JSON.stringify({ components: [{ id: 'a', position: { x: 1, y: 2 } }], connections: [] }));
  expect(result.components).toHaveLength(1); expect(result.components[0].type).toBe('unknown');
});
it('global confidence and untrusted certainty never certify quick fields', () => {
  const read = buildQuickDrawingReadout(analysis());
  expect(read.components[0].type.certainty).toBe('ambiguous');
  expect(read.components[1].type.certainty).toBe('unread');
  expect(read.counts.components).toEqual({ confirmed: 0, ambiguous: 1, unread: 1, total: 2 });
  expect(read.completeness).toBe('not-verified');
});
it('keeps per-field absence distinct from type and current candidates', () => {
  const item = buildQuickDrawingReadout(analysis()).components[0];
  expect(item.fields.current.certainty).toBe('ambiguous');
  expect(item.fields.voltage).toEqual({ certainty: 'unread', reason: 'VALUE_NOT_READ' });
});
it.each([undefined, null, '', '  ', false, NaN, Infinity, {}])('missing or invalid field %p is unread, not zero', (value) => {
  expect(quickFieldRead(value).certainty).toBe('unread');
});
it.each([0, '0', '100A'])('present %p is a review candidate, not independently confirmed', (value) => {
  expect(quickFieldRead(value).certainty).toBe('ambiguous');
});
it('older DXF load fallbacks remain unknown when accompanied by unresolved block evidence', () => {
  const doc = analysis(); doc.components[1] = { ...doc.components[1], type: 'load', properties: { blockName: 'CUSTOM' } };
  doc.unknownSymbols = [{ blockName: 'CUSTOM', fingerprint: null, count: 1, samplePosition: { x: 80, y: 20 } }];
  expect(buildQuickDrawingReadout(doc).components[1].type.certainty).toBe('unread');
});
it('a missing endpoint is unread; an unknown endpoint cannot yield a confirmed connection', () => {
  const doc = analysis(); doc.connections.push({ id: 'missing', from: 'known', to: 'absent' });
  expect(buildQuickDrawingReadout(doc).connections.map((item) => item.relation.certainty)).toEqual(['ambiguous', 'unread']);
});
it('truncated extraction cannot be relabelled as complete', () => {
  expect(buildQuickDrawingReadout({ ...analysis(), partial: true }).completeness).toBe('partial');
});
it('load list preserves unread rows and does not sum only readable ratings', () => {
  const doc = analysis(); doc.components = ['10kW', undefined].map((rating, index) => ({ id: `l${index}`, type: 'load', rating, position: { x: index, y: 1 } }));
  const step = generateCalcChainFromSLD(doc).find((item) => item.calculatorId === 'max-demand')!;
  expect(step.inputs.loads).toEqual([{ name: 'l0', ratedPower: 10 }, { name: 'l1', ratedPower: undefined }]);
  expect(prepareDrawingCalculationInputs(CALCULATOR_PARAMS['max-demand'], step.inputs).ready).toBe(false);
  expect(generateSuggestions(doc).find((item) => item.calculatorId === 'demand-diversity')?.inputs).toEqual({});
});
it('unknown equipment prevents a misleading complete load scope', () => {
  const doc = analysis(); doc.components.push({ id: 'l', type: 'load', rating: '1kW', position: { x: 1, y: 1 } });
  expect(generateCalcChainFromSLD(doc).find((item) => item.calculatorId === 'max-demand')?.holdReasons).toHaveLength(1);
});

describe('explicit drawing calculation input contract', () => {
  const defs: ExtendedParamDef[] = [{ name: 'voltage', type: 'number', defaultValue: 380, min: 0 }, { name: 'enabled', type: 'boolean', defaultValue: true }];
  it('does not silently populate calculator defaults', () => {
    expect(prepareDrawingCalculationInputs(defs, {})).toEqual({ input: {}, missing: ['voltage', 'enabled'], invalid: [], ready: false });
  });
  it('accepts explicitly supplied zero and false without replacing them', () => {
    expect(prepareDrawingCalculationInputs(defs, { voltage: 0, enabled: false })).toMatchObject({ input: { voltage: 0, enabled: false }, ready: true });
  });
  it.each([null, undefined, ' '])('does not coerce absent %p into a measured zero', (voltage) => {
    expect(prepareDrawingCalculationInputs(defs, { voltage, enabled: true }).missing).toContain('voltage');
  });
  it.each([true, Infinity, {}, '400V', -1])('blocks invalid numeric input %p', (voltage) => {
    expect(prepareDrawingCalculationInputs(defs, { voltage, enabled: true }).invalid).toContain('voltage');
  });
  it('does not accept inherited inputs', () => {
    expect(prepareDrawingCalculationInputs(defs, Object.create({ voltage: 380, enabled: true })).missing).toEqual(['voltage', 'enabled']);
  });
  it('checks missing row assumptions rather than filling array defaults', () => {
    const result = prepareDrawingCalculationInputs(CALCULATOR_PARAMS['max-demand'], { loads: [{ name: 'L1', ratedPower: 10 }], diversityFactor: 1 });
    expect(result.missing).toContain('loads[0].demandFactor'); expect(result.ready).toBe(false);
  });
  it('does not accept a nonexistent calculator with zero parameters', () => {
    expect(prepareDrawingCalculationInputs([], {}).ready).toBe(false);
  });
});
