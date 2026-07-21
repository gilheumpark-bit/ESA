import { NextRequest, NextResponse } from 'next/server';

import { extractVerifiedUserId } from '@/lib/auth-helpers';
import {
  applyDrawingOwnerCookie,
  DRAWING_OWNER_COOKIE,
  resolveDrawingOwner,
} from '../drawing-api-owner';

jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn() }));

describe('drawing API owner scope', () => {
  beforeEach(() => jest.resetAllMocks());

  it('prefers verified authentication and does not mint an anonymous cookie', async () => {
    jest.mocked(extractVerifiedUserId).mockResolvedValue('user-123');
    const owner = await resolveDrawingOwner(new NextRequest('http://localhost/api/drawing-jobs'), true);
    expect(owner).toEqual({ ownerId: 'user:user-123', authenticated: true });
  });

  it('mints an opaque HttpOnly cookie and resolves the same anonymous owner later', async () => {
    jest.mocked(extractVerifiedUserId).mockResolvedValue(null);
    const first = await resolveDrawingOwner(new NextRequest('http://localhost/api/drawing-jobs'), true);
    expect(first?.ownerId).toMatch(/^anon:[a-f0-9]{64}$/);
    expect(first?.cookieToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const response = NextResponse.json({ ok: true });
    applyDrawingOwnerCookie(response, first!);
    const cookie = response.cookies.get(DRAWING_OWNER_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'strict' });

    const second = await resolveDrawingOwner(new NextRequest('http://localhost/api/drawing-jobs', {
      headers: { cookie: `${DRAWING_OWNER_COOKIE}=${first?.cookieToken}` },
    }), false);
    expect(second?.ownerId).toBe(first?.ownerId);
    expect(second?.cookieToken).toBeUndefined();
  });

  it('does not create identity on a read-only lookup', async () => {
    jest.mocked(extractVerifiedUserId).mockResolvedValue(null);
    await expect(resolveDrawingOwner(new NextRequest('http://localhost/api/drawing-jobs'), false)).resolves.toBeNull();
  });
});
