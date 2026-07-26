import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '프로젝트 · ESVA',
  description: '계산·도면·검토 결과를 프로젝트 단위로 묶어 관리한다.',
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
