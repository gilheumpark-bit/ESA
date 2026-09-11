/** Actual production-module differential benchmark; no AI or company files. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = process.env.TOPOLOGY_BASELINE ?? '9e2603a7aa04b76d7c1e5555b780488781a9d042';
assert.match(baseline, /^[a-f0-9]{40}$/, 'TOPOLOGY_BASELINE must be an exact Git commit SHA');
const rounds = Number(process.env.PERF_ROUNDS ?? 3);
assert.ok(Number.isSafeInteger(rounds) && rounds >= 1 && rounds <= 10);
const build = mkdtempSync(path.join(tmpdir(), 'esa-topology-perf-'));
const require = createRequire(import.meta.url);
const median = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};
function compile(arm) {
  const dir = path.join(build, arm);
  mkdirSync(dir);
  for (const name of ['device-vocabulary', 'device-class', 'bounds-index', 'terminal-path-resolver']) {
    const relative = `src/agent/drawing/${name}.ts`;
    if (arm === 'before' && name === 'bounds-index') continue;
    const source = arm === 'before'
      ? execFileSync('git', ['show', `${baseline}:${relative}`], { cwd: root, encoding: 'utf8' })
      : readFileSync(path.join(root, relative), 'utf8');
    const result = ts.transpileModule(source, {
      fileName: `${name}.ts`, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    });
    assert.equal((result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0);
    writeFileSync(path.join(dir, `${name}.js`), result.outputText);
  }
  return require(path.join(dir, 'terminal-path-resolver.js')).resolveTerminalPaths;
}
function fixture(count, mixed) {
  const symbols = [], lines = [];
  const symbol = (id, x, y) => ({ id, displayId: id, typeCandidates: ['breaker'], confirmedType: 'breaker', certainty: 'confirmed',
    ports: [{ x, y }], evidence: [{ evidenceId: `e-${id}`, pageIndex: 0, bounds: { x: x - 5, y: y - 15, w: 10, h: 15 }, confidence: 0.95 }] });
  const line = (id, from, to) => ({ id, displayId: id, lineKind: 'power', certainty: 'confirmed', geometrySource: 'observed',
    path: [from, to], junctions: [], crossovers: [],
    evidence: [{ evidenceId: `e-${id}`, pageIndex: 0, bounds: { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) }, confidence: 0.95 }] });
  for (let index = 0; index < count; index++) {
    const x = (index % 16) * 450 - 900, y = Math.floor(index / 16) * 90 - 90;
    symbols.push(symbol(`A-${index}`, x, y), symbol(`B-${index}`, x + 300, y));
    const segments = Array.from({ length: 3 }, (_, i) => line(`L-${index}-${i}`, { x: x + i * 100, y }, { x: x + (i + 1) * 100, y }));
    if (mixed && index % 7 === 0) segments[1].certainty = 'ambiguous';
    if (mixed && index % 11 === 0) segments[0].crossovers.push({ x: x + 100, y });
    if (mixed && index % 13 === 0) {
      // An uncertain third branch must block proofs rather than disappear in broad-phase filtering.
      symbols.push(symbol(`C-${index}`, x + 150, y + 40));
      const branch = line(`branch-${index}`, { x: x + 150, y }, { x: x + 150, y: y + 40 });
      branch.certainty = 'ambiguous';
      lines.push(branch);
    }
    lines.push(...segments);
  }
  return { symbols, lines };
}
function summary(proofs) {
  return proofs.map((proof) => ({ from: proof.from.id, to: proof.to.id, fromPort: proof.fromPort, toPort: proof.toPort,
    lines: proof.lines.map((line) => line.id) }));
}
try {
  const before = compile('before'), after = compile('after');
  const cases = [];
  for (const spec of [{ count: 64, mixed: false }, { count: 256, mixed: false }, { count: 512, mixed: false }, { count: 256, mixed: true }]) {
    const source = fixture(spec.count, spec.mixed);
    const frozen = JSON.stringify(source);
    const trials = [];
    for (let round = 0; round < rounds; round++) {
      const outputs = {}, times = {};
      for (const arm of round % 2 ? ['after', 'before'] : ['before', 'after']) {
        globalThis.gc?.();
        const start = performance.now();
        outputs[arm] = (arm === 'before' ? before : after)(source.symbols, source.lines, 0);
        times[arm] = performance.now() - start;
      }
      assert.deepEqual(summary(outputs.after), summary(outputs.before), 'terminal proofs or stable relation order changed');
      assert.equal(JSON.stringify(source), frozen, 'benchmark changed its input');
      if (!spec.mixed) assert.equal(outputs.after.length, spec.count);
      trials.push({ round: round + 1, beforeMs: times.before, afterMs: times.after, proofs: outputs.after.length });
    }
    const beforeMs = median(trials.map((trial) => trial.beforeMs));
    const afterMs = median(trials.map((trial) => trial.afterMs));
    cases.push({ ...spec, symbols: source.symbols.length, lines: source.lines.length, sameProofs: true,
      medianBeforeMs: beforeMs, medianAfterMs: afterMs, reductionPercent: 100 * (1 - afterMs / beforeMs), trials });
  }
  const result = { scope: 'Terminal-path geometry only on synthetic circuits; not complete drawing/AI latency', baseline,
    node: process.version, rounds, sourceSha256: createHash('sha256').update(readFileSync(path.join(root, 'src/agent/drawing/terminal-path-resolver.ts'))).digest('hex'), cases };
  const output = process.env.TOPOLOGY_OUTPUT ?? path.join(root, 'test-results/drawing-topology-performance.json');
  if (!existsSync(path.dirname(output))) mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(result, null, 2));
  console.log('TOPOLOGY_PERFORMANCE', JSON.stringify(result));
} finally {
  rmSync(build, { recursive: true, force: true });
}
