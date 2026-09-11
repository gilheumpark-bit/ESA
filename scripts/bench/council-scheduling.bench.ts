// Invoke with Jest --testMatch for this manual .bench.ts file.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { runDrawingCouncil, type DrawingCouncilResult } from '../../src/agent/vision/drawing-council';
import { schedulingInput, schedulingResponse, isPrecision } from '../../src/agent/vision/test-support/scheduling-fixture';

const root = path.resolve(__dirname, '../..');
const baseline = process.env.SCHEDULING_BASELINE ?? 'ea11b447e83a15755841d0748f165620eac054b6';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

it('compares actual baseline and new council scheduling with identical synthetic provider work', async () => {
  expect(baseline).toMatch(/^(?:[a-f0-9]{40}|baseline-ea11)$/);
  const source = execFileSync('git', ['show', `${baseline}:src/agent/vision/drawing-council.ts`], { cwd: root, encoding: 'utf8' });
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const baselineModule = { exports: {} as { runDrawingCouncil: typeof runDrawingCouncil } };
  runInNewContext(compiled.outputText, {
    exports: baselineModule.exports, module: baselineModule,
    require: (name: string) => jest.requireActual(name.startsWith('.') ? path.resolve(root, 'src/agent/vision', name) : name),
    ArrayBuffer, Uint8Array, Buffer, Date, Promise, AbortController, AbortSignal, performance, setTimeout, clearTimeout,
  });
  const before = baselineModule.exports.runDrawingCouncil;
  expect(typeof before).toBe('function');
  // Freeze sealed metadata timestamps, NOT elapsed performance measurements.
  // This allows exact audit prompt/receipt comparison across different schedules.
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  const cases = [];
  try {
    for (const spec of [
      { name: 'slow-logic', fullMs: 15, logicMs: 180, cropMs: 100, auditMs: 10, concurrency: 4, regions: true },
      { name: 'balanced', fullMs: 20, logicMs: 20, cropMs: 60, auditMs: 10, concurrency: 4, regions: true },
      { name: 'single-slot', fullMs: 10, logicMs: 60, cropMs: 20, auditMs: 10, concurrency: 1, regions: true },
      { name: 'no-precision', fullMs: 15, logicMs: 60, cropMs: 40, auditMs: 10, concurrency: 4, regions: false },
    ]) {
      const trials = [];
      for (let round = 0; round < 3; round++) {
        const arms: Record<string, { ms: number; maximum: number; inputs: string[]; result: Omit<DrawingCouncilResult, 'performance'> }> = {};
        for (const arm of round % 2 ? ['after', 'before'] : ['before', 'after']) {
          let active = 0, maximum = 0;
          const inputs: string[] = [];
          const start = performance.now();
          const result = await (arm === 'before' ? before : runDrawingCouncil)(schedulingInput(spec.regions, spec.concurrency, true), async (buffer, mime, role, options, context) => {
            active++; maximum = Math.max(maximum, active);
            inputs.push(digest({ bytes: [...new Uint8Array(buffer)], mime, role, options, context }));
            const ms = role === 'coverage-auditor' ? spec.auditMs : isPrecision(buffer) ? spec.cropMs : role === 'logic' ? spec.logicMs : spec.fullMs;
            await new Promise((resolve) => setTimeout(resolve, ms));
            active--;
            return schedulingResponse(role);
          });
          const ms = performance.now() - start;
          expect(active).toBe(0);
          expect(maximum).toBeLessThanOrEqual(spec.concurrency);
          const { performance: timing, ...semantic } = result;
          void timing;
          arms[arm] = { ms, maximum, inputs, result: semantic };
        }
        expect(arms.after.inputs).toEqual(arms.before.inputs);
        expect(arms.after.result).toEqual(arms.before.result);
        trials.push({ round: round + 1, order: round % 2 ? 'after-before' : 'before-after',
          beforeMs: arms.before.ms, afterMs: arms.after.ms, callCount: arms.after.inputs.length,
          inputSha256: digest(arms.after.inputs), resultSha256: digest(arms.after.result), sameInputsAndResults: true,
          maximumBefore: arms.before.maximum, maximumAfter: arms.after.maximum });
      }
      const beforeMs = median(trials.map((trial) => trial.beforeMs));
      const afterMs = median(trials.map((trial) => trial.afterMs));
      cases.push({ ...spec, medianBeforeMs: beforeMs, medianAfterMs: afterMs, reductionPercent: 100 * (1 - afterMs / beforeMs), trials });
    }
    const output = process.env.SCHEDULING_OUTPUT ?? path.join(root, 'test-results/council-scheduling.json');
    mkdirSync(path.dirname(output), { recursive: true });
    const report = { baseline, node: process.version,
      scope: 'Actual council functions with synthetic provider delays; not real AI or upload-to-report latency. Metadata timestamps frozen for exact input/output equivalence.', cases };
    writeFileSync(output, JSON.stringify(report, null, 2));
    console.log('COUNCIL_SCHEDULING', JSON.stringify(report));
  } finally {
    clock.mockRestore();
  }
}, 30_000);
