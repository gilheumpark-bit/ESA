import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '모바일 도구 · ESVA',
  description: '현장 촬영 도면 판독과 빠른 계산 — 휴대폰 화면 기준 화면.',
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
