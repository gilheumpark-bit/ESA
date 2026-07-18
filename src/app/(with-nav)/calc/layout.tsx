import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '계산기 · ESVA',
  description: 'KEC/NEC/IEC 기준의 검증된 전기공학 계산기 57개 (전압강하 · 케이블 선정 · 차단기 · 단락전류 · 변압기 · 접지 · 아크 플래시 등).',
};

export default function CalcLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
