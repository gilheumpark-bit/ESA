/**
 * Shared auth helpers for API routes
 */
import { verifyIdToken } from './firebase-id-token';

export async function extractVerifiedUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization') ?? request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;

  try {
    const decoded = await verifyIdToken(token);
    return decoded?.uid ?? null;
  } catch {
    // Development-only fallback: decode without verification
    if (process.env.NODE_ENV === 'development') {
      try {
        const payloadB64 = token.split('.')[1];
        if (!payloadB64) return null;
        const payload = JSON.parse(atob(payloadB64));
        return payload.user_id ?? payload.sub ?? null;
      } catch {
        return null;
      }
    }
    return null;
  }
}
