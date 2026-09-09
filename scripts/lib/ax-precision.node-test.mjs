/** Production-module regressions; no AI calls, credentials, or drawing uploads. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const build = mkdtempSync(path.join(tmpdir(), 'esa-ax-precision-'));
after(() => rmSync(build, { recursive: true, force: true }));

// Only transpile the actual, dependency-free production slice. This is not
// a replacement for the project's full tsc, Jest, build, or live-model gates.
for (const name of [
  'device-vocabulary', 'device-class', 'content-zone-classifier',
  'bounds-index', 'terminal-path-resolver', 'evidence-deduplicator', 'team-result-adapter',
]) {
  const fileName = path.join(root, 'src/agent/drawing', `${name}.ts`);
  const compiled = ts.transpileModule(readFileSync(fileName, 'utf8'), {
    fileName,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const errors = (compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
  writeFileSync(path.join(build, `${name}.js`), compiled.outputText);
}
for (const name of ['symbol-feedback', 'sld-component-types']) {
  const source = readFileSync(path.join(root, 'src/lib', `${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  mkdirSync(path.join(build, 'lib'), { recursive: true });
  writeFileSync(path.join(build, 'lib', `${name}.js`), compiled.outputText);
}
const adapter = path.join(build, 'team-result-adapter.js');
writeFileSync(adapter, readFileSync(adapter, 'utf8').replace('require("@/lib/symbol-feedback")', 'require("./lib/symbol-feedback")'));
const require = createRequire(import.meta.url);
const { deduplicateSymbols, deduplicateLines, buildPageRelations } = require(path.join(build, 'evidence-deduplicator.js'));
const { adaptTeamResult } = require(path.join(build, 'team-result-adapter.js'));

function hit(overrides = {}) {
  return {
    localId: 's1', type: 'breaker', bounds: { x: 100, y: 100, w: 30, h: 30 },
    confidence: 0.95, pageIndex: 0, regionId: 'full-page', certainty: 'confirmed',
    ...overrides,
  };
}
function lineHit(overrides = {}) {
  return {
    localId: 'l1', lineKind: 'power', path: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
    confidence: 0.95, pageIndex: 0, regionId: 'full-page', certainty: 'confirmed',
    ...overrides,
  };
}
function node(id, bounds, ports) {
  return {
    id, displayId: id, typeCandidates: ['breaker'], confirmedType: 'breaker', certainty: 'confirmed',
    evidence: [{ evidenceId: `${id}-e`, pageIndex: 0, bounds, confidence: 0.95 }],
    ...(ports ? { ports } : {}),
  };
}
function graphResult(symbols) {
  return {
    confidence: 0.95, components: [], connections: [],
    drawingReview: { envelopes: [], graph: { symbols, lines: [] } },
  };
}
function graphSymbol(overrides = {}) {
  return {
    id: 's1', typeCandidates: ['breaker', 'fuse'], rawLabel: 'DEVICE-A',
    bounds: { x: 100, y: 100, w: 30, h: 30 },
    ports: [{ x: 115, y: 100 }, { x: 115, y: 130 }],
    confidence: 0.99, sourceIds: ['full-page'], originalEvidenceIds: ['raw-s1'],
    ...overrides,
  };
}
const context = { pageIndex: 0, width: 1000, height: 1000 };

test('adapter retains all competing types instead of only the first', () => {
  const result = adaptTeamResult(graphResult([graphSymbol()]), context);
  assert.deepEqual(result.symbols[0].typeCandidates, ['breaker', 'fuse']);
  assert.equal(result.symbols[0].certainty, 'ambiguous');
});

test('adapter clones original-coordinate terminals and evidence identities', () => {
  const source = graphSymbol();
  const result = adaptTeamResult(graphResult([source]), context);
  assert.deepEqual(result.symbols[0].ports, source.ports);
  assert.notEqual(result.symbols[0].ports, source.ports);
  assert.notEqual(result.symbols[0].ports[0], source.ports[0]);
  assert.deepEqual(result.symbols[0].sourceEvidenceIds, ['raw-s1']);
});

test('adapter -> deduplicator retains competing types and exact terminals', () => {
  const adapted = adaptTeamResult(graphResult([graphSymbol()]), context);
  const [result] = deduplicateSymbols(adapted.symbols);
  assert.deepEqual(new Set(result.typeCandidates), new Set(['breaker', 'fuse']));
  assert.deepEqual(result.ports, graphSymbol().ports);
  assert.equal(result.certainty, 'ambiguous');
  assert.equal(result.confirmedType, undefined);
});

test('a repeated high-confidence ambiguous read cannot silently become confirmed', () => {
  const result = deduplicateSymbols([
    hit({ certainty: 'ambiguous', confidence: 0.9, typeCandidates: ['breaker', 'fuse'] }),
    hit({ localId: 's2', certainty: 'ambiguous', confidence: 0.999, typeCandidates: ['breaker', 'fuse'] }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].certainty, 'ambiguous');
  assert.equal(result[0].confirmedType, undefined);
  assert.ok(result[0].typeCandidates.includes('fuse'));
});

test('legacy confidence-only confirmation includes a consistent confirmedType', () => {
  const [result] = deduplicateSymbols([hit({ certainty: undefined })]);
  assert.equal(result.certainty, 'confirmed');
  assert.equal(result.confirmedType, 'breaker');
});

test('a later confirmed full body recovers a smaller ambiguous fragment', () => {
  const result = deduplicateSymbols([
    hit({ localId: 'fragment', certainty: 'ambiguous', confidence: 0.6, bounds: { x: 10, y: 0, w: 10, h: 5 } }),
    hit({ localId: 'body', type: 'fuse', confidence: 0.98, bounds: { x: 5, y: 1, w: 30, h: 40 } }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].certainty, 'confirmed');
  assert.equal(result[0].confirmedType, 'fuse');
  assert.equal(result[0].evidence.length, 2);
  assert.deepEqual(new Set(result[0].typeCandidates), new Set(['breaker', 'fuse']));
});

test('an ambiguous full body is not promoted by confidence alone', () => {
  const result = deduplicateSymbols([
    hit({ localId: 'fragment', certainty: 'ambiguous', confidence: 0.6, bounds: { x: 10, y: 0, w: 10, h: 5 } }),
    hit({ localId: 'body', type: 'fuse', certainty: 'ambiguous', confidence: 0.99, bounds: { x: 5, y: 1, w: 30, h: 40 } }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].certainty, 'ambiguous');
});

test('a later fragment does not overturn an already confirmed full body', () => {
  const result = deduplicateSymbols([
    hit({ localId: 'body', type: 'fuse', bounds: { x: 5, y: 0, w: 30, h: 40 } }),
    hit({ localId: 'fragment', confidence: 0.999, bounds: { x: 10, y: 1, w: 10, h: 5 } }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].confirmedType, 'fuse');
});

test('similar-sized conflicting bodies remain unresolved', () => {
  const result = deduplicateSymbols([hit(), hit({ localId: 's2', type: 'fuse' })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].certainty, 'ambiguous');
});

test('a unique nameplate cannot merge devices across pages', () => {
  const result = deduplicateSymbols([
    hit({ type: 'transformer', label: 'TR-1' }),
    hit({ localId: 's2', type: 'transformer', label: 'TR-1', pageIndex: 1 }),
  ], 24, [{ text: 'TR-1' }]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.evidence[0].pageIndex), [0, 1]);
});

test('TR-1 is not the unique nameplate of TR-10', () => {
  const result = deduplicateSymbols([
    hit({ type: 'transformer', label: 'TR-1' }),
    hit({ localId: 's2', type: 'transformer', label: 'TR-10', bounds: { x: 700, y: 700, w: 30, h: 30 } }),
  ], 24, [{ text: 'TR-1' }]);
  assert.equal(result.length, 2);
});

test('the same page/nameplate still merges repeated observations', () => {
  const result = deduplicateSymbols([
    hit({ type: 'transformer', label: 'TR-1' }),
    hit({ localId: 's2', type: 'transformer', label: 'TR-1 380V', bounds: { x: 140, y: 100, w: 30, h: 30 } }),
  ], 24, [{ text: 'TR-1' }]);
  assert.equal(result.length, 1);
});

test('distinct terminals are preserved without applying symbol snap tolerance', () => {
  const ports = [{ x: 100, y: 100 }, { x: 102, y: 100 }];
  const first = hit({ ports });
  const second = hit({ localId: 's2', ports: [{ x: 100, y: 100 }, { x: 104, y: 100 }] });
  const before = JSON.stringify([first, second]);
  const [result] = deduplicateSymbols([first, second]);
  assert.deepEqual(result.ports, [...ports, { x: 104, y: 100 }]);
  assert.notEqual(result.ports[0], ports[0]);
  assert.equal(JSON.stringify([first, second]), before);
});

test('different bent conductor routes with identical ends are not merged', () => {
  const result = deduplicateLines([
    lineHit({ path: [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 0 }] }),
    lineHit({ localId: 'l2', path: [{ x: 0, y: 0 }, { x: 0, y: -100 }, { x: 200, y: -100 }, { x: 200, y: 0 }] }),
  ]);
  assert.equal(result.length, 2);
});

test('reversed observations of the same bent route still merge', () => {
  const route = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 200, y: 100 }];
  const result = deduplicateLines([lineHit({ path: route }), lineHit({ localId: 'l2', path: [...route].reverse() })]);
  assert.equal(result.length, 1);
});

test('collinear resampling and straight overlap still deduplicate', () => {
  const result = deduplicateLines([
    lineHit(),
    lineHit({ localId: 'l2', path: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }] }),
    lineHit({ localId: 'l3', path: [{ x: 10, y: 0 }, { x: 190, y: 0 }] }),
  ]);
  assert.equal(result.length, 1);
});

test('ground and power observations never collapse into one line', () => {
  assert.equal(deduplicateLines([lineHit(), lineHit({ localId: 'l2', lineKind: 'ground' })]).length, 2);
});

test('terminal contacts exclude an unrelated body crossed by the same line', () => {
  const a = node('A', { x: 0, y: 0, w: 20, h: 20 }, [{ x: 10, y: 20 }]);
  const b = node('B', { x: 0, y: 200, w: 20, h: 20 }, [{ x: 10, y: 200 }]);
  const decoy = node('X', { x: 0, y: 80, w: 80, h: 40 }, [{ x: 80, y: 100 }]);
  const lines = deduplicateLines([lineHit({ path: [{ x: 10, y: 20 }, { x: 10, y: 200 }] })]);
  const result = buildPageRelations([a, decoy, b], lines, 0);
  assert.equal(result.length, 1);
  assert.deepEqual(new Set([result[0].from, result[0].to]), new Set(['A', 'B']));
  assert.equal(result[0].certainty, 'confirmed');
});

test('legacy drawings without terminals retain their existing relation path', () => {
  const a = node('A', { x: 0, y: 0, w: 20, h: 20 });
  const b = node('B', { x: 0, y: 200, w: 20, h: 20 });
  const lines = deduplicateLines([lineHit({ path: [{ x: 10, y: 20 }, { x: 10, y: 200 }] })]);
  const result = buildPageRelations([a, b], lines, 0);
  assert.equal(result.length, 1);
});

test('ambiguous source geometry is not upgraded by terminal contact', () => {
  const a = node('A', { x: 0, y: 0, w: 20, h: 20 }, [{ x: 10, y: 20 }]);
  const b = node('B', { x: 0, y: 200, w: 20, h: 20 }, [{ x: 10, y: 200 }]);
  const lines = deduplicateLines([lineHit({ certainty: 'ambiguous', path: [{ x: 10, y: 20 }, { x: 10, y: 200 }] })]);
  const result = buildPageRelations([a, b], lines, 0);
  assert.equal(result.length, 1);
  assert.ok(result.every((item) => item.certainty === 'ambiguous'));
});

test('empty and degenerate line input does not crash relation assembly', () => {
  const a = node('A', { x: 0, y: 0, w: 20, h: 20 });
  assert.deepEqual(buildPageRelations([a], [{ id: 'empty', path: [], certainty: 'confirmed', evidence: [{ pageIndex: 0 }] }], 0), []);
});


test('legacy reviewed graphs without terminal metadata remain readable', () => {
  const result = adaptTeamResult(graphResult([graphSymbol({ ports: undefined })]), context);
  assert.deepEqual(result.symbols[0].ports, []);
});

test('non-finite terminal coordinates are not propagated into relation geometry', () => {
  const [result] = deduplicateSymbols([hit({ ports: [{ x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: 1, y: 2 }] })]);
  assert.deepEqual(result.ports, [{ x: 1, y: 2 }]);
});

test('shared terminal positions do not become confirmed relations by ID order', () => {
  const a = node('A', { x: 0, y: 0, w: 20, h: 20 }, [{ x: 10, y: 20 }]);
  const b = node('B', { x: 0, y: 200, w: 20, h: 20 }, [{ x: 10, y: 200 }]);
  const rival = node('X', { x: 5, y: 0, w: 20, h: 20 }, [{ x: 10, y: 20 }]);
  const lines = deduplicateLines([lineHit({ path: [{ x: 10, y: 20 }, { x: 10, y: 200 }] })]);
  const result = buildPageRelations([a, rival, b], lines, 0);
  assert.ok(result.length > 0);
  assert.ok(result.every((item) => item.certainty === 'ambiguous'));
});

test('64 independent synthetic feeders retain their exact device pairs', () => {
  const symbols = [];
  const rawLines = [];
  for (let i = 0; i < 64; i += 1) {
    const x = i * 200;
    symbols.push(node(`A${i}`, { x, y: 0, w: 20, h: 20 }, [{ x: x + 10, y: 20 }]));
    symbols.push(node(`B${i}`, { x, y: 200, w: 20, h: 20 }, [{ x: x + 10, y: 200 }]));
    rawLines.push(lineHit({ localId: `l${i}`, path: [{ x: x + 10, y: 20 }, { x: x + 10, y: 200 }] }));
  }
  const result = buildPageRelations(symbols, deduplicateLines(rawLines), 0);
  assert.equal(result.length, 64);
  for (let i = 0; i < 64; i += 1) {
    assert.ok(result.some((item) => item.from === `A${i}` && item.to === `B${i}` && item.certainty === 'confirmed'));
  }
});
