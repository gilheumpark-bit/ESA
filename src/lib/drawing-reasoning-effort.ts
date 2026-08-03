export const DRAWING_REASONING_EFFORTS = ['low', 'medium', 'high'] as const;

export type DrawingReasoningEffort = (typeof DRAWING_REASONING_EFFORTS)[number];

const DEFAULT_ROLE_TIMEOUT_MS = 45_000;
const HIGH_LOCAL_ROLE_TIMEOUT_MS = 120_000;

export function drawingRoleTimeoutMs(
  provider: string,
  effort: DrawingReasoningEffort | undefined,
): number {
  return provider === 'chatgpt-local' && effort === 'high'
    ? HIGH_LOCAL_ROLE_TIMEOUT_MS
    : DEFAULT_ROLE_TIMEOUT_MS;
}

export function drawingDocumentDeadlineMs(
  provider: string,
  effort: string,
): number {
  void provider;
  // A high-density 4x4 drawing council plans up to 55 bounded calls. Even at
  // four-way concurrency, the former 270 s document deadline could expire
  // before normal high-effort cloud responses settled. Keep low/medium fast,
  // while giving every explicitly selected high-effort provider 9.5 minutes.
  return effort === 'high' ? 570_000 : 270_000;
}

export function isDrawingReasoningEffort(value: string): value is DrawingReasoningEffort {
  return (DRAWING_REASONING_EFFORTS as readonly string[]).includes(value);
}
