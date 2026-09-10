'use client';

import { FeatureRequestError } from './feature-request';

/** For non-billing feature reads/writes. Existing billing transports are unchanged. */
export const featureAuthenticatedFetch: typeof fetch = async (input, init) => {
  if (typeof input !== 'string' || !/^\/api\/(?!\/)/.test(input) || /[\\\u0000-\u001f]/.test(input)) {
    throw new FeatureRequestError('인증 정보는 내부 API에만 전달할 수 있습니다.');
  }
  init?.signal?.throwIfAborted();
  const { getIdToken } = await import('./firebase');
  const token = await getIdToken();
  init?.signal?.throwIfAborted();
  if (!token) throw new FeatureRequestError('로그인이 필요합니다.', 401);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, credentials: 'same-origin' });
};
