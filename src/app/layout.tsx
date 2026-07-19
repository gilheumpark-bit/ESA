import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_KR, Noto_Serif_KR, IBM_Plex_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import Providers from './providers';
import SkipLink from '@/components/a11y/SkipLink';
import ThemeInitScript from '@/components/ThemeInitScript';
import './globals.css';

// AX 최종안 타이포 — 본문(Plex Sans KR)·히어로 세리프(Noto Serif KR)·기술/영수증(Plex Mono).
// CSP가 Google Fonts CDN을 차단하므로 next/font로 셀프호스팅. 앱 전역 적용.
const sans = IBM_Plex_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});
const serif = Noto_Serif_KR({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-serif',
  display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
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
    { media: '(prefers-color-scheme: light)', color: '#fbfaf7' },
    { media: '(prefers-color-scheme: dark)', color: '#17150f' },
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
    <html lang={lang} suppressHydrationWarning className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-[var(--bg-primary)] font-[family-name:var(--font-sans)] text-[var(--text-primary)] antialiased">
        <ThemeInitScript />
        <SkipLink />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
