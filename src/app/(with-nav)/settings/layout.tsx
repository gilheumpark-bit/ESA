import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '설정 · ESVA',
  description: '적용 국가 기준·언어·표시 단위계 설정.',
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
