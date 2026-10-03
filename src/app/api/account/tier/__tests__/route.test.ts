import { NextRequest } from 'next/server';
import { extractVerifiedUser } from '@/lib/auth-helpers';
import { claimProjectInvitations } from '@/lib/collaboration';
import { ensureUserProfile, getUserTier, isUserAdmin } from '@/lib/supabase';
import { GET } from '../route';

jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUser: jest.fn() }));
jest.mock('@/lib/collaboration', () => ({ claimProjectInvitations: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  ensureUserProfile: jest.fn(),
  getUserTier: jest.fn(),
  isUserAdmin: jest.fn(),
}));

const mockUser = jest.mocked(extractVerifiedUser);
const mockClaim = jest.mocked(claimProjectInvitations);
const mockEnsure = jest.mocked(ensureUserProfile);
const mockTier = jest.mocked(getUserTier);
const mockAdmin = jest.mocked(isUserAdmin);

const request = new NextRequest('http://localhost:3000/api/account/tier', {
  headers: { Authorization: 'Bearer token' },
});

describe('GET /api/account/tier invitation claim', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsure.mockResolvedValue();
    mockClaim.mockResolvedValue(1);
    mockTier.mockResolvedValue('free');
    mockAdmin.mockResolvedValue(false);
  });

  // 관리자 화면 링크는 요금제가 아니라 역할로 열린다. 등급이 무엇이든 역할 값이 그대로 실려야 한다.
  test.each([[true], [false]])('reports the admin role as isAdmin=%s independent of tier', async (admin) => {
    mockUser.mockResolvedValue({ uid: 'firebase-a', email: 'a@example.com', emailVerified: true });
    mockAdmin.mockResolvedValue(admin);

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect((await response.json()).data.isAdmin).toBe(admin);
    expect(mockAdmin).toHaveBeenCalledWith('firebase-a');
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

  // 이 라우트는 로그인한 본인이 세션을 열 때 불린다 — 관리자 화면의 「마지막 로그인」이 여기서 채워진다.
  test('stamps the sign-in time for the session owner', async () => {
    mockUser.mockResolvedValue({ uid: 'firebase-a', email: 'a@example.com', emailVerified: true });

    await GET(request);

    expect(mockEnsure).toHaveBeenCalledWith('firebase-a', 'a@example.com', { signedIn: true });
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
