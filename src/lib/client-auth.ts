'use client';

import { getIdToken } from '@/lib/firebase';

/** Fetch a Firebase-protected API route without duplicating token plumbing. */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getIdToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/** Add a verified identity when one exists, while keeping genuinely public reads usable. */
export async function optionalAuthenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  let token: string | null = null;
  try {
    token = await getIdToken();
  } catch {
    // Firebase may be intentionally unconfigured for public/local-only surfaces.
  }
  if (!token) return fetch(input, init);

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
