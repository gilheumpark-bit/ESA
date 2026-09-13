import { buildDrawingWorkProduct, drawingWorkProductCsv } from '../drawing-work-product';
import { evaluateAxInventory } from '@/agent/drawing/ax-inventory-evaluator';
import { axInventoryFixture } from '../test-support/ax-inventory-fixture';
import { applyDrawingCorrection } from '@/agent/drawing/apply-drawing-correction';
import { classificationDocument } from '@/engine/topology/test-support/symbol-classification-fixture';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

describe('AX inventory is usable work, not a promotion of electrical certainty', () => {
  it('adds supported automatic interpretation to inventory without changing the document', () => {
    const { document } = axInventoryFixture(), before = JSON.stringify(document);
    const product = buildDrawingWorkProduct(document);
    expect(product.totals).toEqual({ observed: 3, usable: 2, confirmedReadings: 1, automaticClassifications: 1, review: 0, unread: 1 });
    expect(product.groups).toEqual([{ type: 'breaker', confirmedReadings: 1, automaticClassifications: 1, usableOccurrences: 2 }]);
    expect(product.rows[1]).toMatchObject({ interpretedType: 'breaker', originalType: 'unknown', originalCertainty: 'unread' });
    expect(product).toMatchObject({ physicalCountCertified: false, engineeringInputsCertified: false, sourceDocumentStatus: 'HOLD' });
    expect(JSON.stringify(document)).toBe(before);
  });
  it('keeps review conflicts out even if an old raw type is confirmed', () => {
    const { document } = axInventoryFixture();
    document.evidenceGraph.symbols[0].classification = { ...document.evidenceGraph.symbols[1].classification!, status: 'review', selectedType: undefined, method: 'unresolved', reasons: ['TEXT_CONFLICT'] };
    expect(buildDrawingWorkProduct(document).rows[0]).toMatchObject({ basis: 'review', usableForInventory: false });
  });
  it('does not silently use a conflicting selected type', () => {
    const { document } = axInventoryFixture();
    document.evidenceGraph.symbols[0].classification = { ...document.evidenceGraph.symbols[1].classification!, selectedType: 'fuse' };
    const row = buildDrawingWorkProduct(document).rows[0];
    expect(row.basis).toBe('review');
    expect(row.usableForInventory).toBe(false);
    expect(row).not.toHaveProperty('interpretedType');
  });
  it('requires a usable source location and unique identity', () => {
    const { document } = axInventoryFixture(); document.evidenceGraph.symbols[1].evidence = [];
    expect(buildDrawingWorkProduct(document).totals.automaticClassifications).toBe(0);
    document.evidenceGraph.symbols[1] = { ...document.evidenceGraph.symbols[0] };
    expect(buildDrawingWorkProduct(document).totals.usable).toBe(0);
  });
  it.each([-1, 999])('does not use a source on unrequested page %p', (pageIndex) => {
    const { document } = axInventoryFixture(); document.evidenceGraph.symbols[1].evidence[0].pageIndex = pageIndex;
    expect(buildDrawingWorkProduct(document).rows[1].usableForInventory).toBe(false);
  });
  it('never takes an unknown candidate as a usable type', () => {
    const { document } = axInventoryFixture(); document.evidenceGraph.symbols[2].certainty = 'confirmed';
    expect(buildDrawingWorkProduct(document).rows[2].usableForInventory).toBe(false);
  });
  it('keeps independent physical counts, rated ownership and calculation receipts byte-identical', () => {
    const { document } = axInventoryFixture();
    const snapshot = JSON.stringify([document.equipmentCounts, document.ratedValues, document.calculations, document.verification]);
    buildDrawingWorkProduct(document);
    expect(JSON.stringify([document.equipmentCounts, document.ratedValues, document.calculations, document.verification])).toBe(snapshot);
  });
  it('exports scope, source evidence and original uncertainty without copying guesses', () => {
    const { document } = axInventoryFixture(); document.evidenceGraph.symbols[1].rawLabel = '=SUM(1,2)';
    const product = buildDrawingWorkProduct(document), all = drawingWorkProductCsv(product), usable = drawingWorkProductCsv(product, true);
    expect(all).toContain('물리 대수 아님'); expect(all).toContain('unread'); expect(all).toContain('e-2');
    expect(all).toContain("'=SUM(1,2)"); expect(usable).not.toContain('P01-S003'); expect(usable).toContain('P01-S002');
  });
  it('recomputes the inventory after actual human correction without preserving stale interpretations', () => {
    const document = classificationDocument();
    const target = document.evidenceGraph.symbols.find((symbol) => symbol.classification?.method === 'family-context')!;
    const before = buildDrawingWorkProduct(document);
    const changed = applyDrawingCorrection(document, { targetDisplayId: target.displayId, correctionKind: 'type', selectedValue: 'fuse', correctedBy: 'synthetic', idempotencyKey: 'ax-inventory-edit-0001' });
    const after = buildDrawingWorkProduct(changed);
    expect(before.rows.find((row) => row.symbolId === target.id)?.basis).toBe('automatic-classification');
    expect(after.rows.find((row) => row.symbolId === target.id)).toMatchObject({ interpretedType: 'fuse', basis: 'confirmed-reading' });
    expect(before.rows.find((row) => row.symbolId === target.id)?.interpretedType).toBe('breaker');
  });
  it('removes dependent interpretations after their source classification is changed', () => {
    const document = classificationDocument();
    const seed = document.evidenceGraph.symbols.find((symbol) => symbol.sourceSymbol?.blockName === 'ZZ-A91')!;
    const changed = applyDrawingCorrection(document, { targetDisplayId: seed.displayId, correctionKind: 'type', selectedValue: 'fuse', correctedBy: 'synthetic', idempotencyKey: 'ax-inventory-seed-0001' });
    expect(buildDrawingWorkProduct(changed).totals.automaticClassifications).toBe(0);
  });
});

describe('AX evaluation counts wrong automation and devices never detected', () => {
  it('includes missed devices in coverage, rather than dividing by detections only', () => {
    const { document, label, context } = axInventoryFixture(); const result = evaluateAxInventory(document, label, context);
    expect(result.counts).toMatchObject({ expected: 4, detected: 3, missed: 1, usable: 2, correctUsable: 2 });
    expect(result.metrics.usefulInventoryCoverage).toEqual({ numerator: 2, denominator: 4, value: 0.5 });
    expect(result.metrics.automaticPrecision.value).toBe(1); expect(result.metrics.usefulAutomaticCoverage.value).toBe(0.25);
  });
  it('spatially matches a wrong type and explicitly counts the misclassification', () => {
    const { document, label, context } = axInventoryFixture(); document.evidenceGraph.symbols[1].classification!.selectedType = 'fuse';
    const result = evaluateAxInventory(document, label, context);
    expect(result.counts).toMatchObject({ spatiallyMatched: 3, wrongUsable: 1 });
    expect(result.errors).toContainEqual({ symbolId: '2', kind: 'wrong-type', expectedType: 'breaker', actualType: 'fuse' });
    expect(result.metrics.automaticPrecision.value).toBe(0);
  });
  it('does not count duplicate detections as two correct devices', () => {
    const { document, label, context } = axInventoryFixture();
    document.evidenceGraph.symbols.push({ ...document.evidenceGraph.symbols[1], id: 'duplicate', displayId: 'P01-S009' });
    const result = evaluateAxInventory(document, label, context);
    expect(result.counts).toMatchObject({ spatiallyMatched: 3, extraDetections: 1, wrongUsable: 1 });
    expect(result.metrics.usefulInventoryCoverage.value).toBe(0.5);
  });
  it('does not report 100% for empty predictions or labels', () => {
    const { document, label, context } = axInventoryFixture(); document.evidenceGraph.symbols = [];
    const empty = evaluateAxInventory(document, label, context);
    expect(empty.metrics.automaticPrecision.value).toBeNull(); expect(empty.metrics.detectionRecall.value).toBe(0);
    label.symbols = []; expect(evaluateAxInventory(document, label, context).metrics.usefulInventoryCoverage.value).toBeNull();
  });
  it('refuses duplicated prediction IDs and mismatched source labels', () => {
    const { document, label, context } = axInventoryFixture();
    expect(() => evaluateAxInventory(document, { ...label, documentHash: 'b'.repeat(64) }, context)).toThrow('MISMATCH');
    document.evidenceGraph.symbols.push(document.evidenceGraph.symbols[0]);
    expect(() => evaluateAxInventory(document, label, context)).toThrow('DUPLICATE_ID');
  });
  it('binds evaluation to source, dictionary, geometry, graph and inventory policies', () => {
    const { document, label, context } = axInventoryFixture(); const original = evaluateAxInventory(document, label, context);
    const other = evaluateAxInventory(document, label, { ...context, dictionaryHash: 'b'.repeat(64) });
    expect(original.policyHash).not.toBe(other.policyHash); expect(original.evaluationHash).not.toBe(other.evaluationHash);
    expect(original.binding).toHaveProperty('geometryPolicy'); expect(original.binding).toHaveProperty('graphVersion');
    expect(original).toMatchObject({ independentAccuracyCertified: false, engineeringSafetyCertified: false });
  });
  it.each([NaN, Infinity, -1])('rejects malformed golden geometry %p', (x) => {
    const { document, label, context } = axInventoryFixture(); label.symbols[0].bounds.x = x;
    expect(() => evaluateAxInventory(document, label, context)).toThrow('LABEL_INVALID');
  });
  it('produces a replayable before/after AX evidence record on the same declared synthetic task', () => {
    const { document, label, context } = axInventoryFixture();
    context.sourceRevision = process.env.GITHUB_SHA ?? context.sourceRevision;
    const original = structuredClone(document); delete original.evidenceGraph.symbols[1].classification;
    const before = evaluateAxInventory(original, label, context), after = evaluateAxInventory(document, label, context);
    expect(before.metrics.usefulInventoryCoverage.value).toBe(0.25); expect(after.metrics.usefulInventoryCoverage.value).toBe(0.5);
    expect(after.counts.missed).toBe(before.counts.missed); expect(after.counts.wrongUsable).toBe(0);
    const report = { scope: 'One declared synthetic contract case; NOT measured customer accuracy or reviewer time.', before, after };
    if (process.env.AX_BENCH_OUTPUT) { mkdirSync(dirname(process.env.AX_BENCH_OUTPUT), { recursive: true }); writeFileSync(process.env.AX_BENCH_OUTPUT, JSON.stringify(report, null, 2)); }
    console.log('AX_INVENTORY_ABLATION', JSON.stringify({ before: before.counts, after: after.counts }));
  });
});
