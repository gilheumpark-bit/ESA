import { receiptLoadErrorMessage, safeReceiptLoadError } from '../receipt-load-error';

describe('receiptLoadErrorMessage', () => {
  test.each([
    // 400 은 주소가 잘못된 것이지 서비스 장애가 아니다. 기본 문구로 흘리면
    // "잠시 후 다시 시도하세요" 가 되는데 다시 시도해도 안 된다.
    [400, '영수증 주소가 올바르지 않습니다. 링크를 다시 확인하세요.'],
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
    for (const status of [400, 401, 403, 404]) {
      const message = receiptLoadErrorMessage(status);
      expect(safeReceiptLoadError(new Error(message))).toBe(message);
    }
  });

  test('잘못된 주소를 재시도하라고 안내하지 않는다', () => {
    expect(receiptLoadErrorMessage(400)).not.toMatch(/다시 시도/);
  });
});
