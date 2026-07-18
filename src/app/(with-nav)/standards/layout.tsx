import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '기준/규격 · ESVA',
  description: 'KEC 2021 · NEC 2023 · IEC 60364 · JIS C 0364 등 다국가 전기 기준서 브라우저 + 조항 교차참조.',
};

export default function StandardsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
