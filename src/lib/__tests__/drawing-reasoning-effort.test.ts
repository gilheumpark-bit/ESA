import {
  drawingDocumentDeadlineMs,
  drawingEffortProfileKey,
  drawingRoleTimeoutMs,
  isDrawingReasoningEffort,
  parseDrawingEffortProfile,
  resolveRoleEffort,
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

describe('역할별 추론 프로필', () => {
  it('프로필이 없으면 모든 역할이 문서 기본 단계를 쓴다', () => {
    expect(resolveRoleEffort('symbols', 'high', undefined)).toBe('high');
    expect(resolveRoleEffort('coverage-auditor', 'high', undefined)).toBe('high');
  });

  it('지정한 역할만 덮고 나머지는 기본 단계를 유지한다', () => {
    const profile = { symbols: 'low', text: 'low' } as const;
    expect(resolveRoleEffort('symbols', 'high', profile)).toBe('low');
    expect(resolveRoleEffort('text', 'high', profile)).toBe('low');
    expect(resolveRoleEffort('connections', 'high', profile)).toBe('high');
    expect(resolveRoleEffort('logic', 'high', profile)).toBe('high');
  });

  it('알 수 없는 역할 이름은 기본 단계로 떨어진다', () => {
    expect(resolveRoleEffort('unknown-role', 'medium', { symbols: 'low' })).toBe('medium');
  });

  it('지문 키는 역할 순서와 무관하게 같다', () => {
    expect(drawingEffortProfileKey({ text: 'low', symbols: 'low' }))
      .toBe(drawingEffortProfileKey({ symbols: 'low', text: 'low' }));
  });

  it('서로 다른 프로필은 서로 다른 지문 키를 만든다', () => {
    // 지문이 같으면 프로필을 바꿔도 이전 페이지 봉투를 재사용해 A/B 가 무의미해진다.
    expect(drawingEffortProfileKey({ symbols: 'low' }))
      .not.toBe(drawingEffortProfileKey({ symbols: 'medium' }));
  });

  it('빈 프로필은 지문을 바꾸지 않는다', () => {
    expect(drawingEffortProfileKey(undefined)).toBeUndefined();
    expect(drawingEffortProfileKey({})).toBeUndefined();
  });

  it('JSON 문자열과 객체를 모두 읽는다', () => {
    expect(parseDrawingEffortProfile('{"symbols":"low"}')).toEqual({ symbols: 'low' });
    expect(parseDrawingEffortProfile({ logic: 'high' })).toEqual({ logic: 'high' });
    expect(parseDrawingEffortProfile('')).toBeUndefined();
    expect(parseDrawingEffortProfile(undefined)).toBeUndefined();
  });

  it('알 수 없는 역할과 단계는 조용히 버리지 않고 거부한다', () => {
    expect(() => parseDrawingEffortProfile('{"symbol":"low"}'))
      .toThrow('DRAWING_EFFORT_PROFILE_UNKNOWN_ROLE:symbol');
    expect(() => parseDrawingEffortProfile('{"symbols":"ultra"}'))
      .toThrow('DRAWING_EFFORT_PROFILE_UNKNOWN_EFFORT:symbols');
    expect(() => parseDrawingEffortProfile('not json')).toThrow('DRAWING_EFFORT_PROFILE_INVALID_JSON');
    expect(() => parseDrawingEffortProfile('[]')).toThrow('DRAWING_EFFORT_PROFILE_INVALID');
  });
});
