import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '도면 문자 인식 · ESVA',
  description: '도면 이미지에서 기기 명판과 결선 표기를 읽어낸다.',
};

export default function ToolsOcrLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
