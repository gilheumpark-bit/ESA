import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '계산 영수증 · ESVA',
  description: '입력·공식·단계·한계가 모두 적힌 계산 영수증.',
};

export default function ReceiptDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
