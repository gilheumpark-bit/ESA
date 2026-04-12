import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import Providers from './providers';
import SkipLink from '@/components/a11y/SkipLink';
import ThemeInitScript from '@/components/ThemeInitScript';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ESVA - The Engineer\'s Search Engine',
  description: '전기 엔지니어링 특화 글로벌 AI 플랫폼. 할루시네이션 없는 출처 기반 답변 + 영수증 계산기 + BYOK.',
  keywords: ['전기', 'electrical', 'KEC', 'NEC', 'IEC', '계산기', 'calculator', 'AI', 'search'],
  openGraph: {
    title: 'ESVA - The Engineer\'s Search Engine',
    description: '전기 엔지니어링 특화 글로벌 AI 검색엔진',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

function detectLang(acceptLanguage: string | null): string {
  if (!acceptLanguage) return 'ko';
  const primary = acceptLanguage.split(',')[0]?.trim().split('-')[0]?.toLowerCase();
  if (primary === 'en') return 'en';
  if (primary === 'ja') return 'ja';
  if (primary === 'zh') return 'zh';
  return 'ko';
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const lang = detectLang(headerList.get('accept-language'));

  return (
    <html lang={lang} suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-[var(--bg-primary)] font-[family-name:var(--font-inter)] text-[var(--text-primary)] antialiased">
        <ThemeInitScript />
        <SkipLink />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
