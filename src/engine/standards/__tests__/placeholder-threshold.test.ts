import { isPlaceholderThreshold } from '@engine/standards/evaluator-guard';

// ═══════════════════════════════════════════════════════════════════════════════
// 회귀 방지 — value:0 자리표시자가 실제 임계값으로 비교되던 결함
//
// IEC-434.1 (차단용량 >= 0) 은 어떤 입력에도 PASS를 반환했고,
// NEC-310.16 (부하전류 <= 0) 은 정상 입력을 항상 FAIL 처리했다.
// 저장소 전체에 동일 패턴 25건 (NEC 12 · IEC 5 · JIS 3 · KEC-ext 3 · KEC-212 2).
// ═══════════════════════════════════════════════════════════════════════════════

describe('isPlaceholderThreshold', () => {
  test('>= 0 은 자리표시자다 (어떤 입력도 실패하지 않음)', () => {
    expect(isPlaceholderThreshold({ operator: '>=', value: 0 })).toBe(true);
  });

  test('<= 0 은 자리표시자다 (실입력에 항상 실패)', () => {
    expect(isPlaceholderThreshold({ operator: '<=', value: 0 })).toBe(true);
  });

  test('> 0 / < 0 도 자리표시자다', () => {
    expect(isPlaceholderThreshold({ operator: '>', value: 0 })).toBe(true);
    expect(isPlaceholderThreshold({ operator: '<', value: 0 })).toBe(true);
  });

  test('== 0 은 자리표시자가 아니다 (bool 조항의 정상 표현)', () => {
    expect(isPlaceholderThreshold({ operator: '==', value: 0 })).toBe(false);
  });

  test('== 1 은 자리표시자가 아니다', () => {
    expect(isPlaceholderThreshold({ operator: '==', value: 1 })).toBe(false);
  });

  test('실제 임계값은 자리표시자가 아니다', () => {
    expect(isPlaceholderThreshold({ operator: '<=', value: 3 })).toBe(false);
    expect(isPlaceholderThreshold({ operator: '>=', value: 2.5 })).toBe(false);
    expect(isPlaceholderThreshold({ operator: '<=', value: -1 })).toBe(false);
  });
});
