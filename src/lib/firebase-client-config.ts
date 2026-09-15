/** Public Firebase configuration shared by lazy initialization and CSP.
 * Presence is not credential validity or authorization. The SDK/server must
 * still verify the configured project and the actual user's token. */
export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

export function readFirebaseClientConfig(): FirebaseClientConfig {
  // Explicit property access is required for Next's client-side env inlining.
  return {
    apiKey: (process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '').trim(),
    authDomain: (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '').trim(),
    projectId: (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '').trim(),
  };
}

/** authDomain is a bare DNS hostname, never a URL or a CSP source expression. */
export function firebaseAuthOrigin(domain: string): string | null {
  if (typeof domain !== 'string' || domain.length > 253 || domain !== domain.trim()) return null;
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
  return `https://${domain.toLowerCase()}`;
}

export function hasFirebaseClientConfig(config: FirebaseClientConfig): boolean {
  const fields = [config.apiKey, config.authDomain, config.projectId];
  if (fields.some((value) => typeof value !== 'string' || !value.trim()
    || /^(?:dummy|undefined|null|your[-_ ].*)$/i.test(value.trim()))) return false;
  return firebaseAuthOrigin(config.authDomain) !== null;
}
