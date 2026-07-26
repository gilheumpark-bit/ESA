import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '질문 · ESVA',
  description: '전기 실무 질문과 답변.',
};

export default function CommunityDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
