import {
  _resetJobsForTests,
  cancelOwnedJob,
  createJob,
  getOwnedJob,
  updateOwnedJob,
  updateOwnedJobIfDocumentVersion,
} from '../drawing-job-store';
import type { DrawingDocumentV3 } from '../types-v3';

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

  it('does not let a correction CAS roll an actively running job back to PARTIAL', () => {
    const storeDir = mkdtempSync(join(tmpdir(), 'esa-drawing-jobs-running-'));
    process.env.DRAWING_JOB_STORE_DIR = storeDir;
    try {
      const job = createJob({ documentHash: 'd'.repeat(64), ownerId: 'owner-a', budget, estimatedPages: 1 });
      const document = { updatedAt: '2026-07-21T00:00:00.000Z' } as DrawingDocumentV3;
      updateOwnedJob(job.jobId, 'owner-a', { status: 'ANALYZING_PAGES', document });

      expect(updateOwnedJobIfDocumentVersion(
        job.jobId,
        'owner-a',
        document.updatedAt,
        { status: 'PARTIAL' },
      )).toBeUndefined();
      expect(getOwnedJob(job.jobId, 'owner-a')?.status).toBe('ANALYZING_PAGES');
    } finally {
      delete process.env.DRAWING_JOB_STORE_DIR;
      rmSync(storeDir, { recursive: true, force: true });
    }
  });

  it('recovers an abandoned stale job lock and does not silently lose the update', () => {
    const storeDir = mkdtempSync(join(tmpdir(), 'esa-drawing-jobs-stale-lock-'));
    process.env.DRAWING_JOB_STORE_DIR = storeDir;
    try {
      const job = createJob({ documentHash: 'e'.repeat(64), ownerId: 'owner-a', budget, estimatedPages: 1 });
      const lockPath = join(storeDir, 'jobs', `${job.jobId}.json.lock`);
      mkdirSync(lockPath);
      const stale = new Date(Date.now() - 60_000);
      utimesSync(lockPath, stale, stale);

      expect(updateOwnedJob(job.jobId, 'owner-a', { status: 'PARTIAL' })?.status).toBe('PARTIAL');
      expect(existsSync(lockPath)).toBe(false);
    } finally {
      delete process.env.DRAWING_JOB_STORE_DIR;
      rmSync(storeDir, { recursive: true, force: true });
    }
  });

  it('throws on an active lock timeout instead of returning an ambiguous undefined', () => {
    const storeDir = mkdtempSync(join(tmpdir(), 'esa-drawing-jobs-active-lock-'));
    process.env.DRAWING_JOB_STORE_DIR = storeDir;
    try {
      const job = createJob({ documentHash: 'f'.repeat(64), ownerId: 'owner-a', budget, estimatedPages: 1 });
      const lockPath = join(storeDir, 'jobs', `${job.jobId}.json.lock`);
      mkdirSync(lockPath);

      expect(() => updateOwnedJob(job.jobId, 'owner-a', { status: 'PARTIAL' })).toThrow('DRAWING_JOB_LOCK_TIMEOUT');
      expect(getOwnedJob(job.jobId, 'owner-a')?.status).toBe('QUEUED');
    } finally {
      delete process.env.DRAWING_JOB_STORE_DIR;
      rmSync(storeDir, { recursive: true, force: true });
    }
  });
});
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
