import { filterLLMOutput, applyConfidenceGate } from '../output-filter';
import { canonicalMagnitude, quantityKey } from '../quantity-token';

describe('quantity evidence is dimension-, sign- and exponent-bound', () => {
  it.each([
    ['소비전력은 175kW입니다.', '입력 전류는 175A입니다.'],
    ['시험 결과는 1e6V입니다.', '입력 값은 1입니다.'],
    ['측정 전류는 -175A입니다.', '175A'],
    ['측정 전류는 1MA입니다.', '1mA'],
    ['측정 길이는 5미터입니다.', ''],
    ['온도는 5℃입니다.', ''],
    ['수량은 9개입니다.', ''],
    ['계수는 5입니다.', ''],
  ])('blocks %s from %s', (output, input) => {
    expect(filterLLMOutput(output, [], input).passed).toBe(false);
    expect(filterLLMOutput(output, [], input).filtered).toContain('[미확인]');
  });
  it.each([
    ['입력은 -1.25e-3A입니다.', '-0.00125A'],
    ['길이는 5미터입니다.', '5m'],
    ['Step 1: Check.\n2. Review', ''],
    ['체감온도 31℃입니다.', ''],
    ['입력값 55,000W입니다.', '55000W'],
  ])('preserves an exact quantity or a real ordinal: %s', (output, input) => {
    expect(filterLLMOutput(output, [], input).passed).toBe(true);
  });
  it('normalizes decimal notation without rounding large integers', () => {
    expect(quantityKey('1e6', 'V')).toBe(quantityKey('1000000', 'V'));
    expect(quantityKey('9007199254740992', 'V')).not.toBe(quantityKey('9007199254740993', 'V'));
    expect(canonicalMagnitude('1e999999')).toBeNull();
    expect(canonicalMagnitude('word')).toBeNull();
    expect(canonicalMagnitude('-0.00')).toBe('0e0');
  });
});

it('does not round a contradictory registered distance into the approved value',()=>{expect(filterLLMOutput('154kV 접근 한계거리 1.7000000000000001m입니다.').passed).toBe(false);});


describe('confidence gate retains the established fallback contract', () => {
  it('blocks insufficient confidence without leaking the original answer', () => {
    const result = applyConfidenceGate('unverified output', 0.4);
    expect(result.passed).toBe(false);
    expect(result.blocked[0].reason).toBe('insufficient_data');
    expect(result.filtered).not.toContain('unverified output');
  });
  it('preserves adequate confidence and missing optional confidence', () => {
    expect(applyConfidenceGate('answer', 0.8).filtered).toBe('answer');
    expect(applyConfidenceGate('answer').passed).toBe(true);
  });
  it('an out-of-range exponent cannot seed numeric trust', () => {
    expect(filterLLMOutput('value 175A', [], '1e999999V').passed).toBe(false);
  });
});
