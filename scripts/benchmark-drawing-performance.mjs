/** Synthetic preprocessing benchmark. No external AI, credentials or company drawings. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'test-results');
mkdirSync(out, { recursive: true });
// Keeping this temporary build below the repository resolves installed packages
// without a platform-specific symlink or network package installation.
const build = mkdtempSync(path.join(out, '.drawing-performance-'));
const rounds = Number(process.env.PERF_ROUNDS ?? 3);
assert.ok(Number.isSafeInteger(rounds) && rounds >= 1 && rounds <= 10, 'PERF_ROUNDS must be 1..10');
const digest = (buffer) => createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
const median = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

try {
  for (const name of ['evidence-types', 'adaptive-regions', 'image-quality', 'image-variants', 'vision-splitter', 'lazy-precision-regions']) {
    const fileName = path.join(root, 'src/agent/vision', `${name}.ts`);
    const compiled = ts.transpileModule(readFileSync(fileName, 'utf8'), {
      fileName, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    });
    assert.equal((compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0, fileName);
    writeFileSync(path.join(build, `${name}.js`), compiled.outputText);
  }
  const require = createRequire(import.meta.url);
  const { preparePrecisionRegions } = require(path.join(build, 'vision-splitter.js'));
  const { prepareLazyPrecisionRegions, createRequestPreparationCache, regionDescriptorKey } = require(path.join(build, 'lazy-precision-regions.js'));
  async function fixture(width, height, spacing) {
    const lines = [];
    for (let x = 20; x < width; x += spacing) lines.push(`M${x} 10V${height - 10}`);
    for (let y = 20; y < height; y += spacing) lines.push(`M10 ${y}H${width - 10}`);
    return Uint8Array.from(await sharp(Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" fill="white"/><path d="${lines.join('')}" stroke="black" stroke-width="2"/></svg>`)).png().toBuffer()).buffer;
  }
  async function measure(mode, input, selection) {
    globalThis.gc?.();
    const cached = createRequestPreparationCache(async (buffer) => prepareLazyPrecisionRegions(buffer));
    const start = performance.now();
    const prepared = mode === 'eager' ? await preparePrecisionRegions(input) : await cached(input, 'image/png');
    const planReadyMs = performance.now() - start;
    const before = mode === 'lazy' ? prepared.statistics().cropCount : prepared.regions.length;
    const indices = selection === 'all' ? prepared.regions.map((_region, index) => index)
      : [...new Set([0, Math.floor(prepared.regions.length / 2), prepared.regions.length - 1])];
    const selected = new Array(indices.length);
    let next = 0;
    const worker = async () => {
      while (next < indices.length) {
        const slot = next++;
        const index = indices[slot];
        const region = mode === 'lazy' ? await prepared.materializeRegion(prepared.regions[index]) : prepared.regions[index];
        selected[slot] = { descriptor: regionDescriptorKey(region), pngSha256: digest(region.buffer) };
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, indices.length) }, () => worker()));
    const selectedReadyMs = performance.now() - start;
    let repeatPreparationMs = null;
    if (mode === 'lazy') {
      const again = performance.now();
      assert.equal(await cached(input.slice(0), 'image/png'), prepared);
      repeatPreparationMs = performance.now() - again;
    }
    return { mode, planReadyMs, selectedReadyMs, repeatPreparationMs, plannedRegions: prepared.regions.length,
      cropsBeforeSelection: before, cropsAfterSelection: mode === 'lazy' ? prepared.statistics().cropCount : prepared.regions.length,
      selected };
  }
  const cases = [];
  for (const spec of [
    { name: 'synthetic-grid-1200x800', width: 1200, height: 800, spacing: 80 },
    { name: 'synthetic-dense-1600x1200', width: 1600, height: 1200, spacing: 24 },
  ].flatMap((spec) => ['sparse', 'all'].map((selection) => ({ ...spec, selection })))) {
    const input = await fixture(spec.width, spec.height, spec.spacing);
    const measurements = [];
    for (let round = 0; round < rounds; round++) {
      const pair = {};
      // Alternate order; report every run instead of the fastest selected trial.
      for (const mode of round % 2 ? ['lazy', 'eager'] : ['eager', 'lazy']) pair[mode] = await measure(mode, input, spec.selection);
      assert.deepEqual(pair.lazy.selected, pair.eager.selected, 'selected role images or coordinates changed');
      assert.equal(pair.lazy.plannedRegions, pair.eager.plannedRegions);
      assert.equal(pair.lazy.cropsBeforeSelection, 0);
      assert.equal(pair.lazy.cropsAfterSelection, pair.lazy.selected.length);
      measurements.push({ round: round + 1, eager: pair.eager, lazy: pair.lazy });
    }
    const eager = median(measurements.map((item) => item.eager.selectedReadyMs));
    const lazy = median(measurements.map((item) => item.lazy.selectedReadyMs));
    cases.push({ ...spec, inputSha256: digest(input), rounds, selectedPixelEquality: true,
      medianEagerSelectedReadyMs: eager, medianLazySelectedReadyMs: lazy,
      medianPlanReadyMs: median(measurements.map((item) => item.lazy.planReadyMs)),
      medianRepeatPreparationMs: median(measurements.map((item) => item.lazy.repeatPreparationMs)),
      selectedReadyReductionPercent: 100 * (1 - lazy / eager), measurements });
  }
  const report = { scope: 'Synthetic preprocessing; sparse (3 regions) and all-region selection; two image workers; no AI latency or drawing-accuracy claim',
    node: process.version, typescript: ts.version, sharp: sharp.versions.sharp, rounds,
    sourceSha256: digest(readFileSync(path.join(root, 'src/agent/vision/lazy-precision-regions.ts'))), cases };
  const destination = process.env.PERF_OUTPUT ?? path.join(out, 'drawing-performance.json');
  writeFileSync(destination, JSON.stringify(report, null, 2));
  console.log('DRAWING_PERFORMANCE', JSON.stringify(report));
} finally {
  rmSync(build, { recursive: true, force: true });
}
