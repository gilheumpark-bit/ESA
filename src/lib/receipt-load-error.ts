export function receiptLoadErrorMessage(status: number): string {
  // 400 = 주소의 영수증 ID 가 형식에 안 맞는다(API: ESVA-4020 Invalid receipt ID).
  // 이걸 기본 문구로 흘리면 "서비스 연결이 원활하지 않습니다. 잠시 후 다시
  // 시도하세요" 가 되는데, 연결은 멀쩡하고 다시 시도해도 영원히 안 된다 —
  // 오래된 링크·오타를 든 사용자가 엉뚱한 곳을 기다리게 된다(실측 2026-07-26).
  if (status === 400) return '영수증 주소가 올바르지 않습니다. 링크를 다시 확인하세요.';
  if (status === 401) return '로그인이 필요합니다.';
  if (status === 403) return '이 영수증을 볼 권한이 없습니다.';
  if (status === 404) return '영수증을 찾을 수 없습니다.';
  return '서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도하세요.';
}

const SAFE_RECEIPT_ERRORS = new Set([
  receiptLoadErrorMessage(400),
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
