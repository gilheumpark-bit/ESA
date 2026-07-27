import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '기준/규격 · ESVA',
  // KEC 는 2026-07-27 에 조항 번호·표제를 현행 전문(시행 2026.1.5)에 전수
  // 대조했다. `<meta name="description">` 로 나가 검색 결과·공유 카드에 뜬다.
  description: 'KEC(조항 2026.1.5 대조) · NEC 2023 · IEC 60364 · JIS C 0364 등 다국가 전기 기준서 브라우저 + 조항 교차참조.',
};

export default function StandardsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
