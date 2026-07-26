import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '용어 사전 · ESVA',
  description: 'IEC 60050 기반 전기 용어 — 한국어·영어 대역어와 관련 계산기 연결.',
};

export default function GlossaryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
