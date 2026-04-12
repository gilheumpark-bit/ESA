'use client';

/**
 * ESVA Auth Context Provider
 *
 * PART 1: Types and context definition
 * PART 2: Provider component with Firebase auth state + Supabase tier lookup
 * PART 3: Consumer hook
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { ESAUser } from '@/lib/firebase';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Context
// ═══════════════════════════════════════════════════════════════════════════════

export type UserTier = 'free' | 'pro' | 'team' | 'enterprise';

export interface AuthContextValue {
  user: ESAUser | null;
  tier: UserTier;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Provider
// ═══════════════════════════════════════════════════════════════════════════════

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ESAUser | null>(null);
  const [tier, setTier] = useState<UserTier>('free');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function initAuth() {
      try {
        const { onAuthChanged } = await import('@/lib/firebase');
        unsubscribe = await onAuthChanged(async (firebaseUser) => {
          setUser(firebaseUser);
          if (firebaseUser) {
            try {
              const { getUserTier } = await import('@/lib/supabase');
              const tier = await getUserTier(firebaseUser.uid);
              setTier(tier);
            } catch {
              setTier('free');
            }
          } else {
            setTier('free');
          }
          setLoading(false);
        });
      } catch (err) {
        // Firebase not configured — run in anonymous mode
        setUser(null);
        setTier('free');
        setLoading(false);
        setError(
          err instanceof Error ? err.message : 'Auth initialization failed',
        );
      }
    }

    initAuth();
    return () => unsubscribe?.();
  }, []);

  const handleSignIn = useCallback(async () => {
    setError(null);
    try {
      const { signInWithGoogle } = await import('@/lib/firebase');
      const esaUser = await signInWithGoogle();
      setUser(esaUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setError(null);
    try {
      const { signOut: firebaseSignOut } = await import('@/lib/firebase');
      await firebaseSignOut();
      setUser(null);
      setTier('free');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-out failed');
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        tier,
        loading,
        error,
        signIn: handleSignIn,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Consumer Hook
// ═══════════════════════════════════════════════════════════════════════════════

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
