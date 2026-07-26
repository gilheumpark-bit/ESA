import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '현장 모드 · ESVA',
  description: '현장에서 쓰는 점검 체크리스트와 긴급 연락 — 좁은 화면·장갑 낀 손 기준.',
};

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
