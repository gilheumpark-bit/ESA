import { NextRequest } from 'next/server';

import { resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';
import { claimOwnedJobRun, getOwnedJob } from '@/agent/drawing/drawing-job-store';
import { runDocumentAnalysis } from '@/agent/drawing/document-orchestrator';
import { readSourceLease, releaseSourceLease } from '@/agent/drawing/source-lease-store';
import { POST } from '../route';

jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/request-origin', () => ({ isRequestOriginAllowed: jest.fn(() => true) }));
jest.mock('@/agent/drawing/drawing-api-owner', () => ({ resolveDrawingOwner: jest.fn() }));
jest.mock('@/agent/drawing/document-orchestrator', () => ({ runDocumentAnalysis: jest.fn() }));
jest.mock('@/agent/drawing/drawing-job-store', () => ({
  claimOwnedJobRun: jest.fn(), getOwnedJob: jest.fn(), updateOwnedJob: jest.fn(),
}));
jest.mock('@/agent/drawing/source-lease-store', () => ({
  readSourceLease: jest.fn(), releaseSourceLease: jest.fn(),
}));

const owner = { ownerId: 'user:a', authenticated: true };
const job = {
  jobId: 'job-a', ownerId: owner.ownerId, status: 'QUEUED', sourceLease: { leaseId: 'lease-a', expiresAt: Date.now() + 1000 },
  sourceMetadata: { mimeType: 'image/png', fileName: 'a.png', requestedPages: 'all' },
  budget: { maxPages: 50, maxVlmCalls: 120, maxPixels: 40_000_000, deadlineMs: 60_000 },
};

function request(): NextRequest {
  return new NextRequest('http://localhost/api/drawing-jobs/job-a/run', {
    method: 'POST', headers: { origin: 'http://localhost' }, body: new FormData(),
  });
}

describe('drawing job run API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveDrawingOwner).mockResolvedValue(owner);
    jest.mocked(getOwnedJob).mockReturnValue(job as never);
    jest.mocked(readSourceLease).mockReturnValue(Uint8Array.from([1, 2, 3]).buffer);
    jest.mocked(claimOwnedJobRun).mockReturnValue(job as never);
  });

  it('claims the queued owned job before executing the production path', async () => {
    jest.mocked(runDocumentAnalysis).mockResolvedValue({
      job, document: { documentHash: 'a'.repeat(64), jobStatus: 'PARTIAL' },
    } as never);
    const response = await POST(request(), { params: Promise.resolve({ jobId: 'job-a' }) });
    expect(response.status).toBe(200);
    expect(claimOwnedJobRun).toHaveBeenCalledWith('job-a', owner.ownerId, ['QUEUED']);
    expect(runDocumentAnalysis).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-a', ownerId: owner.ownerId }));
  });

  it('rejects a duplicate run and redacts fatal provider details', async () => {
    jest.mocked(claimOwnedJobRun).mockReturnValueOnce(undefined);
    expect((await POST(request(), { params: Promise.resolve({ jobId: 'job-a' }) })).status).toBe(409);

    const diagnostic = 'secret-provider-message';
    jest.mocked(claimOwnedJobRun).mockReturnValue(job as never);
    jest.mocked(runDocumentAnalysis).mockRejectedValue(new Error(diagnostic));
    const response = await POST(request(), { params: Promise.resolve({ jobId: 'job-a' }) });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(diagnostic);
    expect(releaseSourceLease).toHaveBeenCalledWith('lease-a', owner.ownerId);
  });
});
