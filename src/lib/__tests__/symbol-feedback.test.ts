import { createHash } from 'node:crypto';
import { proposeSymbolFeedback, parseSymbolFeedback, readDxfSymbolIdentity, type SymbolFeedback } from '../symbol-feedback';
import { updateSymbolFeedback } from '../symbol-feedback-store';
import { getActiveSymbolLibrary, importSymbolLibraryText, readSymbolLibraryCatalog, upsertSymbolMappings, SYMBOL_LIBRARY_CATALOG_KEY, type SymbolLibraryStorage } from '../symbol-library-store';
import { parseSymbolLibrary, type SymbolLibrary } from '../symbol-library-contract';
import { parseDxfToSLD } from '@/engine/topology/dxf-parser';
import { indexSymbolLibrary, matchSymbolFeedback } from '@/engine/topology/symbol-library';
import { applyDrawingCorrection } from '@/agent/drawing/apply-drawing-correction';
import { feedbackDocument, feedbackDxf } from '@/agent/drawing/test-support/feedback-fixture';
import { readSymbolLibraryPart } from '../symbol-library-form';

const stamp = '2099-01-01T00:00:00.000Z';
function storage(): SymbolLibraryStorage {
  const values = new Map<string, string>();
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: (k) => { values.delete(k); } };
}
function corrected() {
  const doc = feedbackDocument();
  return applyDrawingCorrection(doc, { targetDisplayId: doc.evidenceGraph.symbols[0].displayId,
    selectedValue: 'breaker', correctionKind: 'type', idempotencyKey: 'feedback-fixture', correctedBy: 'synthetic-reviewer' });
}
function proposal(): SymbolFeedback {
  const doc = corrected();
  return proposeSymbolFeedback(doc, doc.userCorrections[0].correctionId);
}
function pending(store: SymbolLibraryStorage) {
  return getActiveSymbolLibrary(updateSymbolFeedback('A사', null, { action: 'propose', feedback: proposal() }, store).catalog)!;
}
function approve(store: SymbolLibraryStorage, p: SymbolLibrary) {
  return getActiveSymbolLibrary(updateSymbolFeedback('A사', p, { action: 'approve', id: p.feedback![0].id, reason: '원본 지문과 종류 확인', at: stamp }, store).catalog)!;
}

describe('actual parser → V3 correction → explicit approval → next drawing', () => {
  it('preserves the vector source through the production adapter and correction', () => {
    const doc = corrected(), p = proposal();
    expect(doc.evidenceGraph.symbols[0].sourceSymbol).toEqual(p.source);
    expect(p.source.fingerprint).toMatch(/^fp2:/);
    expect(p.status).toBe('pending');
    expect(doc.userCorrections[0].goldenEligible).toBe(false);
  });
  it('does not apply a pending proposal and applies it only after review on a new source', () => {
    const store = storage(), p = pending(store);
    const nextDxf = feedbackDxf(60);
    expect(createHash('sha256').update(nextDxf).digest('hex')).not.toBe(p.feedback![0].sourceDocumentHash);
    expect(parseDxfToSLD(nextDxf, { symbolLibrary: p }).components[0].type).toBe('unknown');
    const approved = approve(store, p);
    const after = parseDxfToSLD(nextDxf, { symbolLibrary: approved });
    expect(after.components[0].type).toBe('breaker');
    expect(after.components[0].properties?.feedbackIds).toBe(p.feedback![0].id);
    expect(approved.revision).toBe(2);
    expect(p.feedback![0].status).toBe('pending');
  });
  it('revokes future reuse without altering the existing drawing or historical correction', () => {
    const store = storage(), approved = approve(store, pending(store));
    const prior = parseDxfToSLD(feedbackDxf(50), { symbolLibrary: approved });
    const revoked = getActiveSymbolLibrary(updateSymbolFeedback('A사', approved, { action: 'revoke', id: approved.feedback![0].id, reason: '오류 확인', at: stamp }, store).catalog)!;
    expect(parseDxfToSLD(feedbackDxf(51), { symbolLibrary: revoked }).components[0].type).toBe('unknown');
    expect(prior.components[0].type).toBe('breaker');
    expect(revoked.feedback![0].decisions.map((d) => d.action)).toEqual(['approve', 'revoke']);
    expect(() => approve(store, revoked)).toThrow();
  });
  it('does not reuse another geometry, name, inactive company or an absent fingerprint', () => {
    const store = storage(), approved = approve(store, pending(store));
    expect(parseDxfToSLD(feedbackDxf(0, true), { symbolLibrary: approved }).components[0].type).toBe('unknown');
    expect(parseDxfToSLD(feedbackDxf(0, false, 'OTHER-CUSTOM'), { symbolLibrary: approved }).components[0].type).toBe('unknown');
    expect(parseDxfToSLD(feedbackDxf()).components[0].type).toBe('unknown');
    expect(matchSymbolFeedback(indexSymbolLibrary(approved), 'ZZ-CUSTOM-7', null).status).toBe('none');
    expect(readSymbolLibraryCatalog(store).catalog.libraries.find((x) => x.organization === 'B사')).toBeUndefined();
  });
  it('round-trips revision, decisions and source through storage, JSON import and API validation', async () => {
    const store = storage(), approved = approve(store, pending(store));
    const json = JSON.stringify(approved), other = storage();
    const imported = getActiveSymbolLibrary(importSymbolLibraryText(json, other).catalog)!;
    expect(imported).toEqual(approved);
    expect(await readSymbolLibraryPart(json)).toEqual({ ok: true, library: approved });
    upsertSymbolMappings('A사', [{ blockName: 'ANOTHER', fingerprint: null, deviceType: 'fuse' }], store);
    expect(getActiveSymbolLibrary(readSymbolLibraryCatalog(store).catalog)?.feedback).toEqual(approved.feedback);
  });
  it('tests changed-layout known answers without treating feedback source as held-out accuracy', () => {
    const store = storage(), approved = approve(store, pending(store));
    const report = { scope: 'synthetic repeated-block regression only', beforeKnownCorrect: 0, afterKnownCorrect: 0, afterWrong: 0, cases: 12 };
    for (let i = 1; i <= report.cases; i++) {
      const data = feedbackDxf(i * 20);
      expect(createHash('sha256').update(data).digest('hex')).not.toBe(approved.feedback![0].sourceDocumentHash);
      const before = parseDxfToSLD(data).components[0].type;
      const after = parseDxfToSLD(data, { symbolLibrary: approved }).components[0].type;
      if (before === 'breaker') report.beforeKnownCorrect++;
      if (after === 'breaker') report.afterKnownCorrect++;
      else if (after !== 'unknown') report.afterWrong++;
    }
    expect(report).toMatchObject({ beforeKnownCorrect: 0, afterKnownCorrect: 12, afterWrong: 0 });
    console.log('FEEDBACK_REGRESSION', JSON.stringify(report));
  });
});

describe('feedback containment and failure paths', () => {
  it('refuses unanchored, unknown, unsupported, text-only or superseded corrections', () => {
    const base = corrected(); const id = base.userCorrections[0].correctionId;
    const noSource = structuredClone(base); delete noSource.evidenceGraph.symbols[0].sourceSymbol;
    expect(() => proposeSymbolFeedback(noSource, id)).toThrow();
    for (const selectedValue of ['unknown', 'mccb', 'motor']) {
      const changed = applyDrawingCorrection(base, { targetDisplayId: base.evidenceGraph.symbols[0].displayId, selectedValue,
        correctionKind: 'type', idempotencyKey: `second-${selectedValue}`, correctedBy: 'fixture' });
      expect(() => proposeSymbolFeedback(changed, id)).toThrow();
      if (selectedValue !== 'motor') expect(() => proposeSymbolFeedback(changed, changed.userCorrections.at(-1)!.correctionId)).toThrow();
    }
  });
  it('does not approve a staged correction that the visible source document has superseded', () => {
    const store = storage(), source = corrected();
    const staged = proposeSymbolFeedback(source, source.userCorrections[0].correctionId);
    const p = getActiveSymbolLibrary(updateSymbolFeedback('A사', null, { action: 'propose', feedback: staged }, store).catalog)!;
    const changed = applyDrawingCorrection(source, { targetDisplayId: source.evidenceGraph.symbols[0].displayId,
      correctionKind: 'type', selectedValue: 'motor', correctedBy: 'fixture', idempotencyKey: 'superseded-approval' });
    expect(() => updateSymbolFeedback('A사', p, { action: 'approve', id: staged.id, reason: 'reviewed', at: stamp }, store, changed)).toThrow();
    expect(getActiveSymbolLibrary(readSymbolLibraryCatalog(store).catalog)!.feedback![0].status).toBe('pending');
  });
  it('does not overwrite a stale company snapshot', () => {
    const store = storage(), p = pending(store); approve(store, p);
    expect(() => approve(store, p)).toThrow('사전이 변경');
  });
  it('keeps existing rules and rejects approval of a conflicting classification', () => {
    const store = storage(), p = pending(store);
    const incompatible = upsertSymbolMappings('A사', [{ ...p.feedback![0].source, deviceType: 'fuse' }], store);
    expect(() => approve(store, getActiveSymbolLibrary(incompatible.catalog)!)).toThrow('충돌');
  });
  it('imported conflicting approved cases cannot silently select the first or a name heuristic', () => {
    const p = proposal();
    const first = { ...p, status: 'approved' as const, decisions: [{ action: 'approve' as const, at: stamp, reason: 'fixture' }] };
    const library: SymbolLibrary = { schemaVersion: 1, organization: 'A사', entries: [], feedback: [first, { ...first, id: 'other', deviceType: 'fuse' }] };
    expect(parseSymbolLibrary(library).ok).toBe(true);
    const parsed = parseDxfToSLD(feedbackDxf(), { symbolLibrary: library });
    expect(parsed.components[0].type).toBe('unknown');
    expect(parsed.components[0].properties?.feedbackConflict).toBe('true');
  });
  it('a failed storage write does not change effective approval state', () => {
    const store = storage(), p = pending(store);
    const broken = { ...store, setItem: () => { throw new Error('quota'); } };
    expect(() => approve(broken, p)).toThrow('저장');
    expect(getActiveSymbolLibrary(readSymbolLibraryCatalog(store).catalog)!.feedback![0].status).toBe('pending');
  });
  it('blocks corrupt storage without erasing the source bytes', () => {
    const store = storage(); store.setItem(SYMBOL_LIBRARY_CATALOG_KEY, 'broken');
    expect(() => pending(store)).toThrow();
    expect(store.getItem(SYMBOL_LIBRARY_CATALOG_KEY)).toBe('broken');
  });
  it.each([null, {}, '[]', Array.from({ length: 501 }, () => ({}))])('rejects malformed/oversized feedback %p', (v) => {
    expect(() => parseSymbolFeedback(v)).toThrow();
  });
  it('rejects incomplete decisions, unsupported state and malformed source', () => {
    const p = proposal();
    for (const patch of [{ status: 'approved' }, { deviceType: 'unknown' }, { sourceDocumentHash: 'bad' },
      { source: { ...p.source, fingerprint: 'fp1:1234567890123456' } }, { createdAt: 'not-date' }, { originalCandidates: [7] }]) {
      expect(() => parseSymbolFeedback([{ ...p, ...patch }])).toThrow();
    }
    expect(readDxfSymbolIdentity({ blockName: 'x', fingerprint: 'unknown' })).toBeUndefined();
    expect(parseSymbolLibrary({ schemaVersion: 1, organization: 'A사', entries: [], feedback: [p], revision: -1 }).ok).toBe(false);
  });
  it('is idempotent for the same proposal but requires a reason for every decision', () => {
    const store = storage(), p = pending(store);
    const current = updateSymbolFeedback('A사', p, { action: 'propose', feedback: proposal() }, store);
    expect(getActiveSymbolLibrary(current.catalog)?.revision).toBe(1);
    expect(() => updateSymbolFeedback('A사', p, { action: 'approve', id: p.feedback![0].id, reason: '', at: stamp }, store)).toThrow();
  });
});
