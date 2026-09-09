import { applyDrawingCorrection } from '@/agent/drawing/apply-drawing-correction';
import { feedbackDocument, feedbackDxf } from '@/engine/topology/test-support/feedback-dxf';
import { parseDxfToSLD } from '@/engine/topology/dxf-parser';
import { parseSLDResponse } from '../sld-recognition';
import { buildQuickDrawingReadout } from '../quick-drawing-readout';
import { decideSymbolFeedback, emptySymbolFeedback, feedbackSymbolLibrary, FEEDBACK_STORAGE_KEY,
  importSymbolFeedback, parseSymbolFeedback, readSymbolFeedback, reusableSymbolCorrections,
  revokeSupersededFeedback, saveSymbolFeedback, stageSymbolFeedback, type FeedbackStorage } from '../reviewed-symbol-feedback';

function corrected(kind: 'type' | 'text' | 'label' = 'type', value = 'breaker') {
  const document = feedbackDocument();
  return applyDrawingCorrection(document, { targetDisplayId: document.evidenceGraph.symbols[0].displayId,
    selectedValue: value, correctionKind: kind, idempotencyKey: `fixture-${crypto.randomUUID()}`, correctedBy: 'synthetic-reviewer' });
}
function staged(value = 'breaker') {
  return stageSymbolFeedback(emptySymbolFeedback(), reusableSymbolCorrections(corrected('type', value))[0], 'Company A', '원본 종류를 확인함');
}
function approved(value = 'breaker') { const draft = staged(value); return decideSymbolFeedback(draft, draft.examples[0].id, 'approved'); }
function storage(): FeedbackStorage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('human corrections become explicitly reviewed reusable parser evidence', () => {
  it('carries real parser provenance through V3 correction without training on model JSON', () => {
    const doc = corrected();
    const examples = reusableSymbolCorrections(doc);
    expect(examples).toHaveLength(1);
    expect(examples[0]).toMatchObject({ pattern: { kind: 'dxf-block-v2', blockName: 'CUSTOM-UI' }, selectedType: 'breaker' });
    expect(examples[0].pattern.fingerprint).toMatch(/^fp2:[a-f0-9]{16}$/);
    expect(doc.userCorrections[0].goldenEligible).toBe(false);
    const parsed = parseSLDResponse(JSON.stringify({ components: [{ id: 'fake', type: 'breaker', position: { x: 1, y: 1 },
      sourcePattern: examples[0].pattern, appliedFeedbackIds: ['fb-fake'] }], connections: [] }));
    expect(parsed.components[0].sourcePattern).toBeUndefined();
    expect(parsed.components[0].appliedFeedbackIds).toBeUndefined();
  });
  it('pending does not apply; approval reuses exact patterns on different positions and rotations', () => {
    const draft = staged();
    expect(feedbackSymbolLibrary(null, draft)).toBeNull();
    const catalog = decideSymbolFeedback(draft, draft.examples[0].id, 'approved');
    const result = parseDxfToSLD(feedbackDxf('CUSTOM-UI', false, 3, 400, 90), { symbolLibrary: feedbackSymbolLibrary(null, catalog)! });
    expect(result.components).toHaveLength(3);
    expect(result.components.every((item) => item.type === 'breaker')).toBe(true);
    expect(result.components.every((item) => item.appliedFeedbackIds?.includes(catalog.examples[0].id))).toBe(true);
  });
  it.each([['OTHER-NAME', false], ['CUSTOM-UI', true]] as const)('does not generalize across changed name or shape: %s/%s', (name, triangle) => {
    const result = parseDxfToSLD(feedbackDxf(name, triangle), { symbolLibrary: feedbackSymbolLibrary(null, approved())! });
    expect(result.components[0].type).toBe('unknown');
    expect(result.components[0].appliedFeedbackIds).toBeUndefined();
  });
  it('does not apply another company or a withdrawn decision', () => {
    const catalog = approved();
    expect(feedbackSymbolLibrary(null, { ...catalog, activeOrganization: 'Company B' })).toBeNull();
    const revoked = decideSymbolFeedback(catalog, catalog.examples[0].id, 'revoked');
    expect(feedbackSymbolLibrary(null, revoked)).toBeNull();
    expect(feedbackSymbolLibrary(feedbackSymbolLibrary(null, catalog), revoked)).toBeNull();
  });
  it('conflicting approved examples remain unknown rather than last-write-wins', () => {
    let catalog = approved();
    const candidate = reusableSymbolCorrections(corrected('type', 'fuse'))[0];
    catalog = stageSymbolFeedback(catalog, candidate, 'Company A', '다른 근거: 퓨즈 후보');
    catalog = decideSymbolFeedback(catalog, catalog.examples.at(-1)!.id, 'approved');
    const result = parseDxfToSLD(feedbackDxf(), { symbolLibrary: feedbackSymbolLibrary(null, catalog)! });
    expect(result.components[0].type).toBe('unknown');
    expect(buildQuickDrawingReadout(result).components[0].type.reason).toBe('FEEDBACK_CONFLICT');
  });
  it('existing dictionary disagreement cannot fall through to a heuristic', () => {
    const catalog = approved();
    const base = { schemaVersion: 1 as const, organization: 'Company A', entries: [{ blockNames: ['CUSTOM-UI'], deviceType: 'fuse' as const }] };
    const result = parseDxfToSLD(feedbackDxf(), { symbolLibrary: feedbackSymbolLibrary(base, catalog)! });
    expect(result.components[0].type).toBe('unknown');
  });
  it('a newer source correction withdraws old reuse while retaining correction records', () => {
    const doc = corrected(), draft = stageSymbolFeedback(emptySymbolFeedback(), reusableSymbolCorrections(doc)[0], 'Company A', '원본 확인');
    const catalog = decideSymbolFeedback(draft, draft.examples[0].id, 'approved');
    const changed = applyDrawingCorrection(doc, { targetDisplayId: doc.evidenceGraph.symbols[0].displayId,
      correctionKind: 'type', selectedValue: 'unknown', idempotencyKey: 'changed-source', correctedBy: 'synthetic-reviewer' });
    const next = revokeSupersededFeedback(catalog, changed, doc.evidenceGraph.symbols[0].displayId);
    expect(next.examples[0].status).toBe('revoked');
    expect(next.revision).toBe(catalog.revision + 1);
    expect(changed.userCorrections).toHaveLength(2);
  });
  it('label and unknown decisions are not reusable type answers', () => {
    expect(reusableSymbolCorrections(corrected('label', 'label'))).toEqual([]);
    expect(reusableSymbolCorrections(corrected('type', 'unknown'))).toEqual([]);
  });
  it('missing or multiple source patterns cannot publish a broad rule', () => {
    const doc = corrected();
    const pattern = doc.evidenceGraph.symbols[0].sourcePatterns![0];
    doc.evidenceGraph.symbols[0].sourcePatterns!.push({ ...pattern, blockName: 'different' });
    expect(reusableSymbolCorrections(doc)).toEqual([]);
    delete doc.evidenceGraph.symbols[0].sourcePatterns;
    expect(reusableSymbolCorrections(doc)).toEqual([]);
  });
});

describe('feedback storage and import boundaries', () => {
  it('persists a versioned catalogue and rejects a known stale writer', () => {
    const db = storage(), draft = staged();
    expect(saveSymbolFeedback(db, draft, 0)).toEqual(readSymbolFeedback(db));
    expect(() => saveSymbolFeedback(db, draft, 0)).toThrow('다른 변경');
    expect(readSymbolFeedback(db).revision).toBe(1);
  });
  it('does not overwrite corrupt data or treat a failed write as success', () => {
    const db = storage(); db.setItem(FEEDBACK_STORAGE_KEY, '{corrupted');
    expect(() => saveSymbolFeedback(db, staged(), 0)).toThrow();
    expect(db.getItem(FEEDBACK_STORAGE_KEY)).toBe('{corrupted');
    expect(() => saveSymbolFeedback({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, staged(), 0)).toThrow('quota');
  });
  it('imported approval always needs local re-review and duplicate IDs are not duplicated', () => {
    const source = approved(), imported = importSymbolFeedback(JSON.stringify(source), emptySymbolFeedback());
    expect(imported.examples[0].status).toBe('pending');
    expect(imported.examples[0].reviewedAt).toBeUndefined();
    expect(feedbackSymbolLibrary(null, imported)).toBeNull();
    expect(importSymbolFeedback(JSON.stringify(source), imported).examples).toHaveLength(1);
  });
  it('bounds imports and rejects duplicate or malformed approval data', () => {
    expect(() => importSymbolFeedback('x'.repeat(1024 * 1024 + 1), emptySymbolFeedback())).toThrow();
    const catalog = approved();
    expect(() => parseSymbolFeedback({ ...catalog, examples: [...catalog.examples, catalog.examples[0]] })).toThrow();
    expect(() => parseSymbolFeedback({ ...catalog, examples: [{ ...catalog.examples[0], reviewedAt: undefined }] })).toThrow();
    expect(() => parseSymbolFeedback({ ...catalog, revision: Infinity })).toThrow();
  });
  it('rejects empty rationale, unknown types and duplicate source examples', () => {
    const doc = corrected(), candidate = reusableSymbolCorrections(doc)[0];
    expect(() => stageSymbolFeedback(emptySymbolFeedback(), candidate, 'Company A', '')).toThrow();
    expect(() => stageSymbolFeedback(emptySymbolFeedback(), { ...candidate, selectedType: 'unknown' }, 'Company A', 'reason')).toThrow();
    const first = stageSymbolFeedback(emptySymbolFeedback(), candidate, 'Company A', 'reason');
    expect(() => stageSymbolFeedback(first, candidate, 'Company A', 'reason')).toThrow('이미 저장');
  });
});
