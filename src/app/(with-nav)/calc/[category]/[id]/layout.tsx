import type { Metadata } from 'next';
import { CALCULATOR_NAMES } from '@/lib/calculator-params';
import { CALC_CATEGORY_LABELS, CALCULATOR_CATALOG } from '@/lib/calculator-catalog';

/**
 * 계산기 57쪽이 전부 사이트 기본 제목("ESVA - The Engineer's Search Engine")을
 * 달고 있었다 — 탭을 여러 개 열면 어느 것이 전압강하고 어느 것이 조도인지
 * 구분되지 않고, 즐겨찾기·방문 기록·검색 결과도 전부 같은 줄로 남는다.
 *
 * 이름은 CALCULATOR_NAMES 가 정본이다. 여기서 표를 새로 만들지 않는다.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ category: string; id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const names = CALCULATOR_NAMES[id];
  if (!names) return {};

  const category = CALCULATOR_CATALOG[id]?.category;
  const categoryLabel = category ? CALC_CATEGORY_LABELS[category] : undefined;

  return {
    title: `${names.name} · ESVA`,
    description: categoryLabel
      ? `${names.name} (${names.nameEn}) — ${categoryLabel} 계산기. 입력·공식·계산 단계·한계를 함께 표시한다.`
      : `${names.name} (${names.nameEn}) — 입력·공식·계산 단계·한계를 함께 표시하는 계산기.`,
  };
}

export default function CalculatorDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
