import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '검색 · ESVA',
  description: 'AI 기반 전기공학 검색 — KEC/NEC/IEC 조항 정밀 추적 + 결정론 계산기 자동 연결 + 검증 가능한 영수증.',
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
