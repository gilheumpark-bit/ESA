import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '새 프로젝트 · ESVA',
  description: '프로젝트 생성 — 적용 기준과 계통 조건을 먼저 정한다.',
};

export default function ProjectNewLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
