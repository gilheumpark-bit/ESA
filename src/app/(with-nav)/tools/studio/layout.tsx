import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '도면 스튜디오 · ESVA',
  description: '도면 판독 결과를 열어 보정하고 검토 보고서로 내보낸다.',
};

export default function ToolsStudioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
