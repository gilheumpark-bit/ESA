/**
 * ESVA Firebase ID Token Verification
 * ────────────────────────────────────
 * Server-side JWT verification via Google JWKS.
 * No Firebase Admin SDK required — uses jose for lightweight verification.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);

export interface DecodedToken {
  uid: string;
  email?: string;
  emailVerified?: boolean;
}

/**
 * Verify a Firebase Auth ID token (JWT).
 * Returns decoded token with uid, or null on failure.
 *
 * Requires env: NEXT_PUBLIC_FIREBASE_PROJECT_ID
 */
export async function verifyIdToken(
  token: string,
): Promise<DecodedToken | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projectId || !token.trim()) return null;

  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });

    const sub = payload.sub;
    if (typeof sub !== 'string' || !sub) return null;

    return {
      uid: sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      emailVerified:
        typeof payload.email_verified === 'boolean'
          ? payload.email_verified
          : undefined,
    };
  } catch {
    return null;
  }
}
