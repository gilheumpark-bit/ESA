/** Shared reading states. Model confidence is deliberately not an input. */
export type DrawingCertainty = 'confirmed' | 'ambiguous' | 'unread';
export const DRAWING_CERTAINTY_LABELS: Record<DrawingCertainty, string> = {
  confirmed: '확정', ambiguous: '검토 필요', unread: '미판독',
};
export interface ReadingTally {
  confirmed: number;
  ambiguous: number;
  unread: number;
  total: number;
}
/** Counts observed records only. Zero records never mean 100% coverage. */
export function tallyReadings(states: readonly DrawingCertainty[]): ReadingTally {
  const result: ReadingTally = { confirmed: 0, ambiguous: 0, unread: 0, total: states.length };
  for (const state of states) result[state] += 1;
  return result;
}
export function hasReadValue(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0
    : typeof value === 'number' ? Number.isFinite(value) : false;
}
