/**
 * ESVA Firebase Auth (Lazy Loaded)
 * --------------------------------
 * Google popup login, singleton app/auth, auth state listener.
 * All Firebase modules are dynamically imported to reduce bundle size.
 */

import type { FirebaseApp } from 'firebase/app';
import type { Auth, User, Unsubscribe } from 'firebase/auth';

// ─── PART 1: Types ────────────────────────────────────────────

export interface ESAUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: string;
}

export interface AuthState {
  user: ESAUser | null;
  loading: boolean;
  error: string | null;
}

// ─── PART 2: Firebase Config ──────────────────────────────────

function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  };
}

function validateConfig(config: ReturnType<typeof getFirebaseConfig>): void {
  if (!config.apiKey || !config.authDomain || !config.projectId) {
    throw new Error(
      '[ESVA] Firebase not configured. Set NEXT_PUBLIC_FIREBASE_API_KEY, ' +
      'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, and NEXT_PUBLIC_FIREBASE_PROJECT_ID.',
    );
  }
}

// ─── PART 3: Singleton App & Auth ─────────────────────────────

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;

/**
 * Get or create the Firebase App singleton.
 * Lazy-loads firebase/app to keep the initial bundle small.
 */
export async function getFirebaseApp(): Promise<FirebaseApp> {
  if (_app) return _app;

  const config = getFirebaseConfig();
  validateConfig(config);

  const { initializeApp, getApps, getApp } = await import('firebase/app');

  const existingApps = getApps();
  _app = existingApps.length > 0 ? getApp() : initializeApp(config);

  return _app;
}

/**
 * Get or create the Firebase Auth singleton.
 * Lazy-loads firebase/auth.
 */
export async function getFirebaseAuth(): Promise<Auth> {
  if (_auth) return _auth;

  const app = await getFirebaseApp();
  const { getAuth } = await import('firebase/auth');

  _auth = getAuth(app);
  return _auth;
}

// ─── PART 4: Auth Actions ─────────────────────────────────────

/**
 * Sign in with Google popup.
 * Returns the ESVA user object on success.
 */
export async function signInWithGoogle(): Promise<ESAUser> {
  if (typeof window === 'undefined') {
    throw new Error('[ESVA] signInWithGoogle is only available in the browser.');
  }

  const auth = await getFirebaseAuth();
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');

  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');

  try {
    const result = await signInWithPopup(auth, provider);
    return mapFirebaseUser(result.user);
  } catch (err) {
    const error = err as { code?: string; message?: string };
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Login cancelled by user');
    }
    if (error.code === 'auth/popup-blocked') {
      throw new Error('Popup blocked by browser. Please allow popups for this site.');
    }
    throw new Error(`Google sign-in failed: ${error.message ?? 'Unknown error'}`);
  }
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  const auth = await getFirebaseAuth();
  const { signOut: firebaseSignOut } = await import('firebase/auth');
  await firebaseSignOut(auth);
}

/**
 * Listen for auth state changes.
 * Returns an unsubscribe function.
 */
export async function onAuthChanged(
  callback: (user: ESAUser | null) => void,
): Promise<Unsubscribe> {
  const auth = await getFirebaseAuth();
  const { onAuthStateChanged } = await import('firebase/auth');

  return onAuthStateChanged(auth, (firebaseUser: User | null) => {
    callback(firebaseUser ? mapFirebaseUser(firebaseUser) : null);
  });
}

/**
 * Get the current user's ID token for server-side verification.
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const auth = await getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

/**
 * Get the currently signed-in user (if any).
 */
export async function getCurrentUser(): Promise<ESAUser | null> {
  const auth = await getFirebaseAuth();
  const user = auth.currentUser;
  return user ? mapFirebaseUser(user) : null;
}

// ─── PART 5: Helpers ──────────────────────────────────────────

function mapFirebaseUser(user: User): ESAUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    provider: user.providerData[0]?.providerId ?? 'unknown',
  };
}
