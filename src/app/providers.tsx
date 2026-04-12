'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/contexts/AuthContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    // 에러 리포터 초기화
    import('@/lib/error-reporter').then(({ initErrorReporter }) => {
      cleanup = initErrorReporter();
    });
    // CWV 측정 초기화
    import('@/lib/cwv').then(({ initCWV }) => initCWV());
    // 이탈 의도 감지
    import('@/lib/analytics').then(({ trackExitIntent }) => trackExitIntent());
    return () => cleanup?.();
  }, []);

  // 페이지 전환 시 pageview 트래킹
  useEffect(() => {
    import('@/lib/analytics').then(({ trackPageView }) => trackPageView(pathname));
  }, [pathname]);

  return <AuthProvider>{children}</AuthProvider>;
}
