export interface CalculatorGaugeData {
  value: number;
  unit: string;
  limit: number;
  label: string;
  standardRef: string;
  direction: 'below' | 'above';
}

const VOLTAGE_DROP_CALCULATORS = new Set([
  'voltage-drop',
  'complex-voltage-drop',
]);

/**
 * Build a gauge only for calculators whose result has the matching engineering
 * meaning. Similar words in an ID are not sufficient: impedance voltage (%Z)
 * is not voltage drop and has a different acceptance criterion.
 */
export function buildCalculatorGauge(
  calcId: string,
  value: unknown,
  unit: string | undefined,
): CalculatorGaugeData | null {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || unit !== '%'
    || !VOLTAGE_DROP_CALCULATORS.has(calcId)
  ) {
    return null;
  }

  return {
    value,
    unit: '%',
    limit: 3,
    label: '전압강하',
    standardRef: 'KEC 232.52',
    direction: 'below',
  };
}
