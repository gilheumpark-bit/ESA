import { createBoundedTaskPool } from '../bounded-task-pool';
import { runDrawingCouncil } from '../drawing-council';
import { isPrecision, schedulingInput, schedulingResponse } from '../test-support/scheduling-fixture';
import type { VLMOptions, VLMReviewRole } from '../vlm-client';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('dependency-ready drawing scheduling', () => {
  it('starts selected precision before independent slow logic completes', async () => {
    const logic = gate();
    const events: string[] = [];
    const pending = runDrawingCouncil(schedulingInput(), async (buffer, _mime, role) => {
      events.push(`${isPrecision(buffer) ? 'precision' : 'full'}:${role}`);
      if (role === 'logic') await logic.promise;
      return schedulingResponse(role);
    });
    await turn();
    const beforeRelease = [...events];
    logic.release();
    const result = await pending;
    expect(beforeRelease).toContain('precision:symbols');
    expect(beforeRelease).toContain('precision:connections');
    expect(beforeRelease).toContain('precision:text');
    expect(beforeRelease).not.toContain('full:coverage-auditor');
    expect(events.at(-1)).toBe('full:coverage-auditor');
    expect(result.callCounts).toEqual({ planned: 8, attempted: 8, successful: 8, failed: 0 });
  });

  it('waits for every full text variant before selecting or preparing precision', async () => {
    const text = gate();
    const events: string[] = [];
    const pending = runDrawingCouncil(schedulingInput(true, 4, true), async (buffer, _mime, role) => {
      events.push(`${isPrecision(buffer) ? 'precision' : 'full'}:${role}`);
      if (role === 'text' && !isPrecision(buffer) && new Uint8Array(buffer)[0] === 4) await text.promise;
      return schedulingResponse(role);
    });
    await turn();
    const early = [...events];
    text.release();
    const result = await pending;
    expect(early.filter((event) => event === 'full:text')).toHaveLength(3);
    expect(early.some((event) => event.startsWith('precision'))).toBe(false);
    expect(result.callCounts?.attempted).toBe(10);
  });

  it.each([1, 2, 4, 8])('keeps shared provider concurrency at %i across overlapping stages', async (limit) => {
    let active = 0, maximum = 0;
    let logicFinished = false;
    const result = await runDrawingCouncil(schedulingInput(true, limit, true), async (_buffer, _mime, role) => {
      active++; maximum = Math.max(maximum, active);
      if (role === 'coverage-auditor') expect(logicFinished).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, role === 'logic' ? 12 : 1));
      if (role === 'logic') logicFinished = true;
      active--;
      return schedulingResponse(role);
    });
    expect(maximum).toBeLessThanOrEqual(limit);
    expect(maximum).toBeGreaterThan(0);
    expect(active).toBe(0);
    expect(result.callCounts?.attempted).toBe(10);
    expect(result.failures).toEqual([]);
  });

  it('keeps mandatory logic failures and still audits the assembled evidence', async () => {
    const result = await runDrawingCouncil(schedulingInput(), async (_buffer, _mime, role) => {
      if (role === 'logic') throw new Error('synthetic logic failure');
      return schedulingResponse(role);
    });
    expect(result.failures.some((item) => item.role === 'logic' && item.fatal)).toBe(true);
    expect(result.envelopes.some((item) => item.role === 'coverage-auditor')).toBe(true);
    expect(result.callCounts).toEqual({ planned: 8, attempted: 8, successful: 7, failed: 1 });
  });

  it('preserves completed full and precision evidence when overlapping logic is cancelled', async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const input = schedulingInput();
    const pending = runDrawingCouncil({ ...input, options: { ...input.options, signal: controller.signal }, settleOnAbort: true },
      async (buffer, _mime, role, options) => {
        calls.push(role);
        if (role === 'logic') await new Promise<void>((resolve) => options.signal!.addEventListener('abort', () => resolve(), { once: true }));
        return schedulingResponse(role);
      });
    await turn();
    controller.abort();
    const result = await pending;
    expect(result.envelopes.filter((item) => ['symbols', 'connections', 'text'].includes(item.role))).toHaveLength(3);
    expect(result.envelopes.find((item) => item.role === 'symbols')?.reviewedSourceIds).toContain('crop-original');
    expect(calls).not.toContain('coverage-auditor');
    expect(result.callCounts?.attempted).toBe(calls.length);
    expect(result.failures.some((item) => item.role === 'coverage-auditor' && item.fatal)).toBe(true);
  });

  it('strict abort rejects and starts no queued provider work', async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const input = schedulingInput(true, 1);
    const pending = runDrawingCouncil({ ...input, options: { ...input.options, signal: controller.signal } }, async (_buffer, _mime, role) => {
      calls.push(role); controller.abort();
      return schedulingResponse(role);
    });
    await expect(pending).rejects.toThrow(/abort/i);
    await turn();
    expect(calls).toEqual(['symbols']);
  });

  it('targeted retry reuses sealed non-target roles without running them again', async () => {
    const base = schedulingInput(false);
    const prior = await runDrawingCouncil(base, async (_buffer, _mime, role) => schedulingResponse(role));
    const calls: string[] = [];
    const result = await runDrawingCouncil({ ...schedulingInput(), priorEnvelopes: prior.envelopes, reviewRoles: ['symbols'] }, async (_buffer, _mime, role) => {
      calls.push(role); return schedulingResponse(role);
    });
    expect(calls).toEqual(['symbols', 'coverage-auditor']);
    expect(result.envelopes.map((item) => item.role)).toEqual(prior.envelopes.map((item) => item.role));
    expect(result.callCounts?.attempted).toBe(2);
  });

  it('uses only existing full roles and one auditor when no region is selected', async () => {
    const calls: string[] = [];
    const result = await runDrawingCouncil(schedulingInput(false), async (_buffer, _mime, role) => {
      calls.push(role); return schedulingResponse(role);
    });
    expect(calls).toEqual(['symbols', 'connections', 'text', 'logic', 'coverage-auditor']);
    expect(result.performance?.selectedRegions).toBe(0);
    expect(result.performance?.graphReadyMs).toBeGreaterThanOrEqual(0);
    expect(result.performance!.graphReadyMs!).toBeLessThanOrEqual(result.performance!.totalMs);
  });

  it('does not change per-role provider, model, effort or exact image inputs', async () => {
    const input = schedulingInput();
    const actual: Array<{ marker: number; role: VLMReviewRole; options: VLMOptions }> = [];
    await runDrawingCouncil({ ...input, options: { ...input.options, model: 'fixture-model', effort: 'high' }, effortProfile: { text: 'medium' } }, async (buffer, _mime, role, options) => {
      actual.push({ marker: new Uint8Array(buffer)[0], role, options });
      return schedulingResponse(role);
    });
    expect(actual.map((item) => `${item.role}:${item.marker}`).sort()).toEqual([
      'symbols:1', 'connections:3', 'text:2', 'logic:1', 'symbols:9', 'connections:11', 'text:10', 'coverage-auditor:1',
    ].sort());
    for (const item of actual) {
      expect(item.options.provider).toBe('openai');
      expect(item.options.model).toBe('fixture-model');
      expect(item.options.effort).toBe(item.role === 'text' ? 'medium' : 'high');
    }
  });
});

describe('bounded task pool', () => {
  it('releases slots after synchronous and asynchronous exceptions', async () => {
    const pool = createBoundedTaskPool(1);
    const started: number[] = [];
    const outputs = await Promise.allSettled([
      pool.run(() => { started.push(1); throw new Error('sync'); }),
      pool.run(async () => { started.push(2); throw new Error('async'); }),
      pool.run(async () => { started.push(3); return 3; }),
    ]);
    expect(started).toEqual([1, 2, 3]);
    expect(outputs.map((item) => item.status)).toEqual(['rejected', 'rejected', 'fulfilled']);
  });
  it.each([0, -1, 1.5, 9, NaN, Infinity])('rejects invalid concurrency %p', (limit) => {
    expect(() => createBoundedTaskPool(limit)).toThrow();
  });
});
