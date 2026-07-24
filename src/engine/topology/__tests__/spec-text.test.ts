/**
 * 스펙 텍스트 파싱 — 단위 혼동 회귀 가드
 *
 * 여기서 잘못 읽으면 그 값이 calcChain 입력으로 그대로 흘러간다. 실측에서
 * 500kVA 변압기가 primaryVoltage 500,000V로 계산 체인에 들어가고 있었다.
 */

import { parseSpecText } from '../spec-text';

describe('전력 표기가 전압으로 오독되지 않는다', () => {
  it('500kVA는 용량이지 500kV가 아니다', () => {
    const s = parseSpecText('500kVA');
    expect(s.power).toBe(500);
    expect(s.powerUnit).toBe('kVA');
    expect(s.voltage).toBeUndefined();
  });

  it('MVA·kVAR도 전압으로 새지 않는다', () => {
    expect(parseSpecText('2.5MVA').voltage).toBeUndefined();
    expect(parseSpecText('200kVAR').voltage).toBeUndefined();
    expect(parseSpecText('2.5MVA').power).toBe(2.5);
    expect(parseSpecText('200kVAR').power).toBe(200);
  });

  it('용량과 전압이 함께 적힌 표기는 둘 다 읽는다', () => {
    const s = parseSpecText('TR-1 22.9kV / 1000kVA');
    expect(s.power).toBe(1000);
    expect(s.powerUnit).toBe('kVA');
    expect(s.voltage).toBe(22900);
  });
});

describe('정상 전압 표기는 계속 읽힌다', () => {
  it.each([
    ['380V', 380],
    ['220V', 220],
    ['22.9kV', 22900],
    ['400VAC', 400],
    ['6.6kV 3상', 6600],
  ])('%s → %i V', (text, expected) => {
    expect(parseSpecText(text).voltage).toBe(expected);
  });
});

describe('전류·케이블·단면적', () => {
  it('800A는 전류로 읽고 전압으로 새지 않는다', () => {
    const s = parseSpecText('800A');
    expect(s.current).toBe(800);
    expect(s.voltage).toBeUndefined();
  });

  it('케이블 규격 문자열에서 종류와 단면적을 분리한다', () => {
    const s = parseSpecText('CV 4C 150sq');
    expect(s.cableType).toBe('CV');
    expect(s.conductorSize).toBe(150);
  });

  it('스펙이 없는 텍스트는 빈 결과를 낸다', () => {
    expect(parseSpecText('배전반 상세도')).toEqual({});
    expect(parseSpecText('')).toEqual({});
  });
});

describe('차단기 극수·AF/AT 정격 — 실도면 분전반 일람 표기 (KIMM EE-039 골든 실측)', () => {
  // 실발주 도면의 차단기 표기는 "MCCB 3P-50/20"(bare)·"4P-400AF/400AT"(접미) 두 형태.
  // 구현 전 상태: 두 형태 모두 구조화 실패 → 정격 결속 0% (골든 파일럿 실측) → 계산 체인 기아.
  it('bare 표기 MCCB 3P-50/20 → 3P·50AF·20AT·정격전류 20A', () => {
    const s = parseSpecText('MCCB 3P-50/20');
    expect(s.poles).toBe('3P');
    expect(s.frameA).toBe(50);
    expect(s.tripA).toBe(20);
    expect(s.current).toBe(20);
  });

  it('AF/AT 접미 표기 MCCB 4P-400AF/400AT', () => {
    const s = parseSpecText('MCCB 4P-400AF/400AT');
    expect(s.poles).toBe('4P');
    expect(s.frameA).toBe(400);
    expect(s.tripA).toBe(400);
    expect(s.current).toBe(400);
  });

  it('누전차단기 ELB 2P-30/20도 동일 규칙', () => {
    const s = parseSpecText('ELB 2P-30/20');
    expect(s.poles).toBe('2P');
    expect(s.frameA).toBe(30);
    expect(s.tripA).toBe(20);
  });

  it('날짜·분수형 슬래시는 프레임/트립으로 오독하지 않는다', () => {
    expect(parseSpecText('2021/04').frameA).toBeUndefined();
    expect(parseSpecText('1/2').frameA).toBeUndefined();
    expect(parseSpecText('축척 A1/A3').frameA).toBeUndefined();
  });

  it('P 토큰 없는 100/75는 차단기 키워드 문맥에서만 읽는다', () => {
    expect(parseSpecText('MCCB 100/75').frameA).toBe(100);
    expect(parseSpecText('비고 100/75').frameA).toBeUndefined();
  });

  // 버그 사냥 F1: bare 슬래시가 전압쌍·감도전류·날짜를 AF/AT로 오독 → review
  // 규칙에 false-PASS/false-FAIL 주입. 2번째 수가 V/mA·앞자리 0이면 정격 아님.
  it('전압쌍(380/220V)을 AF/AT로 오독하지 않고 실정격 400A를 보존한다', () => {
    const s = parseSpecText('MCCB 4P 400A 3φ4W 380/220V');
    expect(s.frameA).toBeUndefined();
    expect(s.tripA).toBeUndefined();
    expect(s.current).toBe(400);
  });

  it('명시 30AT + 전압쌍 표기에서 전압쌍을 트립으로 덮어쓰지 않는다', () => {
    expect(parseSpecText('MCCB 3P 30AT 380/220V').current).toBe(30);
    // 역순 전압쌍도 AT>AF 허위 FAIL을 만들지 않는다
    expect(parseSpecText('MCCB 3P 30AT 220/380V').frameA).toBeUndefined();
  });

  it('감도전류(50/30mA)·날짜(2021/04)·키워드 없는 전압쌍은 정격이 아니다', () => {
    expect(parseSpecText('ELCB 2P 50/30mA').tripA).toBeUndefined();
    expect(parseSpecText('MCCB 교체 2021/04').frameA).toBeUndefined();
    expect(parseSpecText('PANEL LP-1 3P 380/220V').frameA).toBeUndefined();
  });

  it('트립(AT)이 있으면 정격전류는 트립이 정본 — 기존 A 단독 매칭과 충돌 없음', () => {
    const s = parseSpecText('MCCB 3P 225AF/150AT 380V');
    expect(s.voltage).toBe(380);
    expect(s.frameA).toBe(225);
    expect(s.tripA).toBe(150);
    expect(s.current).toBe(150);
  });
});

describe('H7 도메인 심사 반증 회귀 (2026-07-23 fresh-context 2석)', () => {
  it('다심 "16sq×4C"의 4C는 코어수 — 병렬 4조로 오독하지 않는다(false-PASS 차단)', () => {
    const s = parseSpecText('CV 16sq×4C');
    expect(s.conductorSize).toBe(16);
    expect(s.parallelCount).toBeUndefined();
  });

  it('진짜 병렬 "16sq×2"·"150sq x 3"은 여전히 조수로 읽는다(회귀 방지)', () => {
    expect(parseSpecText('CV 16sq×2').parallelCount).toBe(2);
    expect(parseSpecText('150sq x 3').parallelCount).toBe(3);
  });

  it('타입 후행 병렬 "16SQ×2 CV"도 2조로 읽는다 — C 배제가 케이블타입 CV를 삼키지 않음 (재심사 회귀 b)', () => {
    expect(parseSpecText('16SQ×2 CV').parallelCount).toBe(2);
    expect(parseSpecText('16sq×2CV').parallelCount).toBe(2);
    expect(parseSpecText('CV 16sq×4C').parallelCount).toBeUndefined(); // 코어 4C는 여전히 배제
  });

  it('공백 구분 "200AF 225AT"도 프레임·트립을 뽑는다(AT>AF 검출 가능)', () => {
    const s = parseSpecText('MCCB 3P 200AF 225AT');
    expect(s.frameA).toBe(200);
    expect(s.tripA).toBe(225);
  });

  it('날짜 "12/2021"·"2021/12"를 정격으로 발명하지 않는다(무발명)', () => {
    expect(parseSpecText('MCCB 3P 12/2021').tripA).toBeUndefined();
    expect(parseSpecText('MCCB 3P 2021/12').tripA).toBeUndefined();
  });

  it('4자리 정격(2000AF/1600AT)은 날짜로 오배제하지 않는다', () => {
    const s = parseSpecText('ACB 2000/1600');
    expect(s.frameA).toBe(2000);
    expect(s.tripA).toBe(1600);
  });

  it('알루미늄 도체를 인식하고 구리와 구분한다(미상은 미상)', () => {
    expect(parseSpecText('AL-CV 240sq').conductor).toBe('Al');
    expect(parseSpecText('알루미늄 240sq').conductor).toBe('Al');
    expect(parseSpecText('CV 240sq').conductor).toBeUndefined();
  });

  it('NFB·한글 차단기 라벨(극표기 없음)에서도 정격을 뽑는다', () => {
    expect(parseSpecText('NFB 100/50').tripA).toBe(50);
    expect(parseSpecText('차단기 100/50').tripA).toBe(50);
    expect(parseSpecText('배선용차단기 100/50').tripA).toBe(50);
  });
});
