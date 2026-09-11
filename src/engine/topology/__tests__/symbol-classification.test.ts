import { classifyDxfSymbols } from '../symbol-classifier';
import { indexSymbolLibrary, parseSymbolLibrary } from '../symbol-library';
import { parseDxfToSLD } from '../dxf-parser';
import { parseSLDResponse, type SLDComponent, type SLDConnection } from '@/lib/sld-recognition';
import { approvedShape, variationShape, classificationDxf, parsedClassification, classifierLibrary, classificationDocument, fingerprint } from '../test-support/symbol-classification-fixture';
import { proposeSymbolFeedback, readDxfSymbolIdentity } from '@/lib/symbol-feedback';
import { uncertaintyDocument } from '@/agent/drawing/test-support/uncertainty-document';
import { buildDrawingDocumentV3 } from '@/agent/drawing/drawing-document-report';
import { applyDrawingCorrection } from '@/agent/drawing/apply-drawing-correction';
import { drawingDocumentCsv, drawingDocumentPrintableHtml } from '@/lib/export-drawing-document';
import { readSymbolClassification } from '@/lib/symbol-classification';
import { deduplicateSymbols } from '@/agent/drawing/evidence-deduplicator';

function setup() {
  const components: SLDComponent[] = [
    { id: 'bus', type: 'bus', position: { x: 0, y: 100 } },
    ...[0, 1].map((i): SLDComponent => ({ id: `seed${i}`, type: 'breaker', position: { x: i * 100, y: 0 }, symbolShape: approvedShape(),
      properties: { blockName: 'ZZ-A91', blockFingerprint: fingerprint(), layer: 'PANEL-A', symbolRotation: '0' } })),
    { id: 'candidate', type: 'unknown', position: { x: 200, y: 0 }, symbolShape: variationShape(),
      properties: { blockName: 'ZZ-B92', blockFingerprint: 'fp2:1234567890123456', layer: 'PANEL-A', symbolRotation: '0' } },
  ];
  const connections: SLDConnection[] = components.slice(1).map((c) => ({ id: `edge-${c.id}`, from: c.id, to: 'bus' }));
  const library = classifierLibrary();
  const texts = new Map<string, string[]>();
  const run = () => classifyDxfSymbols(components, connections, { library, index: indexSymbolLibrary(library), texts });
  return { components, candidate: components[3], connections, library, texts, run };
}
function approvedFeedback(type: 'breaker' | 'fuse' = 'breaker') {
  return { id: `fb-${type}`, sourceDocumentHash: 'a'.repeat(64), correctionId: `corr-${type}`, targetDisplayId: 'P01-S001',
    source: { blockName: 'ZZ-A91', fingerprint: fingerprint(), shape: approvedShape() }, deviceType: type, originalCandidates: ['unknown'],
    createdAt: '2026-09-11T00:00:00.000Z', status: 'approved' as const,
    decisions: [{ action: 'approve' as const, at: '2026-09-11T00:01:00.000Z', reason: 'Synthetic source checked' }] };
}

describe('classification-first context policy', () => {
  it('classifies a small variation using two known repeated-role anchors, not per-item approval', () => {
    const f = setup(), stats = f.run();
    expect(f.candidate.classification).toMatchObject({ status: 'classified', selectedType: 'breaker', method: 'family-context',
      independentVerification: false, reasons: ['SHAPE_MATCH', 'REPEATED_ROLE'] });
    expect(stats).toMatchObject({ inferred: 1, additionalModelCalls: 0 });
    expect(f.candidate.type).toBe('unknown'); expect(f.candidate.rating).toBeUndefined();
    expect(f.candidate.current).toBeUndefined(); expect(f.candidate.voltage).toBeUndefined();
  });
  it('shape alone without repeat context remains a candidate', () => {
    const f = setup(); f.connections.length = 0; f.run();
    expect(f.candidate.classification).toMatchObject({ status: 'review', reasons: ['SHAPE_MATCH', 'INSUFFICIENT_CONTEXT'] });
    expect(f.candidate.classification).not.toHaveProperty('selectedType');
  });
  it('same coordinates cannot replace missing geometry', () => {
    const f = setup(); delete f.candidate.symbolShape; f.candidate.position = { ...f.components[1].position }; f.run();
    expect(f.candidate.classification).toMatchObject({ status: 'unread', reasons: ['UNSUPPORTED_GEOMETRY'] });
  });
  it('a single nearby known device is insufficient repeated-role evidence', () => {
    const f = setup(); f.connections.splice(0, 1); f.run(); expect(f.candidate.classification?.status).toBe('review');
  });
  it.each(['layer', 'symbolRotation'] as const)('does not copy roles across %s differences', (key) => {
    const f = setup(); f.candidate.properties![key] = 'different'; f.run(); expect(f.candidate.classification?.status).toBe('review');
  });
  it('duplicated nodes at the same location do not supply two independent role anchors', () => {
    const f = setup(); f.components[2].position = { ...f.components[1].position }; f.run();
    expect(f.candidate.classification?.status).toBe('review');
  });
  it('different connection degree prevents positional reuse', () => {
    const f = setup(); f.connections.push({ id: 'extra', from: 'candidate', to: 'seed0' }); f.run(); expect(f.candidate.classification?.status).toBe('review');
  });
  it('a different explicit voltage is not copied from neighbours', () => {
    const f = setup(); f.candidate.voltage = '220V'; f.components[1].voltage = '380V'; f.components[2].voltage = '380V';
    f.run(); expect(f.candidate.classification?.status).toBe('review'); expect(f.candidate.voltage).toBe('220V');
  });
  it.each(['SPARE', 'SPACE', 'ELCB', 'RCCB', 'ATS', 'ATS1', 'ELCB3', '누전', '특수'])('preserves %s as an exception, not a generic repeat', (text) => {
    const f = setup(); f.texts.set('candidate', [text]); f.run();
    expect(f.candidate.classification).toMatchObject({ status: 'review', reasons: ['SPECIAL_MARKING'] });
  });
  it('discarded long or excessive text cannot be treated as no conflicting evidence', () => {
    const f = setup(); f.texts.set('candidate', ['__ESA_CONTEXT_TRUNCATED__']); f.run();
    expect(f.candidate.classification).toMatchObject({ status: 'review', reasons: ['BUDGET_LIMIT'] });
  });
  it('conflicting explicit text defeats a matching repeated position', () => {
    const f = setup(); f.texts.set('candidate', ['FUSE']); f.run();
    expect(f.candidate.classification?.status).toBe('review'); expect(f.candidate.classification?.reasons).toContain('TEXT_CONFLICT');
  });
  it('a unique approved shape plus explicit type text works without repeated neighbours', () => {
    const f = setup(); f.connections.length = 0; f.texts.set('candidate', ['MCCB']); f.run();
    expect(f.candidate.classification).toMatchObject({ status: 'classified', selectedType: 'breaker', reasons: ['SHAPE_MATCH', 'TEXT_SUPPORT'] });
  });
  it('equally similar different classes do not use first/last wins', () => {
    const f = setup(); f.library.feedback = [approvedFeedback('fuse'), approvedFeedback('breaker')]; f.run();
    expect(f.candidate.classification?.status).toBe('review'); expect(f.candidate.classification?.reasons).toContain('AMBIGUOUS_FAMILY');
  });
  it('conflicting library names cannot bypass the conflict via geometry or topology', () => {
    const f = setup(); f.library.entries.push({ blockNames: ['ZZ-B92'], deviceType: 'breaker' }, { blockNames: ['ZZ-B92'], deviceType: 'fuse' });
    f.run(); expect(f.candidate.classification).toMatchObject({ status: 'review', reasons: ['LIBRARY_CONFLICT'] });
  });
  it('inferred devices never become seeds for other inferred devices', () => {
    const f = setup(); f.connections.length = 0;
    f.components.push({ id: 'next', type: 'unknown', symbolShape: variationShape(), position: { x: 300, y: 0 }, properties: { ...f.candidate.properties } });
    f.texts.set('candidate', ['MCCB']); f.run();
    expect(f.candidate.classification?.status).toBe('classified'); expect(f.components[4].classification?.status).toBe('review');
  });
  it('does not silently truncate references and remove a competing class', () => {
    const f = setup(); f.library.feedback = Array.from({ length: 513 }, (_, i) => ({ ...approvedFeedback(), id: `f-${i}`,
      source: { ...approvedFeedback().source, blockName: `REFERENCE-${i}` } }));
    f.run(); expect(f.candidate.classification).toMatchObject({ status: 'review', reasons: ['BUDGET_LIMIT'] });
  });
  it('reuses shape comparisons for repeated instances in the same run', () => {
    const f = setup();
    for (let i = 0; i < 100; i++) f.components.push({ ...f.candidate, id: `extra-${i}`, position: { x: 300 + i * 100, y: 0 } });
    const stats = f.run(); expect(stats.shapeComparisons).toBe(1); expect(stats.reusedShapeComparisons).toBe(100);
  });
  it('input iteration order does not decide classification', () => {
    const f = setup(); f.run(); const original = JSON.stringify(f.candidate.classification);
    f.components.reverse(); f.connections.reverse(); f.run(); expect(JSON.stringify(f.candidate.classification)).toBe(original);
  });
});

describe('real DXF -> V3 -> feedback and report', () => {
  it('classification metadata does not demote an otherwise verified complete document', () => {
    const document = uncertaintyDocument(), f = setup(); f.run();
    document.evidenceGraph.symbols[0].classification = f.components[1].classification;
    const result = buildDrawingDocumentV3({ ...document, documentPageCount: document.pageCount });
    expect(result.verification.claimsComplete).toBe(true);
    expect(result.evidenceGraph.symbols[0].certainty).toBe('confirmed');
  });
  it('a classification conflict blocks document completion without deleting valid raw results', () => {
    const document = uncertaintyDocument(), f = setup(); f.run();
    const symbol = document.evidenceGraph.symbols[0];
    symbol.classification = { ...f.components[1].classification!, status: 'review', method: 'unresolved',
      selectedType: undefined, reasons: ['TEXT_CONFLICT'] };
    const result = buildDrawingDocumentV3({ ...document, documentPageCount: document.pageCount });
    expect(result.verification).toMatchObject({ claimsComplete: false, documentStatus: 'HOLD', holdReasons: ['UNREADABLE_SYMBOL'] });
    expect(result.evidenceGraph.symbols[0]).toMatchObject({ confirmedType: 'breaker', certainty: 'confirmed' });
  });
  it('classifies parsed repeated roles without changing raw types or unknown inventory', () => {
    const analysis = parsedClassification(3);
    const candidates = analysis.components.filter((c) => c.properties?.blockName === 'ZZ-B92');
    expect(candidates).toHaveLength(3);
    expect(candidates.every((c) => c.classification?.selectedType === 'breaker' && c.type === 'unknown')).toBe(true);
    expect(analysis.unknownSymbols?.find((c) => c.blockName === 'ZZ-B92')?.count).toBe(3);
    expect(analysis.classificationStats).toMatchObject({ inferred: 3, shapeComparisons: 1, reusedShapeComparisons: 2, additionalModelCalls: 0 });
  });
  it.each(['pending', 'revoked'] as const)('does not reuse %s descriptors as classification examples', (status) => {
    const f = setup(); f.components.splice(1, 2); f.connections.length = 0; f.library.entries = [];
    f.library.feedback = [{ ...approvedFeedback(), status }]; f.texts.set('candidate', ['MCCB']); f.run();
    expect(f.candidate.classification?.status).toBe('unread');
  });
  it('an approved special-device pattern is not generalized as an ordinary family', () => {
    const f = setup(); f.components.splice(1, 2); f.connections.length = 0; f.library.entries = [];
    f.library.feedback = [{ ...approvedFeedback(), source: { ...approvedFeedback().source, blockName: 'ATS1' } }];
    f.texts.set('candidate', ['MCCB']); f.run(); expect(f.candidate.classification?.status).toBe('unread');
  });
  it('an approved descriptor can support a new-name variation with explicit type evidence', () => {
    const f = setup(); f.components.splice(1, 2); f.connections.length = 0; f.library.entries = [];
    f.library.feedback = [approvedFeedback()]; f.texts.set('candidate', ['MCCB']); f.run();
    expect(f.candidate.classification).toMatchObject({ selectedType: 'breaker', status: 'classified', method: 'family-context' });
  });
  it.each(['FUSE', 'ATS1'])('internal block marking %s defeats ordinary repeated-role classification', (marking) => {
    const source = classificationDxf().replace('3\nZZ-B92\n1\n\n',
      `3\nZZ-B92\n1\n\n0\nTEXT\n8\n0\n10\n5\n20\n5\n40\n2\n1\n${marking}\n`);
    const analysis = parseDxfToSLD(source, { symbolLibrary: classifierLibrary() });
    const variant = analysis.components.find((item) => item.properties?.blockName === 'ZZ-B92')!;
    expect(variant.symbolShape).toBeDefined();
    expect(variant.classification?.status).toBe('review');
    expect(variant.classification?.reasons).toContain(marking === 'ATS1' ? 'SPECIAL_MARKING' : 'TEXT_CONFLICT');
  });
  it('a consistent literal block marking supports rather than blocks its classification', () => {
    const source = classificationDxf().replace('3\nZZ-B92\n1\n\n',
      '3\nZZ-B92\n1\n\n0\nTEXT\n8\n0\n10\n5\n20\n5\n40\n2\n1\nMCCB\n');
    const analysis = parseDxfToSLD(source, { symbolLibrary: classifierLibrary() });
    const variant = analysis.components.find((item) => item.properties?.blockName === 'ZZ-B92')!;
    expect(variant.classification).toMatchObject({ status: 'classified', selectedType: 'breaker' });
    expect(variant.classification?.reasons).toContain('TEXT_SUPPORT');
  });
  it('no company library means no invisible fallback learning', () => {
    const analysis = parseDxfToSLD(classificationDxf());
    expect(analysis.classificationStats?.inferred).toBe(0);
    expect(analysis.components.find((c) => c.properties?.blockName === 'ZZ-B92')?.classification?.selectedType).toBeUndefined();
  });
  it('keeps independent V3 verification separate from automatic classification', () => {
    const document = classificationDocument();
    const candidate = document.evidenceGraph.symbols.find((s) => s.classification?.method === 'family-context')!;
    expect(candidate).toBeDefined(); expect(candidate.certainty).toBe('unread'); expect(candidate.confirmedType).toBeUndefined();
    expect(document.unresolvedItems.some((item) => item.displayId === candidate.displayId)).toBe(true);
    for (const output of [drawingDocumentCsv(document), drawingDocumentPrintableHtml(document)]) {
      expect(output).toContain('심볼 분류'); expect(output).toContain('자동 분류'); expect(output).toContain('정격·결선 확정과 별개');
    }
  });
  it('human correction creates a reusable variant descriptor, but an inference alone cannot', () => {
    const document = classificationDocument(); const target = document.evidenceGraph.symbols.find((s) => s.classification?.method === 'family-context')!;
    expect(() => proposeSymbolFeedback(document, 'not-a-human-correction')).toThrow();
    const changed = applyDrawingCorrection(document, { targetDisplayId: target.displayId, correctionKind: 'type', selectedValue: 'breaker',
      correctedBy: 'synthetic-reviewer', idempotencyKey: 'classify-human-0001' });
    const example = proposeSymbolFeedback(changed, changed.userCorrections.at(-1)!.correctionId);
    expect(example.source.shape).toBeDefined(); expect(example.status).toBe('pending'); expect(changed.userCorrections.at(-1)?.goldenEligible).toBe(false);
    const stored = parseSymbolLibrary({ schemaVersion: 1, organization: 'Synthetic Company', entries: [], feedback: [example] });
    expect(stored.ok).toBe(true); expect(stored.library?.feedback?.[0].source.shape).toEqual(example.source.shape);
    expect(changed.evidenceGraph.symbols.find((s) => s.id === target.id)?.classification?.method).toBe('human-correction');
  });
  it('confirming an unchanged source type does not unnecessarily ask to review all its repeated uses', () => {
    const document = classificationDocument(); const seed = document.evidenceGraph.symbols.find((s) => s.sourceSymbol?.blockName === 'ZZ-A91')!;
    const changed = applyDrawingCorrection(document, { targetDisplayId: seed.displayId, correctionKind: 'type', selectedValue: 'breaker',
      correctedBy: 'synthetic-reviewer', idempotencyKey: 'same-source-0001' });
    expect(changed.evidenceGraph.symbols.find((s) => s.sourceSymbol?.blockName === 'ZZ-B92')?.classification)
      .toMatchObject({ method: 'family-context', status: 'classified' });
  });
  it('changing a source seed withdraws dependent automatic results but leaves original records', () => {
    const document = classificationDocument(); const seed = document.evidenceGraph.symbols.find((s) => s.sourceSymbol?.blockName === 'ZZ-A91')!;
    const before = JSON.stringify(document);
    const changed = applyDrawingCorrection(document, { targetDisplayId: seed.displayId, correctionKind: 'type', selectedValue: 'fuse',
      correctedBy: 'synthetic-reviewer', idempotencyKey: 'classify-human-0002' });
    const dependent = changed.evidenceGraph.symbols.find((s) => s.sourceSymbol?.blockName === 'ZZ-B92')!;
    expect(dependent.classification).toMatchObject({ status: 'review', reasons: ['REFERENCE_CHANGED'] });
    expect(JSON.stringify(document)).toBe(before);
  });
  it('old hash-only records remain exact records, never fake shape descriptors', () => {
    const identity = { blockName: 'OLD', fingerprint: fingerprint() };
    expect(readDxfSymbolIdentity(identity)).toEqual(identity);
    expect(readDxfSymbolIdentity({ ...identity, shape: { version: 99 } })).toBeUndefined();
  });
  it('general model JSON cannot claim parser-owned geometry and classification', () => {
    const classification = setup(); classification.run();
    const result = parseSLDResponse(JSON.stringify({ components: [{ id: 'forged', type: 'breaker', position: { x: 2, y: 3 },
      symbolShape: approvedShape(), classification: classification.candidate.classification }], connections: [] }));
    expect(result.components[0].classification).toBeUndefined(); expect(result.components[0].symbolShape).toBeUndefined();
  });
  it('classification imports reject invented probabilities and unknown kinds', () => {
    const f = setup(); f.run(); const c = f.candidate.classification!;
    expect(readSymbolClassification(c)).toEqual(c);
    expect(readSymbolClassification({ ...c, candidates: [{ type: 'breaker', similarity: Infinity }] })).toBeUndefined();
    expect(readSymbolClassification({ ...c, selectedType: 'dragon' })).toBeUndefined();
    expect(readSymbolClassification({ ...c, independentVerification: true })).toBeUndefined();
  });
  it('merged source conflicts do not leave an automatic classification attached', () => {
    const f = setup(); f.run();
    const hit = { localId: 'a', type: 'unknown', confidence: 0.95, bounds: { x: 10, y: 10, w: 20, h: 20 }, pageIndex: 0, regionId: 'vector-full', certainty: 'unread' as const,
      sourceSymbol: { blockName: 'A', fingerprint: fingerprint() }, classification: f.candidate.classification };
    const [symbol] = deduplicateSymbols([hit, { ...hit, localId: 'b', sourceSymbol: { blockName: 'B', fingerprint: 'fp2:2222222222222222' } }]);
    expect(symbol.classification?.status).toBe('review'); expect(symbol.sourceSymbol).toBeUndefined();
  });
});
