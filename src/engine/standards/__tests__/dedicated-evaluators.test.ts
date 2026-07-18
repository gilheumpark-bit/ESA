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

// ═══════════════════════════════════════════════════════════════════════════════
// 허용전류 조항 — 전용 평가기 (NEC-310.16 / IEC-523.1)
//
// 부하전류 ≤ 전선 허용전류. 임계값(wireAmpacity)은 공인 허용전류표
// (getNecAmpacity/getIecAmpacity, SourceTag 보유)가 산출하는 값이며,
// 평가기는 두 값을 코드 규칙대로 비교만 한다. 허용전류 미입력 시 HOLD.
//
// 수정 전 결함: {loadCurrent:50}만으로 FAIL (50 <= 0 이 거짓 → 정상 반려).
// ═══════════════════════════════════════════════════════════════════════════════

describe('허용전류 전용 평가기 (NEC-310.16 / IEC-523.1)', () => {
  test('부하전류 ≤ 허용전류 → PASS', () => {
    expect(evaluateStandard('US', 'NEC-310.16', {
      loadCurrent: 50, wireAmpacity: 65,
    }).judgment).toBe('PASS');
  });

  test('부하전류 > 허용전류 → FAIL (전선 과부하)', () => {
    expect(evaluateStandard('US', 'NEC-310.16', {
      loadCurrent: 80, wireAmpacity: 65,
    }).judgment).toBe('FAIL');
  });

  test('허용전류 없이는 판정하지 않는다 (HOLD, FAIL 아님)', () => {
    // 수정 전에는 이 입력이 FAIL이었다(정상 부하를 반려).
    expect(evaluateStandard('US', 'NEC-310.16', { loadCurrent: 50 }).judgment).toBe('HOLD');
  });

  test('IEC-523.1도 동일 규칙', () => {
    expect(evaluateStandard('INT', 'IEC-523.1', {
      loadCurrent: 20, wireAmpacity: 24,
    }).judgment).toBe('PASS');
    expect(evaluateStandard('INT', 'IEC-523.1', {
      loadCurrent: 30, wireAmpacity: 24,
    }).judgment).toBe('FAIL');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 분류·적용범위 조항 (2단계) — 애초에 pass/fail 대상이 아님
//
// KEC-111.1 "전압 무관 전체 적용"(적용범위), KEC-250.1·JIS-701.1
// "욕실 Zone 0/1/2/3"(구역 분류)는 임계값 비교 조항이 아니다.
// `bathroomZone >= 0`은 어떤 Zone이든 참이라 pass/fail이 성립하지 않는다.
// 자리표시자 가드가 HOLD시키지만 사유가 "임계값 누락"처럼 보여 부정확하다.
// 이 조항들은 어떤 입력에도 PASS/FAIL을 만들지 않고, 정확한 사유의 HOLD여야 한다.
// ═══════════════════════════════════════════════════════════════════════════════

describe('분류·적용범위 조항 (KEC-111.1 / KEC-250.1 / JIS-701.1)', () => {
  test('KEC-111.1 적용범위는 어떤 입력에도 PASS/FAIL 하지 않는다', () => {
    for (const v of [0, 220, 100000]) {
      const r = evaluateStandard('KR', 'KEC-111.1', { voltageClass: v });
      expect(r.judgment).toBe('HOLD');
    }
  });

  test('KEC-250.1 욕실 Zone은 분류 안내이며 pass/fail 아님', () => {
    for (const z of [0, 1, 2, 3]) {
      expect(evaluateStandard('KR', 'KEC-250.1', { bathroomZone: z }).judgment).toBe('HOLD');
    }
  });

  test('JIS-701.1 욕실 Zone도 동일', () => {
    expect(evaluateStandard('JP', 'JIS-701.1', { bathroomZone: 1 }).judgment).toBe('HOLD');
  });

  test('HOLD 사유가 "판정 대상 아님(분류/적용범위)"임을 명시한다', () => {
    const r = evaluateStandard('KR', 'KEC-111.1', { voltageClass: 220 });
    expect(r.notes.some(n => n.includes('분류') || n.includes('적용범위') || n.includes('안내'))).toBe(true);
  });
});
