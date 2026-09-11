import { buildEquipmentCounts } from '../count-register';
import { applyDrawingCorrection } from '../apply-drawing-correction';
import { buildDrawingDocumentV3 } from '../drawing-document-report';
import { findUnboundLineItems } from '../evidence-deduplicator';
import { readEvidence, readSymbol, uncertaintyDocument } from '../test-support/uncertainty-document';
import { summarizeDrawingReadState } from '@/lib/drawing-read-summary';
import { drawingDocumentCsv, drawingDocumentPrintableHtml } from '@/lib/export-drawing-document';
import type { DrawingDocumentV3, UnresolvedItem } from '../types-v3';

const issue = (code: UnresolvedItem['code'], displayId = 'P01-s1'): UnresolvedItem => ({
  id: `${code}-${displayId}`, displayId, code, pageIndex: 0, bounds: { x: 20, y: 20, w: 20, h: 10 }, note: 'Synthetic reason',
});
const correct = (doc: DrawingDocumentV3, kind: 'type' | 'text' | 'label', selectedValue = 'breaker') => applyDrawingCorrection(doc, {
  targetDisplayId: kind === 'text' ? 'P01-T001' : 'P01-s1', correctionKind: kind, selectedValue,
  correctedBy: 'synthetic-reviewer', idempotencyKey: 'synthetic-request-0001',
});
const rebuild = (doc: DrawingDocumentV3, extra: Parameters<typeof buildDrawingDocumentV3>[0]['verificationExtra'] = {}) =>
  buildDrawingDocumentV3({ ...doc, documentPageCount: doc.pageCount, verificationExtra: extra });

describe('unknown survives derived counts and final report decisions', () => {
  it('unread-only equipment is not a complete zero quantity', () => {
    const [row] = buildEquipmentCounts([readSymbol('unread')], new Map(), [], []);
    expect(row).toMatchObject({ confirmed: 0, unread: 1, physicalEquipmentCount: null, countStatus: 'HOLD', symbolOccurrences: 1 });
  });
  it('retains known quantities but does not certify the aggregate when unread evidence exists', () => {
    const uncertain = { ...readSymbol('unread', 's2'), typeCandidates: ['breaker'] };
    const [row] = buildEquipmentCounts([readSymbol('confirmed'), uncertain], new Map(), [], []);
    expect(row).toMatchObject({ confirmed: 1, unread: 1, physicalEquipmentCount: 1, countStatus: 'HOLD' });
  });
  it('cross-page hold cannot be treated as a complete physical count', () => {
    const [row] = buildEquipmentCounts([readSymbol('confirmed')], new Map(), [{ id: 'cp', displayId: 'CP1', fromPage: 0,
      toPage: 1, fromRef: 's1', toRef: 's2', status: 'hold', evidence: [] }], []);
    expect(row.countStatus).not.toBe('COMPLETE');
  });
  it('does not erase valid confirmed results to compensate for another unknown item', () => {
    const doc = uncertaintyDocument();
    doc.evidenceGraph.symbols.push(readSymbol('unread', 's2'));
    const result = rebuild(doc);
    expect(result.evidenceGraph.symbols[0]).toEqual(doc.evidenceGraph.symbols[0]);
    expect(result.verification).toMatchObject({ claimsComplete: false, documentStatus: 'HOLD' });
  });
  it('verification metadata cannot overwrite computed uncertainty', () => {
    const doc = uncertaintyDocument(); doc.evidenceGraph.symbols = [readSymbol('unread')];
    const result = rebuild(doc, { claimsComplete: true, documentStatus: 'COMPLETE', holdReasons: [] });
    expect(result.verification).toMatchObject({ claimsComplete: false, documentStatus: 'HOLD', holdReasons: ['UNREADABLE_SYMBOL'] });
  });
  it('a confirmed type does not certify a separate ambiguous rated value', () => {
    const doc = uncertaintyDocument();
    doc.ratedValues = [{ id: 'v', displayId: 'V1', field: 'current', raw: '1?0A', certainty: 'ambiguous', evidence: readEvidence('v') }];
    expect(rebuild(doc).verification.claimsComplete).toBe(false);
    expect(rebuild(doc).evidenceGraph.symbols[0].certainty).toBe('confirmed');
  });
  it('cross-page uncertainty prevents a complete report even with a complete local graph', () => {
    const doc = uncertaintyDocument(); doc.crossPageRelations = [{ id: 'cp', displayId: 'CP1', fromPage: 0,
      toPage: 1, fromRef: 's1', toRef: 's2', status: 'candidate', evidence: [] }];
    expect(rebuild(doc).verification).toMatchObject({ claimsComplete: false, holdReasons: ['LINE_CONTINUITY_UNCERTAIN'] });
  });
  it('does not demote complete, corroborated input merely because partial results are allowed', () => {
    expect(uncertaintyDocument().verification.claimsComplete).toBe(true);
  });
});

describe('human correction resolves only the addressed uncertainty', () => {
  it('changing a label does not clear an unread type or a source-quality reason', () => {
    const doc = uncertaintyDocument(); doc.evidenceGraph.symbols = [readSymbol('unread')];
    doc.unresolvedItems = [issue('UNREADABLE_SYMBOL'), issue('LOW_RESOLUTION_HOLD')];
    const before = JSON.stringify(doc), result = correct(doc, 'label', 'New label');
    expect(result.unresolvedItems).toEqual(doc.unresolvedItems);
    expect(result.evidenceGraph.symbols[0]).toMatchObject({ certainty: 'unread', rawLabel: 'New label' });
    expect(JSON.stringify(doc)).toBe(before);
  });
  it('type correction keeps source quality and unrelated continuity issues', () => {
    const doc = uncertaintyDocument(); doc.evidenceGraph.symbols = [readSymbol('unread')];
    doc.unresolvedItems = [issue('UNREADABLE_SYMBOL'), issue('LOW_RESOLUTION_HOLD'), issue('LINE_CONTINUITY_UNCERTAIN', 'P01-L099')];
    const result = correct(doc, 'type');
    expect(result.unresolvedItems).toEqual(doc.unresolvedItems.slice(1));
    expect(result.evidenceGraph.symbols[0]).toMatchObject({ certainty: 'confirmed', confirmedType: 'breaker' });
    expect(result.verification.claimsComplete).toBe(false);
    expect(result.userCorrections[0]).toMatchObject({ goldenEligible: false, originalCandidates: ['unknown'] });
  });
  it('keeps an independent auditor reason on a regenerated relation', () => {
    const doc = uncertaintyDocument();
    doc.evidenceGraph.relations = [{ id: 'r1', displayId: 'P01-R001', from: 's1', to: 's2', certainty: 'ambiguous', evidence: readEvidence('r1') }];
    const independent = { ...issue('LINE_CONTINUITY_UNCERTAIN', 'P01-R001'), id: 'independent-audit-r1' };
    doc.unresolvedItems = [independent];
    expect(correct(doc, 'label', 'new label').unresolvedItems).toContainEqual(independent);
  });
  it('text correction clears the OCR reason but not clipped or low-resolution source evidence', () => {
    const doc = uncertaintyDocument();
    doc.evidenceGraph.texts = [{ id: 't1', displayId: 'P01-T001', rawText: '1OOA', candidates: ['100A'], certainty: 'ambiguous', evidence: readEvidence('t1') }];
    doc.unresolvedItems = [issue('AMBIGUOUS_OCR', 'P01-T001'), issue('BOUNDARY_CLIP', 'P01-T001')];
    const result = correct(doc, 'text', '100A');
    expect(result.unresolvedItems).toEqual([doc.unresolvedItems[1]]);
    expect(result.verification.claimsComplete).toBe(false);
  });
  it('preserves the original boundary continuation ledger', () => {
    const doc = uncertaintyDocument();
    doc.continuity = { regions: [], continuations: [], unresolvedEndpoints: [], stitchReceipts: [] } as NonNullable<DrawingDocumentV3['continuity']>;
    expect(correct(doc, 'type').continuity).toEqual(doc.continuity);
  });
  it('regenerates unbound items without duplicate accumulation', () => {
    const doc = uncertaintyDocument();
    doc.evidenceGraph.lines = [{ id: 'l1', displayId: 'P01-L001', lineKind: 'power', certainty: 'confirmed', path: [{ x: 80, y: 80 }, { x: 90, y: 80 }], junctions: [], crossovers: [], evidence: readEvidence('l1') }];
    doc.unresolvedItems = findUnboundLineItems(doc.evidenceGraph.lines, []);
    expect(correct(correct(doc, 'label', 'first'), 'label', 'second').unresolvedItems.filter((item) => item.id === 'unbound-l1')).toHaveLength(1);
  });
  it.each(['unknown', '모름', '미판독'])('keeps explicit %s as unknown instead of a human confirmed type', (value) => {
    const result = correct(uncertaintyDocument(), 'type', value);
    expect(result.evidenceGraph.symbols[0]).toMatchObject({ certainty: 'unread', confirmedType: undefined });
    expect(result.unresolvedItems.some((item) => item.code === 'UNREADABLE_SYMBOL')).toBe(true);
    expect(summarizeDrawingReadState(result).humanConfirmed).toBe(0);
  });
});

describe('observed-state accounting and exports', () => {
  it('keeps raw human confirmations separate from machine automation', () => {
    const doc = uncertaintyDocument(); doc.evidenceGraph.symbols.push(readSymbol('ambiguous', 's2'), readSymbol('unread', 's3'));
    const result = correct(doc, 'type', 'motor'), summary = summarizeDrawingReadState(result);
    expect(summary.groups[0].counts).toEqual({ confirmed: 1, ambiguous: 1, unread: 1, total: 3 });
    expect(summary.humanConfirmed).toBe(1);
    expect(summary.scope).toBe('observed-records-only');
    expect(JSON.stringify(summary)).not.toContain('accuracy');
  });
  it('empty records do not produce a fabricated 100% automation rate', () => {
    const doc = uncertaintyDocument(); doc.evidenceGraph.symbols = [];
    const summary = summarizeDrawingReadState(doc);
    expect(summary.groups.every((item) => item.counts.total === 0)).toBe(true);
    expect(summary.humanConfirmed).toBe(0);
  });
  it('keeps missing legacy categories and correction history distinct from observed zeroes', () => {
    const doc = uncertaintyDocument();
    Reflect.deleteProperty(doc, 'ratedValues');
    Reflect.deleteProperty(doc, 'crossPageRelations');
    Reflect.deleteProperty(doc, 'userCorrections');
    const summary = summarizeDrawingReadState(doc);
    expect(summary.missingGroups).toEqual(['페이지 간 결선', '정격값']);
    expect(summary.groups.some((group) => ['crossPage', 'ratedValues'].includes(group.kind))).toBe(false);
    expect(summary.humanConfirmed).toBeUndefined();
    expect(drawingDocumentCsv(doc)).toContain('정정 이력 미기록');
  });
  it('derives changing cause counts instead of persisting a stale summary', () => {
    const doc = uncertaintyDocument(); doc.unresolvedItems = [issue('LOW_RESOLUTION_HOLD'), issue('LOW_RESOLUTION_HOLD', 's2')];
    expect(summarizeDrawingReadState(doc).unresolvedCauses).toEqual([{ code: 'LOW_RESOLUTION_HOLD', count: 2 }]);
    doc.unresolvedItems.pop();
    expect(summarizeDrawingReadState(doc).unresolvedCauses[0].count).toBe(1);
  });
  it('exports the same unknown/cause/human summary to CSV and print without promoting status', () => {
    const doc = uncertaintyDocument(); doc.evidenceGraph.symbols = [readSymbol('unread')]; doc.unresolvedItems = [issue('UNREADABLE_SYMBOL')];
    const result = correct(doc, 'label', '=not-a-formula');
    for (const output of [drawingDocumentCsv(result), drawingDocumentPrintableHtml(result)]) {
      expect(output).toContain('미판독'); expect(output).toContain('UNREADABLE_SYMBOL');
      expect(output).toContain('전체 정답률·자동화율 아님');
    }
  });
});
