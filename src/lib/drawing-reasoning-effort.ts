export const DRAWING_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type DrawingReasoningEffort = (typeof DRAWING_REASONING_EFFORTS)[number];

const DEFAULT_ROLE_TIMEOUT_MS = 45_000;
const CALIBRATION_LOCAL_ROLE_TIMEOUT_MS = 75_000;
const HIGH_LOCAL_ROLE_TIMEOUT_MS = 120_000;

export function drawingRoleTimeoutMs(
  provider: string,
  effort: DrawingReasoningEffort | undefined,
): number {
  if (provider !== 'chatgpt-local') return DEFAULT_ROLE_TIMEOUT_MS;
  return effort === 'high' || effort === 'xhigh' || effort === 'max'
    ? HIGH_LOCAL_ROLE_TIMEOUT_MS
    : effort === 'low' || effort === 'medium'
      ? CALIBRATION_LOCAL_ROLE_TIMEOUT_MS
      : DEFAULT_ROLE_TIMEOUT_MS;
}

export function drawingDocumentDeadlineMs(
  provider: string,
  effort: string,
): number {
  void provider;
  // Calibration treats every explicit effort as quality-first: duration is a
  // pass/fail boundary at 9.5 minutes, not a score inside that boundary.
  return isDrawingReasoningEffort(effort) ? 570_000 : 270_000;
}

export function isDrawingReasoningEffort(value: string): value is DrawingReasoningEffort {
  return (DRAWING_REASONING_EFFORTS as readonly string[]).includes(value);
}
