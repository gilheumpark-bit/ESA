import {
  _resetJobsForTests,
  cancelOwnedJob,
  createJob,
  getOwnedJob,
  updateOwnedJob,
} from '../drawing-job-store';

const budget = { maxPages: 5, maxVlmCalls: 100, maxPixels: 1_000_000, deadlineMs: 60_000 };

describe('drawing job ownership', () => {
  beforeEach(() => _resetJobsForTests());

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
});
