import { miniFormNotice } from '@/components/InlineCalcResult';

// The bridge refuses to auto-run a query that supplied no values (every input
// would be a default), so the mini form must not call such a query "ready".
describe('InlineCalcResult mini-form notice', () => {
  test('a query with no values still asks for input, even with no required fields', () => {
    expect(miniFormNotice([], 0, false)).toBe('추가 입력이 필요합니다. 아래 항목을 입력해 주세요.');
  });

  test('a query that supplied its inputs is ready (e.g. after an account switch cleared it)', () => {
    expect(miniFormNotice([], 0, true)).toBe('필수 입력값은 준비되어 있습니다. 계산하기를 눌러 결과를 받으세요.');
  });

  test('missing required fields always ask for input', () => {
    expect(miniFormNotice([], 2, true)).toBe('추가 입력이 필요합니다. 아래 항목을 입력해 주세요.');
  });

  test('unread numbers are named first', () => {
    expect(miniFormNotice([380, 50], 0, true)).toContain('380, 50');
  });
});
