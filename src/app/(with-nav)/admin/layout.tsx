import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '운영 관리 · ESVA',
  description: '사용량·오류·비용 지표와 크롤 상태를 보는 운영자 화면.',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
