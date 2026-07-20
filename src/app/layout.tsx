import type { Metadata, Viewport } from 'next';
import type { CSSProperties } from 'react';
import '@fontsource/ibm-plex-sans-kr/300.css';
import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/600.css';
import '@fontsource/ibm-plex-sans-kr/700.css';
import '@fontsource/noto-serif-kr/600.css';
import '@fontsource/noto-serif-kr/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import { headers } from 'next/headers';
import Providers from './providers';
import SkipLink from '@/components/a11y/SkipLink';
import ThemeInitScript from '@/components/ThemeInitScript';
import './globals.css';

// AX 최종안 타이포 — 번들된 로컬 폰트를 사용해 빌드 시 외부 Google Fonts 요청을 만들지 않는다.
const fontVariables: CSSProperties & Record<`--${string}`, string> = {
  '--font-sans': '"IBM Plex Sans KR", sans-serif',
  '--font-serif': '"Noto Serif KR", serif',
  '--font-mono': '"IBM Plex Mono", monospace',
};

export const metadata: Metadata = {
  title: 'ESVA - The Engineer\'s Search Engine',
  description: '전기 엔지니어링 특화 AI 플랫폼. 출처와 검증 상태를 표시하는 검색 + 영수증 계산기 + BYOK.',
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
    <html lang={lang} suppressHydrationWarning style={fontVariables}>
      <head>
        <ThemeInitScript />
      </head>
      <body className="min-h-screen bg-[var(--bg-primary)] font-[family-name:var(--font-sans)] text-[var(--text-primary)] antialiased">
        <SkipLink />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
