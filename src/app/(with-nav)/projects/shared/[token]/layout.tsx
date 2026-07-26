import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '공유된 프로젝트 · ESVA',
  description: '링크로 공유된 프로젝트 열람.',
};

export default function ProjectSharedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
