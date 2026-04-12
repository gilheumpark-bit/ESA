/**
 * User-Friendly Error Messages
 * ------------------------------
 * ESVA-XXXX 에러 코드를 사용자 친화적 한글 메시지로 변환.
 * API 에러 응답의 code 필드를 UI에서 번역할 때 사용.
 *
 * 사용법:
 *   import { getUserMessage } from '@/lib/error-messages';
 *   const msg = getUserMessage('ESVA-4003'); // "계산기 ID를 입력해주세요"
 */

const ERROR_MESSAGES: Record<string, { ko: string; action?: string }> = {
  // Auth (1xxx)
  'ESVA-1001': { ko: '로그인이 필요합니다.', action: '로그인 페이지로 이동합니다.' },
  'ESVA-1002': { ko: '로그인이 만료되었습니다. 다시 로그인해주세요.' },
  'ESVA-1010': { ko: 'API 키가 유효하지 않습니다.', action: '설정에서 API 키를 확인해주세요.' },

  // Plan (2xxx)
  'ESVA-2001': { ko: '일일 사용 한도에 도달했습니다.', action: 'Pro 플랜으로 업그레이드하거나 내일 다시 시도해주세요.' },

  // Search (3xxx)
  'ESVA-3001': { ko: '접근이 차단되었습니다.' },
  'ESVA-3002': { ko: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  'ESVA-3010': { ko: '검색어를 입력해주세요.' },
  'ESVA-3014': { ko: '일일 토큰 한도 초과. 자체 API 키를 등록하면 무제한 사용 가능합니다.', action: '설정 → BYOK에서 API 키를 등록하세요.' },

  // Calculation (4xxx)
  'ESVA-4001': { ko: '필수 입력값이 누락되었습니다.', action: '빨간색 표시된 필드를 확인해주세요.' },
  'ESVA-4002': { ko: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  'ESVA-4003': { ko: '계산기를 선택해주세요.' },
  'ESVA-4004': { ko: '입력값이 올바르지 않습니다.', action: '숫자와 단위를 확인해주세요.' },
  'ESVA-4005': { ko: '존재하지 않는 계산기입니다.' },
  'ESVA-4010': { ko: '입력값이 유효하지 않습니다.', action: '범위를 확인해주세요.' },
  'ESVA-4401': { ko: '전압 범위 초과입니다. 208V ~ 15,000V만 지원합니다.' },
  'ESVA-4402': { ko: '단락전류 범위 초과입니다. 0.2 ~ 106kA만 지원합니다.' },
  'ESVA-4403': { ko: '아크 지속시간 범위 초과입니다. 0 ~ 10초만 지원합니다.' },
  'ESVA-4500': { ko: '설계 리뷰 실행에 실패했습니다.', action: '입력 파라미터를 확인해주세요.' },

  // Export (5xxx)
  'ESVA-5001': { ko: '지원하지 않는 내보내기 형식입니다.' },

  // External (6xxx)
  'ESVA-6001': { ko: 'AI 서비스 연결에 실패했습니다.', action: 'API 키를 확인하거나 잠시 후 다시 시도해주세요.' },
  'ESVA-6002': { ko: 'AI 서비스 응답 시간이 초과되었습니다.', action: '잠시 후 다시 시도해주세요.' },

  // System (9xxx)
  'ESVA-9001': { ko: '접근이 차단되었습니다.' },
  'ESVA-9002': { ko: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  'ESVA-9500': { ko: '내부 오류가 발생했습니다.', action: '잠시 후 다시 시도해주세요.' },
  'ESVA-9999': { ko: '알 수 없는 오류가 발생했습니다.', action: '문제가 지속되면 문의해주세요.' },
};

/**
 * ESVA 에러 코드 → 사용자 친화적 한글 메시지.
 * 매핑되지 않은 코드는 기본 메시지 반환.
 */
export function getUserMessage(code: string): string {
  const entry = ERROR_MESSAGES[code];
  if (!entry) return '오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  return entry.action ? `${entry.ko} ${entry.action}` : entry.ko;
}

/**
 * API 에러 응답에서 사용자 메시지 추출.
 * error.code가 있으면 한글 변환, 없으면 message 그대로.
 */
export function formatApiError(error: { code?: string; message?: string }): string {
  if (error.code) {
    const friendly = getUserMessage(error.code);
    if (friendly !== '오류가 발생했습니다. 잠시 후 다시 시도해주세요.') {
      return friendly;
    }
  }
  return error.message ?? '오류가 발생했습니다.';
}
