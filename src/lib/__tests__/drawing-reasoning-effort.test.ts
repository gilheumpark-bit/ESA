import {
  drawingDocumentDeadlineMs,
  drawingRoleTimeoutMs,
  isDrawingReasoningEffort,
} from '../drawing-reasoning-effort';

describe('drawing reasoning calibration efforts', () => {
  it.each(['low', 'medium', 'high', 'xhigh', 'max'])('accepts the advertised product effort %s', (effort) => {
    expect(isDrawingReasoningEffort(effort)).toBe(true);
  });

  it('keeps ultra outside the single-model drawing calibration contract', () => {
    expect(isDrawingReasoningEffort('ultra')).toBe(false);
  });

  it.each(['low', 'medium', 'high', 'xhigh', 'max'])('allows explicit %s runs up to the 570 second boundary', (effort) => {
    expect(drawingDocumentDeadlineMs('chatgpt-local', effort)).toBe(570_000);
  });

  it('keeps an unspecified effort on the shorter interactive boundary', () => {
    expect(drawingDocumentDeadlineMs('chatgpt-local', '')).toBe(270_000);
  });

  it.each(['high', 'xhigh', 'max'] as const)('allows deep local role calls at %s to settle', (effort) => {
    expect(drawingRoleTimeoutMs('chatgpt-local', effort)).toBe(120_000);
  });

  it.each(['low', 'medium'] as const)('allows local %s image roles 75 seconds inside the ten-minute document boundary', (effort) => {
    expect(drawingRoleTimeoutMs('chatgpt-local', effort)).toBe(75_000);
  });
});
