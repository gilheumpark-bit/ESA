import { finishOwnedJobRun, heartbeatOwnedJobRun } from './drawing-job-store';

export function maintainDrawingRun(jobId: string, ownerId: string, runId: string, requestSignal: AbortSignal) {
  const leaseLost = new AbortController();
  const signal = AbortSignal.any([requestSignal, leaseLost.signal, AbortSignal.timeout(1_800_000)]);
  const timer = setInterval(() => {
    try {
      if (!heartbeatOwnedJobRun(jobId, ownerId, runId)) leaseLost.abort(new Error('DRAWING_RUN_LEASE_LOST'));
    } catch { leaseLost.abort(new Error('DRAWING_RUN_LEASE_LOST')); }
  }, 20_000);
  timer.unref?.();
  return {
    signal,
    stop() { clearInterval(timer); },
    release() { clearInterval(timer); return finishOwnedJobRun(jobId, ownerId, runId); },
  };
}
