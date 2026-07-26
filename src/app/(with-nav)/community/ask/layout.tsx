import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '질문하기 · ESVA',
  description: '전기 실무 질문 작성 — 계통 조건과 적용 기준을 함께 적으면 답이 빨라진다.',
};

export default function CommunityAskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
