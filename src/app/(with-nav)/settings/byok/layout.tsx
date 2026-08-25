import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI 연결 관리 · ESVA',
  description: '로컬 ChatGPT 계정, 공급자 API 키, 로컬 AI 서버를 구분해 연결합니다.',
};

export default function SettingsByokLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
