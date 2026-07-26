import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '문의 · ESVA',
  description: '기능 요청·오류 신고·도입 문의.',
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
