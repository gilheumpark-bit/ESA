import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '단선도 검토 · ESVA',
  description: '단선도 PDF를 읽어 계통을 복원하고 보호·용량·전압강하를 검토한다.',
};

export default function ToolsSldLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
