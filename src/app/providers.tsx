'use client';

import { useEffect } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    import('@/lib/error-reporter').then(({ initErrorReporter }) => {
      cleanup = initErrorReporter();
    });
    return () => cleanup?.();
  }, []);

  return <AuthProvider>{children}</AuthProvider>;
}
