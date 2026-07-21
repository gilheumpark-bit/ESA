/**
 * Shared auth helpers for API routes
 */
import { verifyIdToken, type DecodedToken } from './firebase-id-token';

export async function extractVerifiedUser(request: Request): Promise<DecodedToken | null> {
  const authHeader = request.headers.get('Authorization') ?? request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;

  try {
    return await verifyIdToken(token);
  } catch {
    return null;
  }
}

export async function extractVerifiedUserId(request: Request): Promise<string | null> {
  return (await extractVerifiedUser(request))?.uid ?? null;
}
