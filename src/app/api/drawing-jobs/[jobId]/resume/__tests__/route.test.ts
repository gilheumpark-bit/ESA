import { NextRequest } from 'next/server';

import { resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';
import { claimOwnedJobRun, getOwnedJob, updateOwnedJob } from '@/agent/drawing/drawing-job-store';
import { runDocumentAnalysis } from '@/agent/drawing/document-orchestrator';
import { readSourceLease } from '@/agent/drawing/source-lease-store';
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
  jobId: 'job-a',
  ownerId: owner.ownerId,
  status: 'PARTIAL',
  document: { documentHash: 'a'.repeat(64), jobStatus: 'PARTIAL' },
  sourceLease: { leaseId: 'lease-a', expiresAt: Date.now() + 1_000 },
  sourceMetadata: { mimeType: 'image/png', fileName: 'a.png', requestedPages: 'all' },
  budget: { maxPages: 50, maxVlmCalls: 120, maxPixels: 40_000_000, deadlineMs: 60_000 },
};

function invalidProviderRequest(): NextRequest {
  const form = new FormData();
  form.set('provider', 'unknown');
  return new NextRequest('http://localhost/api/drawing-jobs/job-a/resume', {
    method: 'POST', headers: { origin: 'http://localhost' }, body: form,
  });
}

function validRequest(): NextRequest {
  return new NextRequest('http://localhost/api/drawing-jobs/job-a/resume', {
    method: 'POST', headers: { origin: 'http://localhost' }, body: new FormData(),
  });
}

describe('drawing job resume API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveDrawingOwner).mockResolvedValue(owner);
    jest.mocked(getOwnedJob).mockReturnValue(job as never);
    jest.mocked(readSourceLease).mockReturnValue(Uint8Array.from([1, 2, 3]).buffer);
    jest.mocked(claimOwnedJobRun).mockReturnValue(job as never);
  });

  it('validates the request before claiming a partial job', async () => {
    const response = await POST(invalidProviderRequest(), { params: Promise.resolve({ jobId: 'job-a' }) });

    expect(response.status).toBe(400);
    expect(claimOwnedJobRun).not.toHaveBeenCalled();
  });

  it('restores PARTIAL after a transient resume failure so the source can be retried', async () => {
    const diagnostic = 'provider-secret-detail';
    jest.mocked(runDocumentAnalysis).mockRejectedValue(new Error(diagnostic));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await POST(validRequest(), { params: Promise.resolve({ jobId: 'job-a' }) });

      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain(diagnostic);
      expect(updateOwnedJob).toHaveBeenCalledWith('job-a', owner.ownerId, expect.objectContaining({
        status: 'PARTIAL',
        error: expect.any(String),
      }));
    } finally {
      consoleError.mockRestore();
    }
  });

  it('does not bind a resumable analysis lifetime to the HTTP request signal', async () => {
    jest.mocked(runDocumentAnalysis).mockResolvedValue({
      job, document: { ...job.document, jobStatus: 'PARTIAL' },
    } as never);

    const response = await POST(validRequest(), { params: Promise.resolve({ jobId: 'job-a' }) });

    expect(response.status).toBe(200);
    expect(runDocumentAnalysis).toHaveBeenCalledWith(expect.objectContaining({ signal: undefined }));
  });
});
