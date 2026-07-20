import { NextRequest } from 'next/server';
import { extractVerifiedUser } from '@/lib/auth-helpers';
import { claimProjectInvitations } from '@/lib/collaboration';
import { ensureUserProfile, getUserTier } from '@/lib/supabase';
import { GET } from '../route';

jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUser: jest.fn() }));
jest.mock('@/lib/collaboration', () => ({ claimProjectInvitations: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  ensureUserProfile: jest.fn(),
  getUserTier: jest.fn(),
}));

const mockUser = jest.mocked(extractVerifiedUser);
const mockClaim = jest.mocked(claimProjectInvitations);
const mockEnsure = jest.mocked(ensureUserProfile);
const mockTier = jest.mocked(getUserTier);

const request = new NextRequest('http://localhost:3000/api/account/tier', {
  headers: { Authorization: 'Bearer token' },
});

describe('GET /api/account/tier invitation claim', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsure.mockResolvedValue();
    mockClaim.mockResolvedValue(1);
    mockTier.mockResolvedValue('free');
  });

  test('claims invitations only for a verified token email', async () => {
    mockUser.mockResolvedValue({
      uid: 'firebase-a',
      email: 'Engineer@Example.com',
      emailVerified: true,
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockClaim).toHaveBeenCalledWith('firebase-a', 'Engineer@Example.com');
  });

  test('does not claim invitations using an unverified email claim', async () => {
    mockUser.mockResolvedValue({
      uid: 'firebase-a',
      email: 'attacker@example.com',
      emailVerified: false,
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockClaim).not.toHaveBeenCalled();
  });
});
