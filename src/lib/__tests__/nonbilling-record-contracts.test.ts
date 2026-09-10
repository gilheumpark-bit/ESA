import { decodeNameplateResponse, nameplateInputIssue, nameplateCalculatorInputs } from '../nameplate-review';
import { decodeFieldSos, decodeFieldCompletion } from '../field-record-contract';
import { cachedHistory, decodeHistoryRows } from '../history-read-model';

const nameplate = { rawText: '380V 100A', confidence: 0.9, language: 'ko', voltage: '380V', current: '100A' };
const storage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null });
const record = { id: 'a', calcId: 'voltage-drop', inputs: { voltage: 380 }, calculatedAt: '2026-09-10T00:00:00Z', result: { value: 3, unit: '%' } };

describe('OCR readout and handoff', () => {
  it('keeps original fields and does not accept caller certainty as proof', () => {
    const result = decodeNameplateResponse({ success: true, data: { ...nameplate, certainty: 'confirmed', voltage: ' 380V ' }, suggestedCalculators: ['voltage-drop', 'voltage-drop', '../bad'] });
    expect(result.data.voltage).toBe('380V'); expect(result.data).not.toHaveProperty('certainty');
    expect(result.suggestedCalculators).toEqual(['voltage-drop']);
  });
  it.each([{ current: 100 }, { confidence: 1.2 }, { rawText: {} }, { language: false }, { voltage: 'x'.repeat(1001) }])('rejects corrupted fields %p', (patch) => {
    expect(() => decodeNameplateResponse({ success: true, data: { ...nameplate, ...patch } })).toThrow();
  });
  it.each(['220/380V', '1?0V', '220~380V', '220–380V', '220-380V'])('does not choose one voltage from %s', (value) => {
    expect(nameplateInputIssue('voltage', value)).toBeDefined();
    expect(nameplateCalculatorInputs({ ...nameplate, voltage: value }, 'voltage-drop')).not.toHaveProperty('voltage');
  });
  it('does not use short-circuit capacity as load current or apparent power as real power', () => {
    const inputs = nameplateCalculatorInputs({ ...nameplate, current: '50kA', power: '1000kVA' }, 'three-phase-power');
    expect(inputs).not.toHaveProperty('current'); expect(inputs).not.toHaveProperty('power'); expect(inputs.voltage).toBe('380V');
  });
  it('retains explicit normal values and leaves missing fields absent', () => {
    expect(nameplateCalculatorInputs(nameplate, 'voltage-drop')).toEqual({ source: 'ocr', calc: 'voltage-drop', voltage: '380V', current: '100A' });
    expect(nameplateInputIssue('voltage', undefined)).toContain('미판독');
  });
});

describe('field recording does not certify emergency delivery', () => {
  it('reports persisted SOS separately from external dispatch', () => {
    expect(decodeFieldSos({ success: true, data: { recorded: true, eventId: 'e1', channels: { inApp: 0 } } }).message).toContain('외부 자동 신고나 구조 요청 완료가 아닙니다');
  });
  it.each([{ recorded: false }, { eventId: '' }, { channels: { inApp: -1 } }])('rejects unconfirmed SOS status %p', (patch) => {
    expect(() => decodeFieldSos({ data: { recorded: true, eventId: 'e1', channels: { inApp: 0 }, ...patch } })).toThrow();
  });
  it('keeps a successful record when some in-app notifications failed', () => {
    const value = decodeFieldCompletion({ data: { receipt: { hash: 'a'.repeat(64), eventId: 'r1' }, notifications: { sent: 0, failed: 2 } } });
    expect(value.message).toContain('실패 2건'); expect(value.eventId).toBe('r1');
  });
  it.each(['', 'abc', '<untrusted>'])('does not display completion without a valid receipt hash %p', (hash) => {
    expect(() => decodeFieldCompletion({ data: { receipt: { hash, eventId: 'r1' }, notifications: { sent: 0, failed: 0 } } })).toThrow();
  });
});

describe('history corruption and ownership boundaries', () => {
  it('keeps valid entries around a damaged record without rewriting storage', () => {
    const values = { 'esa-receipt-index': '["a","b"]', 'esa-receipt-a': JSON.stringify(record), 'esa-receipt-b': '{invalid' };
    const result = cachedHistory(storage(values));
    expect(result.records).toEqual([record]); expect(result.skipped).toBe(1); expect(values['esa-receipt-b']).toBe('{invalid');
  });
  it('does not expose a different signed-in user cache to the next account', () => {
    const db = storage({ 'esa-receipt-index': '["a"]', 'esa-receipt-a': JSON.stringify({ ...record, userId: 'owner-a' }) });
    expect(cachedHistory(db, 'owner-b').records).toEqual([]); expect(cachedHistory(db).records).toEqual([]);
    expect(cachedHistory(db, 'owner-a').records).toHaveLength(1);
  });
  it.each(['{broken', 'null', '{}', '[123]'])('does not turn a corrupt index into an empty history: %s', (index) => {
    expect(() => cachedHistory(storage({ 'esa-receipt-index': index }))).toThrow();
  });
  it('deduplicates index IDs and rejects mismatched record identities', () => {
    const good = cachedHistory(storage({ 'esa-receipt-index': '["a","a"]', 'esa-receipt-a': JSON.stringify(record) }));
    expect(good.records).toHaveLength(1);
    expect(cachedHistory(storage({ 'esa-receipt-index': '["b"]', 'esa-receipt-b': JSON.stringify(record) })).skipped).toBe(1);
  });
  it('does not invent country/edition or timestamp when loading stored receipts', () => {
    const [entry] = decodeHistoryRows({ data: { data: [{ id: 'a', calculator_id: 'x', user_id: 'u', inputs: {}, outputs: {} }] } });
    expect(entry.calculatedAt).toBe(''); expect(entry).not.toHaveProperty('countryCode'); expect(entry).not.toHaveProperty('standardVersion');
  });
  it('rejects a malformed remote collection rather than claiming no records', () => {
    expect(() => decodeHistoryRows({ data: { data: {} } })).toThrow();
  });
});
