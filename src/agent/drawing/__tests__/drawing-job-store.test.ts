import {
  _resetJobsForTests,
  cancelOwnedJob,
  createJob,
  getOwnedJob,
  updateOwnedJob,
} from '../drawing-job-store';

const budget = { maxPages: 5, maxVlmCalls: 100, maxPixels: 1_000_000, deadlineMs: 60_000 };

describe('drawing job ownership', () => {
  const originalStoreDir = process.env.DRAWING_JOB_STORE_DIR;
  beforeEach(() => _resetJobsForTests());

  afterEach(() => {
    if (originalStoreDir === undefined) delete process.env.DRAWING_JOB_STORE_DIR;
    else process.env.DRAWING_JOB_STORE_DIR = originalStoreDir;
  });

  it('prevents cross-owner reads and writes', () => {
    const job = createJob({ documentHash: 'a'.repeat(64), ownerId: 'owner-a', budget, estimatedPages: 1 });

    expect(getOwnedJob(job.jobId, 'owner-a')?.jobId).toBe(job.jobId);
    expect(getOwnedJob(job.jobId, 'owner-b')).toBeUndefined();
    expect(updateOwnedJob(job.jobId, 'owner-b', { status: 'COMPLETE' })).toBeUndefined();
    expect(getOwnedJob(job.jobId, 'owner-a')?.status).toBe('QUEUED');
  });

  it('cancels only the owner job and records a cancellation signal', () => {
    const job = createJob({ documentHash: 'b'.repeat(64), ownerId: 'owner-a', budget, estimatedPages: 1 });

    expect(cancelOwnedJob(job.jobId, 'owner-b')).toBe(false);
    expect(cancelOwnedJob(job.jobId, 'owner-a')).toBe(true);
    expect(getOwnedJob(job.jobId, 'owner-a')).toMatchObject({ status: 'CANCELLED', cancelRequested: true });
  });

  it('persists jobs on a configured durable shared directory', () => {
    const storeDir = mkdtempSync(join(tmpdir(), 'esa-drawing-jobs-'));
    process.env.DRAWING_JOB_STORE_DIR = storeDir;
    try {
      const job = createJob({ documentHash: 'c'.repeat(64), ownerId: 'owner-a', budget, estimatedPages: 2 });
      _resetJobsForTests();
      expect(getOwnedJob(job.jobId, 'owner-a')).toMatchObject({ jobId: job.jobId, estimated: { pages: 2 } });
      expect(updateOwnedJob(job.jobId, 'owner-a', { status: 'PARTIAL' })?.status).toBe('PARTIAL');
    } finally {
      delete process.env.DRAWING_JOB_STORE_DIR;
      rmSync(storeDir, { recursive: true, force: true });
    }
  });
});
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
