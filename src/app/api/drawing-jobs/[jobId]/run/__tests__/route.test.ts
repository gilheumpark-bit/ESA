import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';
import { claimOwnedJobRun, getOwnedJob } from '@/agent/drawing/drawing-job-store';
import { runDocumentAnalysis } from '@/agent/drawing/document-orchestrator';
import { readSourceLease, releaseSourceLease } from '@/agent/drawing/source-lease-store';
import { maxDuration, POST } from '../route';

jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/request-origin', () => ({ isRequestOriginAllowed: jest.fn(() => true) }));
jest.mock('@/agent/drawing/drawing-api-owner', () => ({ resolveDrawingOwner: jest.fn() }));
jest.mock('@/agent/drawing/document-orchestrator', () => ({ runDocumentAnalysis: jest.fn() }));
jest.mock('@/agent/drawing/drawing-job-store', () => ({
  claimOwnedJobRun: jest.fn(), getOwnedJob: jest.fn(), nextPendingRequestedPage: jest.fn(() => 0), updateOwnedJob: jest.fn(),
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

function byokRequest(): NextRequest {
  const form = new FormData();
  form.set('provider', 'openai');
  form.set('apiKey', 'request-owned-key');
  return new NextRequest('http://localhost/api/drawing-jobs/job-a/run', {
    method: 'POST', headers: { origin: 'http://localhost' }, body: form,
  });
}

describe('drawing job run API', () => {
  it('keeps the route execution window aligned with the full-document budget', () => {
    expect(maxDuration).toBe(1800);
    const deployment = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { functions?: unknown };
    expect(deployment.functions).toBeUndefined();
  });

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
    expect(runDocumentAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-a', ownerId: owner.ownerId, signal: expect.any(AbortSignal), maxPagesPerRun: 1, preparationPages: [0],
    }));
  });

  it('requires BYOK before an anonymous owner can run a queued job', async () => {
    jest.mocked(resolveDrawingOwner).mockResolvedValue({
      ownerId: owner.ownerId,
      authenticated: false,
    });
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'deployment-owned-key';

    const response = await POST(request(), { params: Promise.resolve({ jobId: 'job-a' }) });

    expect(response.status).toBe(401);
    expect(claimOwnedJobRun).not.toHaveBeenCalled();
    expect(runDocumentAnalysis).not.toHaveBeenCalled();
  });

  it('preserves anonymous queued-job execution with BYOK', async () => {
    jest.mocked(resolveDrawingOwner).mockResolvedValue({
      ownerId: owner.ownerId,
      authenticated: false,
    });
    jest.mocked(runDocumentAnalysis).mockResolvedValue({
      job, document: { documentHash: 'a'.repeat(64), jobStatus: 'PARTIAL' },
    } as never);

    const response = await POST(byokRequest(), { params: Promise.resolve({ jobId: 'job-a' }) });

    expect(response.status).toBe(200);
    expect(runDocumentAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      vision: expect.objectContaining({ apiKey: 'request-owned-key' }),
    }));
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
    expect(releaseSourceLease).not.toHaveBeenCalled();
    expect(jest.requireMock('@/agent/drawing/drawing-job-store').updateOwnedJob).toHaveBeenCalledWith(
      'job-a', owner.ownerId, expect.objectContaining({ status: 'QUEUED' }),
    );
  });
});
