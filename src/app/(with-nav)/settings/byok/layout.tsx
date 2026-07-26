import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API 키 설정 · ESVA',
  description: '내 API 키로 AI를 쓰는 BYOK 설정 — 키는 브라우저에만 저장된다.',
};

export default function SettingsByokLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
