import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '계산 이력 · ESVA',
  description: '지금까지 돌린 계산과 그 입력·결과 — 영수증으로 다시 열고 내보낼 수 있다.',
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
