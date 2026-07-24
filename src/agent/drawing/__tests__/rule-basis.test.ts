import { describeStandardRef, describeStandardRefs, INTERNAL_RULE_PREFIX } from '../rule-basis';

// ============================================================
// 거절은 근거를 인용해야 사용자가 수긍한다
// ============================================================
// 이전 화면은 "보류 · 원본 근거 1건 · 계산 영수증 0건 · 규칙 1건"만 보여줬다.
// 개수는 근거가 아니다. 실무자 입장에서는 그냥 못 하겠다는 말로 읽힌다.
// ============================================================

describe('rule-basis — 보류 근거를 사람이 읽는 문장으로', () => {
  it('ESA 자체 규칙은 이름·근거와 함께 내부 규칙임을 밝힌다', () => {
    const basis = describeStandardRef(`${INTERNAL_RULE_PREFIX}PROTECTION-ON-PATH`);
    expect(basis).toBeDefined();
    expect(basis!.internal).toBe(true);
    expect(basis!.label).toBe('경로 보호기 확인 규칙');
    // 왜 확정하지 못하는지가 문장에 있어야 한다.
    expect(basis!.basis).toContain('종류가 확정');
    expect(basis!.originUrl).toBeUndefined();
  });

  it('제안 계층이 실제로 쓰는 규칙 3종이 모두 해석된다', () => {
    for (const id of ['ORPHAN-CONNECTION', 'PROTECTION-ON-PATH', 'GROUND-PATH']) {
      const basis = describeStandardRef(`${INTERNAL_RULE_PREFIX}${id}`);
      expect(basis).toBeDefined();
      expect(basis!.basis.length).toBeGreaterThan(20);
    }
  });

  it('기준서 조항은 발행기관과 원문 확인 경로를 함께 준다', () => {
    const basis = describeStandardRef('KEC 232.52');
    expect(basis).toBeDefined();
    expect(basis!.internal).toBe(false);
    expect(basis!.originUrl).toMatch(/^https:\/\//);
    // 원문을 담지 않는다는 사실을 사용자에게 숨기지 않는다.
    expect(basis!.basis).toContain('원문');
  });

  it('해석되지 않는 문자열은 그럴듯한 근거로 포장하지 않는다', () => {
    expect(describeStandardRef('KEC 접지')).toBeUndefined();
    expect(describeStandardRef('KEC 보호 일반')).toBeUndefined();
    expect(describeStandardRef(`${INTERNAL_RULE_PREFIX}UNKNOWN-RULE`)).toBeUndefined();
    expect(describeStandardRef('아무 문자열')).toBeUndefined();
  });

  it('해석 가능한 것만 남기고 나머지는 버린다', () => {
    const list = describeStandardRefs([
      `${INTERNAL_RULE_PREFIX}GROUND-PATH`,
      'KEC 접지',
      'KEC 232.52',
    ]);
    expect(list.map((b) => b.label)).toEqual(['접지 경로 확인 규칙', 'KEC 232.52']);
  });
});
