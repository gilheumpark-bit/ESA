import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '로그인 · ESVA',
  description: 'ESVA 계정 로그인.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
