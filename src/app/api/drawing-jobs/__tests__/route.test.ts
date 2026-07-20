import { NextRequest } from 'next/server';

import { runDocumentAnalysis } from '@/agent/drawing/document-orchestrator';
import { cancelOwnedJob, createJob, getOwnedJob } from '@/agent/drawing/drawing-job-store';
import { createSourceLease, isSourceLeaseAvailable } from '@/agent/drawing/source-lease-store';
import { resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';
import { DELETE, GET, POST } from '../route';

jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/request-origin', () => ({ isRequestOriginAllowed: jest.fn(() => true) }));
jest.mock('@/agent/drawing/document-orchestrator', () => ({ runDocumentAnalysis: jest.fn() }));
jest.mock('@/agent/drawing/drawing-job-store', () => ({
  getOwnedJob: jest.fn(),
  updateOwnedJob: jest.fn(),
  cancelOwnedJob: jest.fn(),
  createJob: jest.fn(),
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

const owner = { ownerId: 'user:test-user', authenticated: true };

function formRequest(extras: Record<string, string> = {}): NextRequest {
  const form = new FormData();
  form.set('file', new File(['drawing'], 'sample.png', { type: 'image/png' }));
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

  it('rejects malformed pages and providers before analysis', async () => {
    expect((await POST(formRequest({ pages: '1,bad' }))).status).toBe(400);
    expect((await POST(formRequest({ provider: 'unknown' }))).status).toBe(400);
    expect(runDocumentAnalysis).not.toHaveBeenCalled();
  });

  it('creates an owned encrypted deferred job before any model call', async () => {
    jest.mocked(isSourceLeaseAvailable).mockReturnValue(true);
    jest.mocked(createJob).mockReturnValue({ jobId: 'job-deferred', status: 'QUEUED', estimated: { pages: 1 } } as never);
    jest.mocked(createSourceLease).mockReturnValue({ leaseId: 'lease-a', documentHash: 'a'.repeat(64), expiresAt: Date.now() + 60_000 });

    const response = await POST(formRequest({ deferred: '1' }));

    expect(response.status).toBe(202);
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({ ownerId: owner.ownerId }));
    expect(createSourceLease).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.stringMatching(/^[a-f0-9]{64}$/), owner.ownerId);
    expect(runDocumentAnalysis).not.toHaveBeenCalled();
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

  it('does not expose provider errors to the client', async () => {
    const diagnostic = ['provider', 'secret', 'internal', 'path'].join('-');
    jest.mocked(runDocumentAnalysis).mockRejectedValue(new Error(diagnostic));
    const response = await POST(formRequest({ apiKey: 'request-key', provider: 'openai' }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(diagnostic);
  });
});
