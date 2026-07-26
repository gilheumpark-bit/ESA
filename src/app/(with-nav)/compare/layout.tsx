import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '비교 계산 · ESVA',
  description: 'A/B/C/D 시나리오를 같은 계산기로 나란히 돌려 설계안을 비교한다.',
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
