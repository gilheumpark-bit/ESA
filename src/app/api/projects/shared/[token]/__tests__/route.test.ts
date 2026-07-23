import { NextRequest } from 'next/server';
import { getProject, validateShareLink } from '@/lib/collaboration';
import { loadCalculation } from '@/lib/supabase';
import { POST } from '../route';
import { checkRateLimit } from '@/lib/rate-limit';

jest.mock('@/lib/rate-limit', () => ({
  applyRateLimit: jest.fn(() => null),
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 4 })),
}));
jest.mock('@/lib/collaboration', () => ({
  getProject: jest.fn(),
  validateShareLink: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ loadCalculation: jest.fn() }));

const mockValidate = jest.mocked(validateShareLink);
const mockGetProject = jest.mocked(getProject);
const mockLoadCalculation = jest.mocked(loadCalculation);
const TOKEN = 'a'.repeat(64);

function request(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(`http://localhost:3000/api/projects/shared/${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/projects/shared/[token]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidate.mockResolvedValue({ valid: true, projectId: 'project-1' });
    mockGetProject.mockResolvedValue({
      id: 'project-1',
      name: '공유 프로젝트',
      description: '설명',
      ownerId: 'private-owner-id',
      members: [{
        userId: 'private-member-id',
        email: 'private@example.com',
        role: 'owner',
        invitedAt: '2026-01-01T00:00:00.000Z',
      }],
      calculations: ['receipt-1'],
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    mockLoadCalculation.mockResolvedValue({
      id: 'receipt-1',
      user_id: 'private-owner-id',
      calculator_id: 'voltage-drop',
      calculator_name: '전압강하',
      inputs: { secretDesignValue: 42 },
      outputs: { value: 2.1, unit: '%' },
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });

  test('returns a redacted read-only project after token validation', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockValidate).toHaveBeenCalledWith(TOKEN, undefined);
    expect(body.data.name).toBe('공유 프로젝트');
    expect(body.data.ownerId).toBeUndefined();
    expect(body.data.members).toBeUndefined();
    expect(body.data.calculations[0]).toEqual(expect.objectContaining({
      id: 'receipt-1',
      value: 2.1,
      unit: '%',
    }));
    expect(body.data.calculations[0].inputs).toBeUndefined();
  });

  test('does not load project data for an invalid token', async () => {
    mockValidate.mockResolvedValue({ valid: false, error: 'Link not found' });

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mockGetProject).not.toHaveBeenCalled();
  });

  test('requests a password without disclosing project data', async () => {
    mockValidate.mockResolvedValue({ valid: false, error: 'Password required' });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.passwordRequired).toBe(true);
    expect(mockGetProject).not.toHaveBeenCalled();
  });

  test('applies a per-link password-attempt boundary before password validation', async () => {
    const response = await POST(request({ password: 'guess' }));

    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^share:/),
      'share-password',
    );
  });

  test('returns the shared-store retry window when the global password budget is exhausted', async () => {
    mockValidate.mockResolvedValue({
      valid: false,
      error: 'Too many password attempts',
      retryAfter: 840,
    });

    const response = await POST(request({ password: 'guess' }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('840');
    expect(mockGetProject).not.toHaveBeenCalled();
  });

  test('rejects malformed tokens before hitting storage', async () => {
    const response = await POST(new NextRequest('http://localhost:3000/api/projects/shared/not-a-token', {
      method: 'POST',
      body: '{}',
    }));

    expect(response.status).toBe(400);
    expect(mockValidate).not.toHaveBeenCalled();
  });
});
