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
              const { getIdToken } = await import('@/lib/firebase');
              const token = await getIdToken();
              const response = token
                ? await fetch('/api/account/tier', {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store',
                  })
                : null;
              const body = response?.ok
                ? await response.json() as { data?: { tier?: UserTier } }
                : null;
              setTier(body?.data?.tier ?? 'free');
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
        if (process.env.NODE_ENV === 'development') {
          console.warn('[ESVA Auth] 초기화 실패:', err instanceof Error ? err.name : 'UnknownError');
        }
        setUser(null);
        setTier('free');
        setLoading(false);
        setError('로그인 서비스를 사용할 수 없습니다. 배포 관리자에게 인증 구성을 확인해 주세요.');
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
      console.warn('[ESVA Auth] 로그인 실패:', err instanceof Error ? err.name : 'UnknownError');
      setError('로그인에 실패했습니다. 잠시 후 다시 시도하거나 배포 관리자에게 문의해 주세요.');
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
      console.warn('[ESVA Auth] 로그아웃 실패:', err instanceof Error ? err.name : 'UnknownError');
      setError('로그아웃을 완료하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
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
