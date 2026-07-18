// AX 최종안 전용 폰트 — next/font/google로 셀프호스팅 (CSP가 Google Fonts CDN 차단하므로
// 링크 대신 self-host). 프리뷰 라우트에만 스코프되어 라이브 앱 번들에 영향 없음.
import { Noto_Serif_KR, IBM_Plex_Sans_KR, IBM_Plex_Mono } from 'next/font/google';

/** 히어로 전용 세리프 (Noto Serif KR) */
export const axSerif = Noto_Serif_KR({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--ax-font-serif',
  display: 'swap',
});

/** 본문 (IBM Plex Sans KR) */
export const axSans = IBM_Plex_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--ax-font-sans',
  display: 'swap',
});

/** 기술·영수증 (IBM Plex Mono) */
export const axMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--ax-font-mono',
  display: 'swap',
});
