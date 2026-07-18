import type { Metadata } from 'next';
import './ax.css';

// 폰트(--font-sans/serif/mono)는 루트 layout에서 앱 전역으로 로드됨 (AX 최종안 = 앱 전체 적용).
// 이 라우트는 .ax 스코프 팔레트(ax.css)만 추가로 얹는다.
export const metadata: Metadata = {
  title: 'ESVA AX 최종안 — 프리뷰',
  description: '스레드 + 영수증 1급 + 거버넌스 상태바 통합 시안 (레퍼런스 라우트).',
  robots: { index: false, follow: false },
};

export default function AXLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ax" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  );
}
