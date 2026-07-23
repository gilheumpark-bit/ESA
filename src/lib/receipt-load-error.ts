export function receiptLoadErrorMessage(status: number): string {
  if (status === 401) return '로그인이 필요합니다.';
  if (status === 403) return '이 영수증을 볼 권한이 없습니다.';
  if (status === 404) return '영수증을 찾을 수 없습니다.';
  return '서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도하세요.';
}

const SAFE_RECEIPT_ERRORS = new Set([
  receiptLoadErrorMessage(401),
  receiptLoadErrorMessage(403),
  receiptLoadErrorMessage(404),
  receiptLoadErrorMessage(500),
]);

export function safeReceiptLoadError(error: unknown): string {
  if (error instanceof Error && SAFE_RECEIPT_ERRORS.has(error.message)) {
    return error.message;
  }
  return '네트워크 연결을 확인한 뒤 다시 시도하세요.';
}
