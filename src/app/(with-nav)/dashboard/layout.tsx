import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '대시보드 · ESVA',
  description: '나의 계산 통계 · 최근 활동 · 다국가 규격 비교 · 규격 업데이트 알림.',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
