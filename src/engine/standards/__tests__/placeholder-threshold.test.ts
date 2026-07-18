import { isPlaceholderThreshold } from '@engine/standards/evaluator-guard';
import { evaluateStandard } from '@engine/standards/registry';

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

describe('evaluateStandard — 자리표시자 조항은 자동 판정하지 않는다', () => {
  test('IEC-434.1 차단용량은 자동 PASS 하지 않는다', () => {
    // 차단용량 1kA — 실무상 대부분의 배전반에서 부족한 값.
    // value:0 비교로는 1 >= 0 이라 PASS가 나왔다.
    const result = evaluateStandard('INT', 'IEC-434.1', { breakingCapacity_kA: 1 });
    expect(result.judgment).not.toBe('PASS');
  });

  test('IEC-434.1 은 차단용량이 커도 자동 PASS 하지 않는다', () => {
    const result = evaluateStandard('INT', 'IEC-434.1', { breakingCapacity_kA: 50 });
    expect(result.judgment).toBe('HOLD');
  });

  test('NEC-310.16 부하전류는 자동 FAIL 하지 않는다', () => {
    // 부하전류 50A — 정상 범위. value:0 비교로는 50 <= 0 이 거짓이라
    // FAIL이 나왔다(정상을 반려).
    const result = evaluateStandard('US', 'NEC-310.16', { loadCurrent: 50 });
    expect(result.judgment).not.toBe('FAIL');
  });

  test('자리표시자가 아닌 조항은 정상 판정을 유지한다 (회귀 방지)', () => {
    // IEC-431.1 은 `== 1` bool 조항 — 가드에 걸리지 않아야 한다.
    const pass = evaluateStandard('INT', 'IEC-431.1', { overloadProtection: 1 });
    expect(pass.judgment).toBe('PASS');
    const fail = evaluateStandard('INT', 'IEC-431.1', { overloadProtection: 0 });
    expect(fail.judgment).toBe('FAIL');
  });
});
