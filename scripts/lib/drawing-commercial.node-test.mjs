/** Drawing production contracts; synthetic geometry, no credentials or AI calls. */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = mkdtempSync(path.join(tmpdir(), 'esa-commercial-contract-'));
after(() => rmSync(build, { recursive: true, force: true }));
for (const name of [
  'agent/drawing/device-vocabulary', 'agent/drawing/device-class', 'agent/drawing/bounds-index',
  'agent/drawing/evidence-deduplicator', 'agent/drawing/terminal-path-resolver',
  'agent/drawing/completed-page-evidence',
  'lib/symbol-classification', 'lib/sld-component-types', 'lib/security-hardening', 'lib/drawing-certainty', 'lib/drawing-read-summary', 'lib/export-drawing-document',
]) {
  const fileName = path.join(root, 'src', `${name}.ts`);
  if (!existsSync(fileName)) continue; // Allows the exact same contracts on the pre-change baseline.
  const compiled = ts.transpileModule(readFileSync(fileName, 'utf8'), {
    fileName, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  assert.equal((compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0);
  const dest = path.join(build, `${name}.js`);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, compiled.outputText.replace(/require\("@\/([^"\n]+)"\)/g,
    (_, relative) => `require(${JSON.stringify(path.join(build, relative))})`));
}
const require = createRequire(import.meta.url);
const { buildPageRelations, findUnboundLineItems } = require(path.join(build, 'agent/drawing/evidence-deduplicator.js'));
const { drawingDocumentRows, drawingDocumentSummary, drawingDocumentCsv, drawingDocumentPrintableHtml } = require(path.join(build, 'lib/export-drawing-document.js'));

const checkpointModule = path.join(build, 'agent/drawing/completed-page-evidence.js');
const restoreCompletedPageEvidence = existsSync(checkpointModule)
  ? require(checkpointModule).restoreCompletedPageEvidence : undefined;

function symbol(id, x, y, overrides = {}) {
  return {
    id, displayId: `P01-${id}`, typeCandidates: ['breaker'], confirmedType: 'breaker',
    rawLabel: `기기-${id}`, certainty: 'confirmed', ports: [{ x, y }],
    evidence: [{ evidenceId: `${id}-e`, pageIndex: 0, bounds: { x: x - 10, y: y - 20, w: 20, h: 20 }, confidence: 0.95 }],
    ...overrides,
  };
}
function line(id, points, overrides = {}) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return {
    id, displayId: `P01-${id}`, path: points, lineKind: 'power', certainty: 'confirmed',
    junctions: [], crossovers: [], geometrySource: 'observed',
    evidence: [{ evidenceId: `${id}-e`, pageIndex: 0,
      bounds: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, confidence: 0.95 }],
    ...overrides,
  };
}
function chain(overrides = {}) {
  return {
    symbols: [symbol('A', 0, 0), symbol('B', 300, 0)],
    lines: [line('L1', [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
      line('L2', [{ x: 100, y: 0 }, { x: 200, y: 0 }]),
      line('L3', [{ x: 200, y: 0 }, { x: 300, y: 0 }])],
    ...overrides,
  };
}
function doc(overrides = {}) {
  return {
    schemaVersion: 3, title: '도면 시험', documentHash: 'a'.repeat(64), updatedAt: '2026-09-08T00:00:00.000Z',
    jobStatus: 'PARTIAL', pageCount: 1, pages: [{ pageIndex: 0, status: 'complete' }],
    evidenceGraph: { symbols: [symbol('A', 0, 0), symbol('B', 300, 0)], lines: [], texts: [], relations: [] },
    equipmentCounts: [], ratedValues: [], calculations: [], crossPageRelations: [],
    unresolvedItems: [], recommendations: [], coverageLedger: {}, ...overrides,
  };
}

// These contracts target real production failures, not an independent accuracy benchmark.
test('recovers a split observed conductor as one terminal-proven relation', () => {
  const fixture = chain();
  const relations = buildPageRelations(fixture.symbols, fixture.lines, 0);
  assert.equal(relations.length, 1);
  assert.equal(relations[0].certainty, 'confirmed');
  assert.equal(relations[0].terminalPath?.version, 1);
  assert.deepEqual(new Set(relations[0].lineIds), new Set(['L1', 'L2', 'L3']));
});

test('retains every traversed line receipt instead of just one convenient segment', () => {
  const fixture = chain();
  const [relation] = buildPageRelations(fixture.symbols, fixture.lines, 0);
  for (const id of ['L1-e', 'L2-e', 'L3-e']) assert.ok(relation.evidence.some((item) => item.evidenceId === id), id);
});

test('a reconstructed route does not leave its used segments falsely unbound', () => {
  const fixture = chain();
  const relations = buildPageRelations(fixture.symbols, fixture.lines, 0);
  assert.deepEqual(findUnboundLineItems(fixture.lines, relations), []);
});

test('bent fragment chains preserve the full original route', () => {
  const symbols = [symbol('A', 0, 0), symbol('B', 300, 200)];
  const lines = [line('L1', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]),
    line('L2', [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }]),
    line('L3', [{ x: 200, y: 200 }, { x: 300, y: 200 }])];
  const relations = buildPageRelations(symbols, lines, 0);
  assert.equal(relations.length, 1);
  assert.ok(relations[0].terminalPath);
  assert.equal(relations[0].lineIds.length, 3);
});

test('input and point arrays are never mutated by route recovery', () => {
  const fixture = chain();
  const before = JSON.stringify(fixture);
  buildPageRelations(fixture.symbols, fixture.lines, 0);
  assert.equal(JSON.stringify(fixture), before);
});

test('result proof is stable when line input order is reversed', () => {
  const fixture = chain();
  const a = buildPageRelations(fixture.symbols, fixture.lines, 0).find((r) => r.terminalPath);
  const b = buildPageRelations(fixture.symbols, [...fixture.lines].reverse(), 0).find((r) => r.terminalPath);
  assert.ok(a && b);
  assert.deepEqual(new Set(a.lineIds), new Set(b.lineIds));
  assert.deepEqual(new Set([a.from, a.to]), new Set([b.from, b.to]));
});

for (const defect of ['gap', 'ambiguous-line', 'synthetic-line', 'unknown-kind', 'ambiguous-symbol', 'no-terminals', 'different-page']) {
  test(`does not manufacture a terminal proof for ${defect}`, () => {
    const fixture = chain();
    if (defect === 'gap') fixture.lines[1].path[0].x += 8;
    if (defect === 'ambiguous-line') fixture.lines[1].certainty = 'ambiguous';
    if (defect === 'synthetic-line') fixture.lines[1].geometrySource = 'synthetic';
    if (defect === 'unknown-kind') fixture.lines[1].lineKind = 'unknown';
    if (defect === 'ambiguous-symbol') fixture.symbols[1].certainty = 'ambiguous';
    if (defect === 'no-terminals') fixture.symbols[1].ports = [];
    if (defect === 'different-page') fixture.lines[1].evidence[0].pageIndex = 1;
    assert.ok(buildPageRelations(fixture.symbols, fixture.lines, 0).every((r) => !r.terminalPath));
  });
}

test('a marked non-connected crossing cannot create even an inferred bridge', () => {
  const symbols = [symbol('A', 0, 0), symbol('B', 150, 200)];
  const lines = [line('horizontal', [{ x: 0, y: 0 }, { x: 300, y: 0 }], { crossovers: [{ x: 150, y: 0 }] }),
    line('vertical', [{ x: 150, y: 0 }, { x: 150, y: 200 }])];
  const result = buildPageRelations(symbols, lines, 0);
  assert.equal(result.length, 0);
});

test('power and ground fragments do not share a terminal proof', () => {
  const fixture = chain(); fixture.lines[1].lineKind = 'ground';
  assert.ok(buildPageRelations(fixture.symbols, fixture.lines, 0).every((r) => !r.terminalPath));
});

test('shared observations of two devices at one terminal remain candidates', () => {
  const fixture = chain(); fixture.symbols.push(symbol('OTHER', 300, 0));
  assert.ok(buildPageRelations(fixture.symbols, fixture.lines, 0).every((r) => !r.terminalPath));
});

test('a third inline device may not be bypassed by a reconstructed route', () => {
  const fixture = chain();
  fixture.symbols.push(symbol('INLINE', 150, 0, { ports: [], evidence: [{ evidenceId: 'inline', pageIndex: 0,
    bounds: { x: 140, y: -10, w: 20, h: 20 }, confidence: 0.95 }] }));
  assert.ok(buildPageRelations(fixture.symbols, fixture.lines, 0).every((r) => !r.terminalPath || new Set([r.from, r.to]).has('INLINE')));
});

test('unmodelled branches are not arbitrarily turned into point-to-point proofs', () => {
  const fixture = chain(); fixture.symbols.push(symbol('C', 150, 100));
  fixture.lines.push(line('BRANCH', [{ x: 150, y: 0 }, { x: 150, y: 100 }]));
  assert.ok(buildPageRelations(fixture.symbols, fixture.lines, 0).every((r) => !r.terminalPath));
});

test('64 independent fragmented feeders recover 64 exact pairs with complete source coverage', () => {
  const symbols = [], lines = [];
  for (let i = 0; i < 64; i += 1) {
    const x = i * 200;
    symbols.push(symbol(`A${i}`, x, 0), symbol(`B${i}`, x, 300, { evidence: [{ evidenceId: `B${i}-e`, pageIndex: 0,
      bounds: { x: x - 10, y: 300, w: 20, h: 20 }, confidence: 0.95 }] }));
    for (let j = 0; j < 3; j += 1) lines.push(line(`L${i}-${j}`, [{ x, y: j * 100 }, { x, y: (j + 1) * 100 }]));
  }
  const relations = buildPageRelations(symbols, lines, 0);
  assert.equal(relations.length, 64);
  for (let i = 0; i < 64; i += 1) {
    const r = relations.find((r) => new Set([r.from, r.to]).has(`A${i}`) && new Set([r.from, r.to]).has(`B${i}`));
    assert.equal(r?.certainty, 'confirmed'); assert.equal(r?.lineIds?.length, 3);
  }
  assert.equal(findUnboundLineItems(lines, relations).length, 0);
});

test('exported relations name human-visible equipment and all contributing lines', () => {
  const fixture = chain();
  const relation = { id: 'r', displayId: 'P01-R001', from: 'A', to: 'B', lineId: 'L1', lineIds: ['L1', 'L2', 'L3'],
    certainty: 'confirmed', evidence: [], terminalPath: { version: 1, from: { x: 0, y: 0 }, to: { x: 300, y: 0 } } };
  const d = doc({ evidenceGraph: { ...doc().evidenceGraph, ...fixture, relations: [relation] } });
  const row = drawingDocumentRows(d).find((r) => r.section === '연결');
  assert.ok(row.detail.includes('P01-A') && row.detail.includes('기기-A'));
  assert.ok(row.detail.includes('P01-L1') && row.detail.includes('P01-L2') && row.detail.includes('P01-L3'));
});

for (const prefix of ['=', '+', '-', '@', '\t=', '\r=', '  =', '＝', '＋', '－', '＠']) {
  test(`CSV neutralizes spreadsheet formula prefix ${JSON.stringify(prefix)}`, () => {
    const value = `${prefix}1+1`;
    const d = doc({ unresolvedItems: [{ id: 'u', code: 'test', note: value }] });
    const csv = drawingDocumentCsv(d);
    assert.ok(csv.includes(`'${value}`), `missing literal text prefix for ${JSON.stringify(value)}`);
  });
}

test('exports beyond 5000 rows include the final finding and never silently lose safety items', () => {
  const d = doc({ unresolvedItems: Array.from({ length: 5100 }, (_, i) => ({ id: `u${i}`, code: 'test', note: `finding-${i}` })) });
  const rows = drawingDocumentRows(d);
  assert.ok(rows.some((r) => r.detail === 'finding-5099'));
  assert.ok(drawingDocumentCsv(d).includes('finding-5099'));
});

test('includes rated values and calculation receipts in the work product', () => {
  const d = doc({ ratedValues: [{ id: 'v', displayId: 'P01-V001', field: 'ratedVoltage', raw: '380 V',
    normalized: { value: 380, unit: 'V' }, equipmentId: 'A', certainty: 'confirmed', evidence: [] }],
    calculations: [{ id: 'c', calculatorId: 'voltage-drop', label: '전압강하', value: 1.23, unit: '%',
      compliant: null, receiptHash: 'b'.repeat(64), evidenceIds: ['e1'] }] });
  const csv = drawingDocumentCsv(d);
  assert.ok(csv.includes('380 V'));
  assert.ok(csv.includes('1.23'));
  assert.ok(csv.includes('b'.repeat(64)));
});

test('export preserves readable provenance, title and source revision', () => {
  const d = doc();
  const summary = Object.fromEntries(drawingDocumentSummary(d));
  assert.equal(summary['도면명'], '도면 시험');
  assert.equal(summary['문서 해시'], 'a'.repeat(64));
  assert.equal(summary['분석 갱신 시각'], d.updatedAt);
});

test('HTML export never executes an untrusted label', () => {
  const d = doc(); d.evidenceGraph.symbols[0].rawLabel = '<img src=x onerror=alert(1)>';
  const html = drawingDocumentPrintableHtml(d);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
});


test('resume preserves resolved alternatives, terminals, geometry provenance and evidence IDs', () => {
  assert.equal(typeof restoreCompletedPageEvidence, 'function');
  const original = doc();
  original.evidenceGraph.lines = chain().lines;
  original.evidenceGraph.symbols[0].typeCandidates = ['breaker', 'fuse'];
  original.evidenceGraph.symbols[0].confirmedType = 'breaker';
  original.evidenceGraph.symbols[0].equipmentId = 'equipment-original';
  const previous = structuredClone(original);
  const restored = restoreCompletedPageEvidence(original, new Set([0]));
  assert.deepEqual(restored.symbols, original.evidenceGraph.symbols);
  assert.deepEqual(restored.lines, original.evidenceGraph.lines);
  restored.symbols[0].ports[0].x = 999;
  restored.symbols[0].typeCandidates.push('switch');
  restored.lines[0].path[0].y = 999;
  assert.deepEqual(original, previous);
});

test('resume excludes unfinished pages, cross-page evidence and empty checkpoints', () => {
  assert.equal(typeof restoreCompletedPageEvidence, 'function');
  const original = doc();
  const other = structuredClone(original.evidenceGraph.symbols[0]);
  other.id = 'other'; other.evidence[0].pageIndex = 1;
  original.evidenceGraph.symbols.push(other);
  const mixed = structuredClone(other);
  mixed.id = 'mixed'; mixed.evidence.push({ ...mixed.evidence[0], pageIndex: 0 });
  original.evidenceGraph.symbols.push(mixed);
  const restored = restoreCompletedPageEvidence(original, new Set([0]));
  assert.ok(restored.symbols.every((node) => node.id !== 'other' && node.id !== 'mixed'));
  assert.deepEqual(restoreCompletedPageEvidence(undefined, new Set([0])), { symbols: [], lines: [], texts: [] });
});

test('report refuses an oversized export explicitly rather than returning a partial list', () => {
  const original = doc();
  original.unresolvedItems = Array.from({ length: 50_001 }, (_, index) => ({
    id: `u-${index}`, code: 'UNREADABLE_TEXT', pageIndex: 0, note: '검토 필요',
  }));
  assert.throws(() => drawingDocumentCsv(original), /50,000/);
});
