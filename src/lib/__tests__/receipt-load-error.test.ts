import { receiptLoadErrorMessage, safeReceiptLoadError } from '../receipt-load-error';

describe('receiptLoadErrorMessage', () => {
  test.each([
    [401, '로그인이 필요합니다.'],
    [403, '이 영수증을 볼 권한이 없습니다.'],
    [404, '영수증을 찾을 수 없습니다.'],
  ])('maps HTTP %i to a user-actionable message', (status, expected) => {
    expect(receiptLoadErrorMessage(status)).toBe(expected);
  });

  test('does not expose a raw 5xx status to the user', () => {
    const message = receiptLoadErrorMessage(500);

    expect(message).toBe('서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도하세요.');
    expect(message).not.toMatch(/500|실패/);
  });

  test('does not expose browser network errors', () => {
    expect(safeReceiptLoadError(new TypeError('Failed to fetch')))
      .toBe('네트워크 연결을 확인한 뒤 다시 시도하세요.');
  });

  test('preserves messages produced by the HTTP status mapper', () => {
    const notFound = receiptLoadErrorMessage(404);
    expect(safeReceiptLoadError(new Error(notFound))).toBe(notFound);
  });
});
