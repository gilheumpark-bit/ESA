import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { extractRatedValues } from '../../src/agent/drawing/rated-value-extractor';
import { reconcileCrossPage } from '../../src/agent/drawing/cross-page-graph';
import { applyDrawingCorrection } from '../../src/agent/drawing/apply-drawing-correction';
import { feedbackDocument, feedbackDxf } from '../../src/engine/topology/test-support/feedback-dxf';
import { parseDxfToSLD } from '../../src/engine/topology/dxf-parser';
import { emptySymbolFeedback, reusableSymbolCorrections, stageSymbolFeedback, decideSymbolFeedback, feedbackSymbolLibrary } from '../../src/lib/reviewed-symbol-feedback';
import type { EvidenceRef, SymbolNode, TextNode } from '../../src/agent/drawing/types-v3';

const root = path.resolve(__dirname, '../..');
const baseline = 'd73a19b5318d2a39ea80f02b62eba0429b44955b';
function oldModule<T>(name: string): T {
  const source = execFileSync('git', ['show', `${baseline}:src/agent/drawing/${name}.ts`], { encoding: 'utf8', cwd: root });
  const previousModule = { exports: {} };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: previousModule.exports, module: previousModule, require: (target: string) => jest.requireActual(target.startsWith('.') ? path.resolve(root, 'src/agent/drawing', target) : target),
      console, Date, Array, Map, Set, Math, Number, Object, RegExp });
  return previousModule.exports as T;
}
const ev = (id: string, pageIndex: number, x: number, y = 0, w = 20, h = 20): EvidenceRef[] =>
  [{ evidenceId: `e-${id}`, pageIndex, bounds: { x, y, w, h }, confidence: 1 }];
const sym = (id: string, pageIndex = 0, x = 0, label = 'QF-1'): SymbolNode => ({ id, displayId: id, equipmentId: `eq-${id}`,
  rawLabel: label, typeCandidates: ['breaker'], confirmedType: 'breaker', certainty: 'confirmed', evidence: ev(id, pageIndex, x) });
const txt = (id: string, raw: string, pageIndex = 0, x = 2, y = 2): TextNode => ({ id, displayId: id, rawText: raw,
  confirmedText: raw, candidates: [raw], certainty: 'confirmed', evidence: ev(id, pageIndex, x, y, 10, 5) });
const ref = [{ pageIndex: 0, targetPageHint: 1, text: 'SHEET 2', bounds: { x: 0, y: 0, w: 10, h: 10 } }];

it('measures real old/new functions and narrowly scoped correction reuse, not general AI accuracy', () => {
  const oldRating = oldModule<{ extractRatedValues: typeof extractRatedValues }>('rated-value-extractor').extractRatedValues;
  const oldCross = oldModule<{ reconcileCrossPage: typeof reconcileCrossPage }>('cross-page-graph').reconcileCrossPage;
  const diagnostic = (ratings: typeof extractRatedValues, cross: typeof reconcileCrossPage) => {
    const pair = [sym('a'), sym('b', 1)];
    const checks = [
      { name: 'multiple-ratings', pass: ratings([txt('t', '22.9kV / 380V / 1000kVA')], [sym('a')]).length === 3 },
      { name: 'tie-not-forced', pass: ratings([txt('t', '100A', 0, 25, 30)], [sym('a', 0, 0), sym('b', 0, 40)])[0].equipmentId === undefined },
      { name: 'distant-owner-not-invented', pass: ratings([txt('t', '100A', 0, 10000)], [sym('a')])[0].equipmentId === undefined },
      { name: 'kVA-is-not-voltage', pass: cross(pair, [txt('t0', '1000kVA'), txt('t1', '1000kVA', 1)], ref).every((item) => item.status !== 'confirmed') },
      { name: 'duplicate-target-not-forced', pass: cross([...pair, sym('c', 1, 40)], [txt('t0', '380V'), txt('t1', '380V', 1), txt('t2', '380V', 1, 42)], ref).every((item) => item.status !== 'confirmed') },
      { name: 'conflicting-voltages-not-first-match', pass: cross(pair, [txt('t0', '380V'), txt('t1', '220V', 0, 2, 10), txt('t2', '380V', 1)], ref).every((item) => item.status !== 'confirmed') },
      { name: 'normalized-voltage-positive', pass: cross(pair, [txt('t0', '380V'), txt('t1', '0.38kV', 1)], ref)[0]?.status === 'confirmed' },
      { name: 'other-equipment-voltage-not-used', pass: cross([...pair, sym('c', 0, 25, 'QF-9')], [txt('noise', '220V', 0, 27), txt('t0', '380V'), txt('t1', '380V', 1)], ref)[0]?.status === 'confirmed' },
      { name: 'distant-sheet-reference-not-anchor', pass: cross(pair, [txt('t0', '380V'), txt('t1', '380V', 1)], [{ ...ref[0], bounds: { x: 10000, y: 0, w: 10, h: 10 } }]).every((item) => item.status !== 'confirmed') },
      { name: 'unique-page-reference-positive', pass: cross(pair, [txt('t0', '380V'), txt('t1', '380V', 1)], ref)[0]?.status === 'confirmed' },
      { name: 'contained-reading-positive', pass: ratings([txt('t', '100A')], [sym('a')])[0].equipmentId === 'eq-a' },
    ];
    return { passed: checks.filter((item) => item.pass).length, total: checks.length, checks };
  };
  const before = diagnostic(oldRating, oldCross), after = diagnostic(extractRatedValues, reconcileCrossPage);
  let catalog = emptySymbolFeedback();
  const specs = [{ name: 'ZZ-A91', triangle: false, type: 'breaker' }, { name: 'ZZ-B92', triangle: false, type: 'switch' },
    { name: 'ZZ-C93', triangle: true, type: 'fuse' }] as const;
  for (const spec of specs) {
    const doc = feedbackDocument(feedbackDxf(spec.name, spec.triangle));
    const corrected = applyDrawingCorrection(doc, { targetDisplayId: doc.evidenceGraph.symbols[0].displayId,
      correctionKind: 'type', selectedValue: spec.type, idempotencyKey: `bench-${spec.name}`, correctedBy: 'synthetic-reviewer' });
    catalog = stageSymbolFeedback(catalog, reusableSymbolCorrections(corrected)[0], 'Synthetic Company', '합성 블록 종류 확인');
    catalog = decideSymbolFeedback(catalog, catalog.examples.at(-1)!.id, 'approved');
  }
  const library = feedbackSymbolLibrary(null, catalog)!;
  let unknownBefore = 0, correctAfter = 0, incorrectAfter = 0, negativeUnknown = 0;
  const cases = [];
  for (const spec of specs) {
    for (let i = 0; i < 4; i++) {
      const source = feedbackDxf(spec.name, spec.triangle, 2, 500 + i * 300, i * 90);
      const a = parseDxfToSLD(source), b = parseDxfToSLD(source, { symbolLibrary: library });
      unknownBefore += a.components.filter((item) => item.type === 'unknown').length;
      correctAfter += b.components.filter((item) => item.type === spec.type).length;
      incorrectAfter += b.components.filter((item) => item.type !== 'unknown' && item.type !== spec.type).length;
      cases.push({ name: spec.name, position: 500 + i * 300, rotation: i * 90, expected: spec.type, types: b.components.map((item) => item.type) });
    }
    for (const source of [feedbackDxf(`${spec.name}-OTHER`, spec.triangle), feedbackDxf(spec.name, !spec.triangle)]) {
      negativeUnknown += parseDxfToSLD(source, { symbolLibrary: library }).components.filter((item) => item.type === 'unknown').length;
    }
  }
  const report = { baseline, scope: 'Synthetic semantic regressions and exact DXF pattern recurrence. Not independent drawing accuracy or model training.',
    before, after, reuse: { approvedSourceExamples: 3, newPlacementDocuments: 12, instances: 24, unknownBefore, correctAfter, incorrectAfter, negativeCases: 6, negativeUnknown, cases },
    sourceHashes: Object.fromEntries(['rated-value-extractor', 'cross-page-graph'].map((name) => [name, createHash('sha256').update(readFileSync(path.join(root, `src/agent/drawing/${name}.ts`))).digest('hex')])) };
  const output = process.env.FEEDBACK_QUALITY_OUTPUT ?? path.join(root, 'test-results/feedback-quality.json');
  mkdirSync(path.dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2));
  console.log('FEEDBACK_QUALITY', JSON.stringify(report));
  expect(after.passed).toBe(after.total);
  expect({ unknownBefore, correctAfter, incorrectAfter, negativeUnknown }).toEqual({ unknownBefore: 24, correctAfter: 24, incorrectAfter: 0, negativeUnknown: 6 });
}, 30_000);
