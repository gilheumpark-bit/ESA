import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '사내 서버 연결 · ESVA',
  description: '사내에 띄운 LLM 서버를 ESVA에 연결한다.',
};

export default function SettingsOnpremiseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
