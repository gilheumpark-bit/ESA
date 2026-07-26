import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '검토 보고서 · ESVA',
  description: '도면 검토 결과 보고서.',
};

export default function ReportDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
