import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '프로젝트 · ESVA',
  description: '프로젝트에 묶인 계산·도면·검토 결과.',
};

export default function ProjectDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
