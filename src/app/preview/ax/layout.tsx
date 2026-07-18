import type { Metadata } from 'next';
import { axSerif, axSans, axMono } from './fonts';
import './ax.css';

export const metadata: Metadata = {
  title: 'ESVA AX 최종안 — 프리뷰',
  description: '스레드 + 영수증 1급 + 거버넌스 상태바 통합 시안. 프리뷰 라우트 (라이브 미배선).',
  robots: { index: false, follow: false },
};

export default function AXLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`ax ${axSerif.variable} ${axSans.variable} ${axMono.variable}`}
      style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}
    >
      {children}
    </div>
  );
}
