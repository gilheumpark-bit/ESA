import { splitCompleteSseLines } from '../sse-line-buffer';

describe('splitCompleteSseLines', () => {
  test('keeps a JSON event that is split across network chunks', () => {
    const first = splitCompleteSseLines('', 'data: {"text":"VC');
    expect(first.lines).toEqual([]);
    expect(first.remainder).toBe('data: {"text":"VC');

    const second = splitCompleteSseLines(first.remainder, 'B 설명"}\n\n');
    expect(second.lines).toEqual(['data: {"text":"VCB 설명"}', '']);
    expect(second.remainder).toBe('');
  });

  test('returns multiple complete events and retains only the trailing fragment', () => {
    const result = splitCompleteSseLines(
      '',
      'data: {"text":"첫째"}\r\n\r\ndata: {"text":"둘',
    );

    expect(result.lines).toEqual(['data: {"text":"첫째"}', '']);
    expect(result.remainder).toBe('data: {"text":"둘');
  });
});
