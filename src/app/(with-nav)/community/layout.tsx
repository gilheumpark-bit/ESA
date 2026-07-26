import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '질의응답 · ESVA',
  description: '현장 전기 실무 질문과 답변 — 근거 조항을 함께 남기는 게시판.',
};

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
