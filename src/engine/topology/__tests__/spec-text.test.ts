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
