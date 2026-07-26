/**
 * mm² → AWG 변환의 값 단위.
 *
 * 다른 분기는 전부 목표 단위의 값을 돌려주는데 이 분기만 AWG_TABLE 로 되돌아가
 * **원 단위(mm²) 값**을 돌려주고 있었다. 그 값이 to.unit='AWG' 와 함께 화면에
 * 찍혀 "53.49 AWG" 라는 없는 규격이 표시됐다(실측 2026-07-26). AWG 번수는
 * 4/0~40 이고 53.49 는 AWG 1/0 의 단면적이다.
 */
import { convert, mm2ToAwg, awgToMm2, isAwgSize, formatConverted } from '../unit-conversion';

describe('mm² → AWG', () => {
  it('mm² 값이 아니라 번수를 돌려준다', () => {
    const r = convert(50, 'mm2', 'AWG');
    // 50mm² 는 AWG 0(=1/0, 53.49mm²) 에 가장 가깝다. 53.49 를 AWG 라고 부르면 안 된다.
    expect(r.result).not.toBeCloseTo(53.49, 1);
    // 표는 굵은 규격을 0·00·000·0000 표기로 든다(1/0·2/0…는 별칭).
    // 단위 문자열은 표시하는 쪽이 붙이므로 라벨은 번수만 담는다.
    expect(r.label).toBe('0');
  });

  it('굵은 규격은 수식상 번수로 준다 — 1/0=0, 2/0=-1, 3/0=-2, 4/0=-3', () => {
    expect(convert(53.49, 'mm2', 'AWG').result).toBe(0);
    expect(convert(67.43, 'mm2', 'AWG').result).toBe(-1);
    expect(convert(85.01, 'mm2', 'AWG').result).toBe(-2);
    expect(convert(107.2, 'mm2', 'AWG').result).toBe(-3);
  });

  it('가는 규격은 번수가 그대로 숫자다', () => {
    const r = convert(8.37, 'mm2', 'AWG');
    expect(r.result).toBe(8);
    expect(r.label).toBe('8');
  });

  it('공식 문자열에 대응 단면적을 함께 적는다', () => {
    expect(convert(50, 'mm2', 'AWG').formula).toMatch(/AWG 0 \(53\.49 mm²\)/);
  });

  it('왕복이 표준 규격으로 되돌아온다', () => {
    for (const awg of ['8', '4', '0', '0000']) {
      const mm2 = awgToMm2(awg);
      expect(mm2ToAwg(mm2)).toBe(awg);
    }
  });
});

/**
 * 굵은 도체는 4/0·000 처럼 숫자가 아닌 규격명으로 쓴다. 숫자로 받으면
 * Number('0000') = 0 이 되어 107.2mm²(4/0) 가 53.49mm²(1/0) 로 바뀐다 —
 * 도체 단면적 2배 차이는 그대로 오설계다.
 */
describe('AWG → mm² 굵은 규격 표기', () => {
  it('0000 과 4/0 은 같은 굵기이고 0 과 다르다', () => {
    expect(convert('0000', 'AWG', 'mm2').result).toBe(107.2);
    expect(convert('4/0', 'AWG', 'mm2').result).toBe(107.2);
    expect(convert(0, 'AWG', 'mm2').result).toBe(53.49);
  });

  it('숫자로 뭉개지지 않는다', () => {
    // 이 두 줄이 같은 값이면 표기가 숫자로 붕괴한 것이다.
    expect(convert('0000', 'AWG', 'mm2').result)
      .not.toBe(convert(Number('0000'), 'AWG', 'mm2').result);
  });

  it('4단계 굵은 규격이 별칭과 표 표기 양쪽으로 통한다', () => {
    const pairs: Array<[string, string, number]> = [
      ['1/0', '0', 53.49],
      ['2/0', '00', 67.43],
      ['3/0', '000', 85.01],
      ['4/0', '0000', 107.2],
    ];
    for (const [alias, table, mm2] of pairs) {
      expect(convert(alias, 'AWG', 'mm2').result).toBe(mm2);
      expect(convert(table, 'AWG', 'mm2').result).toBe(mm2);
    }
  });

  it('공식 문자열이 입력 표기를 그대로 보존한다', () => {
    expect(convert('4/0', 'AWG', 'mm2').formula).toBe('AWG 4/0 = 107.2 mm²');
  });

  it('isAwgSize 는 표에 있는 규격만 받는다', () => {
    for (const ok of ['12', '4/0', '0000', '00', '40']) expect(isAwgSize(ok)).toBe(true);
    for (const no of ['5/0', '41', '', 'abc', '1/1']) expect(isAwgSize(no)).toBe(false);
  });
});

/**
 * 표시 자릿수. 엔진 raw 는 그대로 두고 화면만 다듬는다 —
 * "100 kW = 134.1021858656296 HP" 가 공식줄의 "134.1021 HP" 와 갈렸다.
 */
describe('formatConverted', () => {
  it('16자리 부동소수를 공학 자릿수로 줄인다', () => {
    expect(formatConverted(134.1021858656296)).toBe('134.1');
  });

  it('정수는 소수점을 붙이지 않는다', () => {
    expect(formatConverted(77)).toBe('77');
    expect(formatConverted(-3)).toBe('-3');
  });

  it('크기에 따라 자릿수를 달리한다 — 작은 값일수록 더 남긴다', () => {
    expect(formatConverted(0.2205)).toBe('0.2205');
    expect(formatConverted(0.000123456789)).toBe('0.000123');
    expect(formatConverted(3.30891)).toBe('3.3089');
  });

  it('의미 없는 뒷자리 0 을 남기지 않는다', () => {
    expect(formatConverted(0.22)).toBe('0.22');
    expect(formatConverted(107.2)).toBe('107.2');
  });

  it('유한하지 않은 값은 손대지 않는다', () => {
    expect(formatConverted(NaN)).toBe('NaN');
    expect(formatConverted(Infinity)).toBe('Infinity');
  });
});
