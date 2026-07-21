import { createHash } from 'node:crypto';

import type { DrawingSynthesis } from '@/agent/electrical/synthesis';

import type { CalculationLink } from './types-v3';

const LABELS: Record<string, string> = {
  'voltage-drop': '전압강하',
  'breaker-sizing': '차단기 용량',
  'transformer-capacity': '변압기 용량',
  'ct-sizing': 'CT 정격',
};

function holdNote(receipt: DrawingSynthesis['calculations'][number]): string {
  const missing = receipt.missingInputs.map((item) => item.adapterField);
  const ambiguous = receipt.ambiguousInputs.map((item) => item.adapterField);
  const details = [
    missing.length > 0 ? `누락 입력: ${missing.join(', ')}` : '',
    ambiguous.length > 0 ? `모호 입력: ${ambiguous.join(', ')}` : '',
    receipt.scopeIssues.length > 0 ? `범위 문제: ${receipt.scopeIssues.join(', ')}` : '',
    receipt.error?.message ?? '',
  ].filter(Boolean);
  return details.join(' · ') || '계산은 실행됐지만 설계 적합성은 담당 기술자 확인 전 HOLD입니다.';
}

export function adaptDrawingCalculations(
  synthesis: DrawingSynthesis | undefined,
): CalculationLink[] {
  if (!synthesis) return [];
  return synthesis.calculations.map((receipt) => {
    const result = receipt.calculatorResult;
    const value = typeof result?.value === 'number' && Number.isFinite(result.value)
      ? result.value
      : undefined;
    const evidenceIds = [...new Set(receipt.inputEvidence.flatMap((evidence) => [
      evidence.evidenceId,
      ...evidence.originalEvidenceIds,
    ]).filter(Boolean))];
    return {
      id: receipt.id,
      calculatorId: receipt.calculatorId,
      label: LABELS[receipt.calculatorId] ?? receipt.calculatorId,
      value,
      unit: typeof result?.unit === 'string' ? result.unit : undefined,
      // The production router deliberately emits judgment=HOLD: a numerical
      // result is not, by itself, an engineering compliance approval.
      compliant: null,
      receiptHash: createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),
      evidenceIds,
      note: holdNote(receipt),
    };
  });
}
