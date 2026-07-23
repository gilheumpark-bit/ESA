import { NextRequest } from 'next/server';

import { runDocumentAnalysis } from '@/agent/drawing/document-orchestrator';
import { cancelOwnedJob, createJob, getOwnedJob, isDrawingJobStoreAvailable } from '@/agent/drawing/drawing-job-store';
import { createSourceLease, isSourceLeaseAvailable } from '@/agent/drawing/source-lease-store';
import { resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';
import { enumerateDrawingPageCount } from '@/agent/drawing/drawing-source';
import { applyRateLimit } from '@/lib/rate-limit';
import { DELETE, GET, POST } from '../route';

jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/request-origin', () => ({ isRequestOriginAllowed: jest.fn(() => true) }));
jest.mock('@/agent/drawing/document-orchestrator', () => ({ runDocumentAnalysis: jest.fn() }));
jest.mock('@/agent/drawing/drawing-job-store', () => ({
  getOwnedJob: jest.fn(),
  updateOwnedJob: jest.fn(),
  cancelOwnedJob: jest.fn(),
  createJob: jest.fn(),
  isDrawingJobStoreAvailable: jest.fn(() => true),
}));
jest.mock('@/agent/drawing/source-lease-store', () => ({
  createSourceLease: jest.fn(),
  isSourceLeaseAvailable: jest.fn(() => false),
  releaseSourceLease: jest.fn(),
}));
jest.mock('@/agent/drawing/drawing-api-owner', () => ({
  resolveDrawingOwner: jest.fn(),
  applyDrawingOwnerCookie: jest.fn(),
}));
jest.mock('@/agent/drawing/drawing-source', () => ({
  enumerateDrawingPageCount: jest.fn(async () => 18),
}));

const owner = { ownerId: 'user:test-user', authenticated: true };

function formRequest(
  extras: Record<string, string> = {},
  file = new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], 'sample.png', { type: 'image/png' }),
): NextRequest {
  const form = new FormData();
  form.set('file', file);
  for (const [key, value] of Object.entries(extras)) form.set(key, value);
  return new NextRequest('http://localhost:3000/api/drawing-jobs', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000' },
    body: form,
  });
}

describe('drawing jobs API ownership and input boundary', () => {
  const originalOpenAi = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveDrawingOwner).mockResolvedValue(owner);
    jest.mocked(isDrawingJobStoreAvailable).mockReturnValue(true);
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalOpenAi;
  });

  it('uses only the selected provider server key', async () => {
    const openAiKey = ['server', 'openai', 'test', 'key'].join('-');
    process.env.OPENAI_API_KEY = openAiKey;
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = ['wrong', 'google', 'key'].join('-');
    jest.mocked(runDocumentAnalysis).mockResolvedValue({
      job: { jobId: 'job-a', status: 'PARTIAL', estimated: {} },
      document: { documentHash: 'a'.repeat(64), jobStatus: 'PARTIAL' },
    } as never);

    const response = await POST(formRequest({ provider: 'openai' }));

    expect(response.status).toBe(200);
    expect(runDocumentAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: owner.ownerId,
      vision: expect.objectContaining({ provider: 'openai', apiKey: openAiKey }),
    }));
  });

  it('does not spend a server Vision key for an anonymous synchronous request', async () => {
    jest.mocked(resolveDrawingOwner).mockResolvedValue({
      ownerId: 'anon:session-a',
      authenticated: false,
    });
    process.env.OPENAI_API_KEY = 'deployment-owned-key';

    const response = await POST(formRequest({ provider: 'openai' }));

    expect(response.status).toBe(401);
    expect(runDocumentAnalysis).not.toHaveBeenCalled();
  });

  it('allows an anonymous synchronous request when it supplies BYOK', async () => {
    jest.mocked(resolveDrawingOwner).mockResolvedValue({
      ownerId: 'anon:session-a',
      authenticated: false,
    });
    jest.mocked(runDocumentAnalysis).mockResolvedValue({
      job: { jobId: 'job-byok', status: 'COMPLETE', estimated: {} },
      document: { documentHash: 'a'.repeat(64), jobStatus: 'COMPLETE' },
    } as never);

    const response = await POST(formRequest({
      provider: 'openai',
      apiKey: 'request-owned-key',
    }));

    expect(response.status).toBe(200);
    expect(runDocumentAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      vision: expect.objectContaining({ apiKey: 'request-owned-key' }),
    }));
  });

  it('rejects malformed pages and providers before analysis', async () => {
    expect((await POST(formRequest({ pages: '1,bad' }))).status).toBe(400);
    expect((await POST(formRequest({ provider: 'unknown' }))).status).toBe(400);
    expect(runDocumentAnalysis).not.toHaveBeenCalled();
  });

  it('returns an explicit 503 for synchronous analysis and lookup when durable job state is unavailable', async () => {
    jest.mocked(isDrawingJobStoreAvailable).mockReturnValue(false);

    const post = await POST(formRequest());
    const get = await GET(new NextRequest('http://localhost/api/drawing-jobs?jobId=job-a'));

    expect(post.status).toBe(503);
    expect(get.status).toBe(503);
    expect(runDocumentAnalysis).not.toHaveBeenCalled();
    expect(getOwnedJob).not.toHaveBeenCalled();
  });

  it('creates an owned encrypted deferred job before any model call', async () => {
    jest.mocked(isSourceLeaseAvailable).mockReturnValue(true);
    jest.mocked(createJob).mockReturnValue({ jobId: 'job-deferred', status: 'QUEUED', estimated: { pages: 1 } } as never);
    jest.mocked(createSourceLease).mockReturnValue({ leaseId: 'lease-a', documentHash: 'a'.repeat(64), expiresAt: Date.now() + 60_000 });

    const response = await POST(formRequest(
      { deferred: '1' },
      new File(['%PDF-1.7\n'], 'sample.pdf', { type: 'application/pdf' }),
    ));

    expect(response.status).toBe(202);
    expect(enumerateDrawingPageCount).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'sample.pdf' }));
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: owner.ownerId,
      estimatedPages: 18,
      budget: expect.objectContaining({ maxVlmCalls: 1980 }),
    }));
    expect(createSourceLease).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.stringMatching(/^[a-f0-9]{64}$/), owner.ownerId);
    expect(runDocumentAnalysis).not.toHaveBeenCalled();
  });

  it('requires authentication before allocating a durable deferred lease', async () => {
    jest.mocked(resolveDrawingOwner).mockResolvedValue({
      ownerId: 'anon:session-a',
      authenticated: false,
    });
    jest.mocked(isSourceLeaseAvailable).mockReturnValue(true);

    const response = await POST(formRequest(
      { deferred: '1' },
      new File(['%PDF-1.7\n'], 'sample.pdf', { type: 'application/pdf' }),
    ));

    expect(response.status).toBe(401);
    expect(createJob).not.toHaveBeenCalled();
    expect(createSourceLease).not.toHaveBeenCalled();
  });

  it('sizes the deferred budget for the 83-page teaching-document target', async () => {
    jest.mocked(isSourceLeaseAvailable).mockReturnValue(true);
    jest.mocked(enumerateDrawingPageCount).mockResolvedValueOnce(83);
    jest.mocked(createJob).mockReturnValue({ jobId: 'job-83', status: 'QUEUED', estimated: { pages: 83 } } as never);
    jest.mocked(createSourceLease).mockReturnValue({ leaseId: 'lease-83', documentHash: 'b'.repeat(64), expiresAt: Date.now() + 60_000 });

    const response = await POST(formRequest(
      { deferred: '1' },
      new File(['%PDF-1.7\n'], 'kimm-20210602-design.pdf', { type: 'application/pdf' }),
    ));

    expect(response.status).toBe(202);
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      estimatedPages: 83,
      budget: expect.objectContaining({
        maxPages: 83,
        maxVlmCalls: 9130,
        maxPixels: 498_000_000,
        deadlineMs: 3_600_000,
      }),
    }));
  });

  it('requires an owner scope for lookup and cancels only through owned store calls', async () => {
    jest.mocked(resolveDrawingOwner).mockResolvedValueOnce(null);
    expect((await GET(new NextRequest('http://localhost/api/drawing-jobs?jobId=job-a'))).status).toBe(401);

    jest.mocked(resolveDrawingOwner).mockResolvedValue(owner);
    jest.mocked(cancelOwnedJob).mockReturnValue(true);
    jest.mocked(getOwnedJob).mockReturnValue({ jobId: 'job-a' } as never);
    const cancelled = await DELETE(new NextRequest('http://localhost/api/drawing-jobs?jobId=job-a', {
      method: 'DELETE', headers: { origin: 'http://localhost' },
    }));
    expect(cancelled.status).toBe(200);
    expect(cancelOwnedJob).toHaveBeenCalledWith('job-a', owner.ownerId);
    expect(getOwnedJob).toHaveBeenCalledWith('job-a', owner.ownerId);
  });

  it('uses the job polling rate profile for status lookup', async () => {
    jest.mocked(getOwnedJob).mockReturnValue({ jobId: 'job-a', status: 'ANALYZING' } as never);

    const response = await GET(new NextRequest('http://localhost/api/drawing-jobs?jobId=job-a'));

    expect(response.status).toBe(200);
    expect(applyRateLimit).toHaveBeenLastCalledWith(expect.any(NextRequest), 'sld-job');
  });

  it('does not expose provider errors to the client', async () => {
    const diagnostic = ['provider', 'secret', 'internal', 'path'].join('-');
    jest.mocked(runDocumentAnalysis).mockRejectedValue(new Error(diagnostic));
    const response = await POST(formRequest({ apiKey: 'request-key', provider: 'openai' }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(diagnostic);
  });

  it('rejects extension-only spoofed files and marks responses private no-store', async () => {
    const spoofed = await POST(formRequest({}, new File(['not-a-png'], 'sample.png', { type: 'image/png' })));
    expect(spoofed.status).toBe(400);
    expect(spoofed.headers.get('cache-control')).toBe('private, no-store');
    expect(runDocumentAnalysis).not.toHaveBeenCalled();
  });

  it('does not retain a source lease for a completed synchronous analysis', async () => {
    jest.mocked(isSourceLeaseAvailable).mockReturnValue(true);
    jest.mocked(runDocumentAnalysis).mockResolvedValue({
      job: { jobId: 'job-complete', status: 'COMPLETE', estimated: {} },
      document: { documentHash: 'a'.repeat(64), jobStatus: 'COMPLETE' },
    } as never);
    const response = await POST(formRequest({ leaseSource: '1' }));
    expect(response.status).toBe(200);
    expect(createSourceLease).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
