import { createHash, randomBytes } from 'node:crypto';

import type { NextRequest, NextResponse } from 'next/server';

import { extractVerifiedUserId } from '@/lib/auth-helpers';

export const DRAWING_OWNER_COOKIE = 'esva_drawing_owner';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface DrawingOwnerScope {
  ownerId: string;
  authenticated: boolean;
  cookieToken?: string;
}

function anonymousOwnerId(token: string): string {
  return `anon:${createHash('sha256').update(token).digest('hex')}`;
}

export async function resolveDrawingOwner(
  request: NextRequest,
  createAnonymous: boolean,
): Promise<DrawingOwnerScope | null> {
  const userId = await extractVerifiedUserId(request);
  if (userId) return { ownerId: `user:${userId}`, authenticated: true };

  const existing = request.cookies.get(DRAWING_OWNER_COOKIE)?.value;
  if (existing && TOKEN_PATTERN.test(existing)) {
    return { ownerId: anonymousOwnerId(existing), authenticated: false };
  }
  if (!createAnonymous) return null;

  const cookieToken = randomBytes(32).toString('base64url');
  return {
    ownerId: anonymousOwnerId(cookieToken),
    authenticated: false,
    cookieToken,
  };
}

export function applyDrawingOwnerCookie(
  response: NextResponse,
  owner: DrawingOwnerScope,
): void {
  if (!owner.cookieToken) return;
  response.cookies.set(DRAWING_OWNER_COOKIE, owner.cookieToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 24 * 60 * 60,
  });
}
