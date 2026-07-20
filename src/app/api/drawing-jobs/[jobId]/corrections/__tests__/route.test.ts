import { NextRequest } from 'next/server';

import { applyDrawingCorrection } from '@/agent/drawing/apply-drawing-correction';
import { getOwnedJob, updateOwnedJobIfDocumentVersion } from '@/agent/drawing/drawing-job-store';
import { resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';
import { POST } from '../route';

jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/request-origin', () => ({ isRequestOriginAllowed: jest.fn(() => true) }));
jest.mock('@/agent/drawing/drawing-api-owner', () => ({ resolveDrawingOwner: jest.fn() }));
jest.mock('@/agent/drawing/drawing-job-store', () => ({
  getOwnedJob: jest.fn(),
  updateOwnedJobIfDocumentVersion: jest.fn(),
}));
jest.mock('@/agent/drawing/apply-drawing-correction', () => ({ applyDrawingCorrection: jest.fn() }));

const owner = { ownerId: 'owner-a', authenticated: true };
const updatedAt = '2026-07-21T00:00:00.000Z';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/drawing-jobs/job-a/corrections', {
    method: 'POST',
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function job(corrections: Array<Record<string, unknown>> = [], status = 'COMPLETE') {
  return {
    jobId: 'job-a', ownerId: owner.ownerId, sourceLease: undefined, status,
    document: {
      updatedAt, jobStatus: 'COMPLETE', userCorrections: corrections,
      evidenceGraph: {
        texts: [{ displayId: 'P01-T001' }],
        symbols: [{ displayId: 'P01-S001' }],
      },
    },
  };
}

describe('drawing correction API concurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveDrawingOwner).mockResolvedValue(owner);
    jest.mocked(getOwnedJob).mockReturnValue(job() as never);
  });

  it('rejects a stale document version before applying a correction', async () => {
    const response = await POST(request({
      targetDisplayId: 'P01-T001', selectedValue: '100A', correctionKind: 'text',
      expectedUpdatedAt: '2026-07-20T00:00:00.000Z', idempotencyKey: 'request-0001',
    }), { params: Promise.resolve({ jobId: 'job-a' }) });
    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(applyDrawingCorrection).not.toHaveBeenCalled();
  });

  it('returns an already-applied idempotent correction without applying twice', async () => {
    const existing = { idempotencyKey: 'request-0002', correctionId: 'corr-request-0002' };
    jest.mocked(getOwnedJob).mockReturnValue(job([existing]) as never);
    const response = await POST(request({
      targetDisplayId: 'P01-T001', selectedValue: '100A', correctionKind: 'text',
      expectedUpdatedAt: '2026-07-20T00:00:00.000Z', idempotencyKey: 'request-0002',
    }), { params: Promise.resolve({ jobId: 'job-a' }) });
    expect(response.status).toBe(200);
    expect((await response.json()).data.correction).toEqual(existing);
    expect(applyDrawingCorrection).not.toHaveBeenCalled();
    expect(updateOwnedJobIfDocumentVersion).not.toHaveBeenCalled();
  });

  it('requires correction kind to match the evidence entity', async () => {
    const response = await POST(request({
      targetDisplayId: 'P01-T001', selectedValue: 'mccb', correctionKind: 'type',
      expectedUpdatedAt: updatedAt, idempotencyKey: 'request-0003',
    }), { params: Promise.resolve({ jobId: 'job-a' }) });
    expect(response.status).toBe(400);
    expect(applyDrawingCorrection).not.toHaveBeenCalled();
  });

  it('rejects corrections while analysis is running before applying any mutation', async () => {
    jest.mocked(getOwnedJob).mockReturnValue(job([], 'ANALYZING_PAGES') as never);
    const response = await POST(request({
      targetDisplayId: 'P01-T001', selectedValue: '100A', correctionKind: 'text',
      expectedUpdatedAt: updatedAt, idempotencyKey: 'request-0004',
    }), { params: Promise.resolve({ jobId: 'job-a' }) });

    expect(response.status).toBe(409);
    expect(applyDrawingCorrection).not.toHaveBeenCalled();
    expect(updateOwnedJobIfDocumentVersion).not.toHaveBeenCalled();
  });
});
