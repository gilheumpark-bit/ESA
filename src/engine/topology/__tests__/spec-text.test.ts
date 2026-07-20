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

  it('트립(AT)이 있으면 정격전류는 트립이 정본 — 기존 A 단독 매칭과 충돌 없음', () => {
    const s = parseSpecText('MCCB 3P 225AF/150AT 380V');
    expect(s.voltage).toBe(380);
    expect(s.frameA).toBe(225);
    expect(s.tripA).toBe(150);
    expect(s.current).toBe(150);
  });
});
