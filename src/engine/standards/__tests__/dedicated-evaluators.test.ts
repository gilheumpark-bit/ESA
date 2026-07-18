import { evaluateStandard } from '@engine/standards/registry';

// ═══════════════════════════════════════════════════════════════════════════════
// 차단용량 조항 — 전용 평가기
//
// value:0 자리표시자였던 breakingCapacity 조항을 실판정으로 승격한다.
// 임계값은 "설치점 예상 단락전류(prospectiveShortCircuit_kA)" — 사람이 추정해
// 채우는 값이 아니라 단락전류 계산기가 산출하는 측정/계산 입력이다.
// 두 측정값을 코드 규칙(차단용량 ≥ 예상 단락전류)대로 비교할 뿐, 여기에
// 발명된 숫자는 없다.
//
// 수정 전 결함: {breakingCapacity_kA:1} 하나만으로 PASS (단락전류 없이 '적합').
// ═══════════════════════════════════════════════════════════════════════════════

describe('차단용량 전용 평가기 (IEC-434.1 / IEC-533.1 / JIS-434.1)', () => {
  test('차단용량 ≥ 예상 단락전류 → PASS', () => {
    const r = evaluateStandard('INT', 'IEC-434.1', {
      breakingCapacity_kA: 50,
      prospectiveShortCircuit_kA: 10,
    });
    expect(r.judgment).toBe('PASS');
  });

  test('차단용량 < 예상 단락전류 → FAIL (사고 시 차단 실패)', () => {
    const r = evaluateStandard('INT', 'IEC-434.1', {
      breakingCapacity_kA: 5,
      prospectiveShortCircuit_kA: 10,
    });
    expect(r.judgment).toBe('FAIL');
  });

  test('예상 단락전류 없이는 절대 PASS 하지 않는다 (HOLD)', () => {
    // 수정 전에는 이 입력이 PASS였다. 비교할 대상이 없으면 판정 불가.
    const r = evaluateStandard('INT', 'IEC-434.1', { breakingCapacity_kA: 50 });
    expect(r.judgment).toBe('HOLD');
  });

  test('차단용량 없이는 판정하지 않는다 (HOLD)', () => {
    const r = evaluateStandard('INT', 'IEC-434.1', { prospectiveShortCircuit_kA: 10 });
    expect(r.judgment).toBe('HOLD');
  });

  test('IEC-533.1 개폐기 차단용량도 동일 규칙', () => {
    expect(evaluateStandard('INT', 'IEC-533.1', {
      breakingCapacity_kA: 25, prospectiveShortCircuit_kA: 6,
    }).judgment).toBe('PASS');
    expect(evaluateStandard('INT', 'IEC-533.1', {
      breakingCapacity_kA: 3, prospectiveShortCircuit_kA: 6,
    }).judgment).toBe('FAIL');
  });

  test('JIS-434.1 차단용량도 동일 규칙', () => {
    expect(evaluateStandard('JP', 'JIS-434.1', {
      breakingCapacity_kA: 30, prospectiveShortCircuit_kA: 10,
    }).judgment).toBe('PASS');
    expect(evaluateStandard('JP', 'JIS-434.1', {
      breakingCapacity_kA: 2, prospectiveShortCircuit_kA: 10,
    }).judgment).toBe('FAIL');
  });

  test('PASS 판정에 근거(출처·비교식)가 notes에 담긴다', () => {
    const r = evaluateStandard('INT', 'IEC-434.1', {
      breakingCapacity_kA: 50, prospectiveShortCircuit_kA: 10,
    });
    expect(r.notes.some(n => n.includes('434.1'))).toBe(true);
    expect(r.notes.some(n => n.includes('50') && n.includes('10'))).toBe(true);
  });
});
