// =============================================================================
// ESVA Error Code Definitions
// 코드 체계:
//   ESVA-1xxx: 인증/권한
//   ESVA-2xxx: 플랜/제한
//   ESVA-3xxx: 검색
//   ESVA-4xxx: 계산
//   ESVA-5xxx: 내보내기
//   ESVA-6xxx: 외부 서비스 (LLM/IPFS)
//   ESVA-7xxx: 표준 변환
//   ESVA-9xxx: 시스템
// =============================================================================

/** @deprecated Use ESVAError */
export type ESAError = ESVAError;

export interface ESVAError {
  /** 에러 코드 (ESVA-XXXX) */
  code: string;
  /** 한국어 메시지 */
  message_ko: string;
  /** 영어 메시지 */
  message_en: string;
  /** HTTP 상태 코드 */
  httpStatus: number;
  /** 사용자 해결 제안 */
  suggestion?: string;
}

// =============================================================================
// PART 1: Auth/Permission (ESVA-1xxx)
// =============================================================================

const AUTH_ERRORS: ESAError[] = [
  {
    code: 'ESVA-1001',
    message_ko: '인증이 필요합니다',
    message_en: 'Authentication required',
    httpStatus: 401,
    suggestion: 'Please sign in to continue.',
  },
  {
    code: 'ESVA-1002',
    message_ko: '인증 토큰이 만료되었습니다',
    message_en: 'Authentication token expired',
    httpStatus: 401,
    suggestion: 'Please sign in again.',
  },
  {
    code: 'ESVA-1003',
    message_ko: '유효하지 않은 인증 토큰입니다',
    message_en: 'Invalid authentication token',
    httpStatus: 401,
  },
  {
    code: 'ESVA-1004',
    message_ko: '이 기능에 접근할 권한이 없습니다',
    message_en: 'Insufficient permissions for this feature',
    httpStatus: 403,
    suggestion: 'Upgrade your plan to access this feature.',
  },
  {
    code: 'ESVA-1005',
    message_ko: 'API 키가 유효하지 않습니다',
    message_en: 'Invalid API key',
    httpStatus: 401,
    suggestion: 'Check your API key in Settings > API Keys.',
  },
  {
    code: 'ESVA-1006',
    message_ko: 'API 키가 설정되지 않았습니다 (BYOK)',
    message_en: 'No API key configured (BYOK)',
    httpStatus: 401,
    suggestion: 'Add your own API key in Settings > BYOK.',
  },
  {
    code: 'ESVA-1007',
    message_ko: '계정이 비활성화되었습니다',
    message_en: 'Account has been deactivated',
    httpStatus: 403,
    suggestion: 'Contact support for account reactivation.',
  },
  {
    code: 'ESVA-1008',
    message_ko: 'OAuth 인증에 실패했습니다',
    message_en: 'OAuth authentication failed',
    httpStatus: 401,
  },
];

// =============================================================================
// PART 2: Plan/Limit (ESVA-2xxx)
// =============================================================================

const PLAN_ERRORS: ESAError[] = [
  {
    code: 'ESVA-2001',
    message_ko: '일일 검색 한도에 도달했습니다',
    message_en: 'Daily search limit reached',
    httpStatus: 429,
    suggestion: 'Upgrade to Pro for unlimited searches, or wait until tomorrow.',
  },
  {
    code: 'ESVA-2002',
    message_ko: '일일 계산 한도에 도달했습니다',
    message_en: 'Daily calculation limit reached',
    httpStatus: 429,
    suggestion: 'Upgrade to Pro for unlimited calculations.',
  },
  {
    code: 'ESVA-2003',
    message_ko: '이 계산기는 Pro 플랜 전용입니다',
    message_en: 'This calculator requires a Pro plan',
    httpStatus: 403,
    suggestion: 'Upgrade to Pro to access all calculators.',
  },
  {
    code: 'ESVA-2004',
    message_ko: '내보내기 한도에 도달했습니다',
    message_en: 'Export limit reached',
    httpStatus: 429,
    suggestion: 'Upgrade your plan for more exports.',
  },
  {
    code: 'ESVA-2005',
    message_ko: '요청 속도가 너무 빠릅니다',
    message_en: 'Rate limit exceeded',
    httpStatus: 429,
    suggestion: 'Please wait a moment and try again.',
  },
  {
    code: 'ESVA-2006',
    message_ko: '무료 체험 기간이 만료되었습니다',
    message_en: 'Free trial has expired',
    httpStatus: 403,
    suggestion: 'Subscribe to continue using ESA.',
  },
  {
    code: 'ESVA-2007',
    message_ko: '결제 정보를 확인해 주세요',
    message_en: 'Payment information needs attention',
    httpStatus: 402,
    suggestion: 'Update your payment method in Settings > Billing.',
  },
  {
    code: 'ESVA-2008',
    message_ko: '토큰 사용량 한도에 도달했습니다',
    message_en: 'Token usage limit reached',
    httpStatus: 429,
    suggestion: 'Increase your token budget in Settings, or use a smaller model.',
  },
];

// =============================================================================
// PART 3: Search (ESVA-3xxx)
// =============================================================================

const SEARCH_ERRORS: ESAError[] = [
  {
    code: 'ESVA-3001',
    message_ko: '검색어가 비어 있습니다',
    message_en: 'Search query is empty',
    httpStatus: 400,
  },
  {
    code: 'ESVA-3002',
    message_ko: '검색 결과를 찾을 수 없습니다',
    message_en: 'No results found',
    httpStatus: 404,
    suggestion: 'Try different keywords or check for typos.',
  },
  {
    code: 'ESVA-3003',
    message_ko: '검색어가 너무 깁니다',
    message_en: 'Search query too long',
    httpStatus: 400,
    suggestion: 'Limit your search query to 500 characters.',
  },
  {
    code: 'ESVA-3004',
    message_ko: '검색 인덱스를 사용할 수 없습니다',
    message_en: 'Search index unavailable',
    httpStatus: 503,
    suggestion: 'The search system is being updated. Please try again shortly.',
  },
  {
    code: 'ESVA-3005',
    message_ko: '지원하지 않는 검색 필터입니다',
    message_en: 'Unsupported search filter',
    httpStatus: 400,
  },
  {
    code: 'ESVA-3006',
    message_ko: '검색 시간이 초과되었습니다',
    message_en: 'Search timeout',
    httpStatus: 504,
    suggestion: 'Try a more specific query.',
  },
  {
    code: 'ESVA-3020',
    message_ko: '자동 안전 규칙에 의해 요청이 차단되었습니다',
    message_en: 'Request blocked by automated safety rules',
    httpStatus: 403,
    suggestion: 'Remove instruction-override phrases and resend a normal engineering question.',
  },
];

// =============================================================================
// PART 4: Calculation (ESVA-4xxx)
// =============================================================================

const CALC_ERRORS: ESAError[] = [
  {
    code: 'ESVA-4001',
    message_ko: '필수 입력값이 누락되었습니다',
    message_en: 'Required input parameter missing',
    httpStatus: 400,
  },
  {
    code: 'ESVA-4002',
    message_ko: '입력값이 허용 범위를 벗어났습니다',
    message_en: 'Input value out of valid range',
    httpStatus: 400,
    suggestion: 'Check the valid range for each parameter.',
  },
  {
    code: 'ESVA-4003',
    message_ko: '계산 중 수치 오류가 발생했습니다',
    message_en: 'Numerical error during calculation',
    httpStatus: 500,
    suggestion: 'Check input values for division by zero or overflow.',
  },
  {
    code: 'ESVA-4004',
    message_ko: '지원하지 않는 계산기입니다',
    message_en: 'Calculator not found',
    httpStatus: 404,
  },
  {
    code: 'ESVA-4005',
    message_ko: '입력 단위가 올바르지 않습니다',
    message_en: 'Invalid input unit',
    httpStatus: 400,
    suggestion: 'Use standard SI units or select from the dropdown.',
  },
  {
    code: 'ESVA-4006',
    message_ko: '계산 결과 검증에 실패했습니다',
    message_en: 'Calculation result validation failed',
    httpStatus: 500,
    suggestion: 'The result exceeds expected bounds. Please review inputs.',
  },
  {
    code: 'ESVA-4007',
    message_ko: '샌드박스 실행 시간이 초과되었습니다',
    message_en: 'Sandbox execution timeout',
    httpStatus: 504,
    suggestion: 'The calculation is too complex. Try simplifying inputs.',
  },
  {
    code: 'ESVA-4008',
    message_ko: '허용전류표 데이터를 찾을 수 없습니다',
    message_en: 'Ampacity table data not found',
    httpStatus: 404,
    suggestion: 'Check cable type and installation method.',
  },
  {
    code: 'ESVA-4009',
    message_ko: '전압 시스템이 올바르지 않습니다',
    message_en: 'Invalid voltage system',
    httpStatus: 400,
    suggestion: 'Select a valid voltage system (single-phase, three-phase, etc.).',
  },
];

// =============================================================================
// PART 5: Export (ESVA-5xxx)
// =============================================================================

const EXPORT_ERRORS: ESAError[] = [
  {
    code: 'ESVA-5001',
    message_ko: '내보내기 형식이 지원되지 않습니다',
    message_en: 'Export format not supported',
    httpStatus: 400,
    suggestion: 'Supported formats: PDF, Excel, JSON, CSV.',
  },
  {
    code: 'ESVA-5002',
    message_ko: '내보내기할 데이터가 없습니다',
    message_en: 'No data to export',
    httpStatus: 400,
  },
  {
    code: 'ESVA-5003',
    message_ko: 'PDF 생성에 실패했습니다',
    message_en: 'PDF generation failed',
    httpStatus: 500,
  },
  {
    code: 'ESVA-5004',
    message_ko: '영수증 생성에 실패했습니다',
    message_en: 'Receipt generation failed',
    httpStatus: 500,
  },
  {
    code: 'ESVA-5005',
    message_ko: '파일 크기가 제한을 초과했습니다',
    message_en: 'File size exceeds limit',
    httpStatus: 413,
    suggestion: 'Reduce data range or split into multiple exports.',
  },
];

// =============================================================================
// PART 6: External Service (ESVA-6xxx)
// =============================================================================

const EXTERNAL_ERRORS: ESAError[] = [
  {
    code: 'ESVA-6001',
    message_ko: 'LLM API 호출에 실패했습니다',
    message_en: 'LLM API call failed',
    httpStatus: 502,
    suggestion: 'The AI service is temporarily unavailable. Please try again.',
  },
  {
    code: 'ESVA-6002',
    message_ko: 'LLM 응답 시간이 초과되었습니다',
    message_en: 'LLM response timeout',
    httpStatus: 504,
    suggestion: 'Try a shorter query or different model.',
  },
  {
    code: 'ESVA-6003',
    message_ko: 'LLM API 키가 유효하지 않습니다',
    message_en: 'Invalid LLM API key',
    httpStatus: 401,
    suggestion: 'Verify your API key in Settings > BYOK.',
  },
  {
    code: 'ESVA-6004',
    message_ko: 'LLM 요금 한도에 도달했습니다',
    message_en: 'LLM billing limit reached',
    httpStatus: 402,
    suggestion: 'Check your API provider billing status.',
  },
  {
    code: 'ESVA-6005',
    message_ko: 'IPFS 업로드에 실패했습니다',
    message_en: 'IPFS upload failed',
    httpStatus: 502,
  },
  {
    code: 'ESVA-6006',
    message_ko: 'IPFS에서 영수증을 찾을 수 없습니다',
    message_en: 'Receipt not found on IPFS',
    httpStatus: 404,
    suggestion: 'The receipt CID may be invalid or the content has been unpinned.',
  },
  {
    code: 'ESVA-6007',
    message_ko: 'Supabase 연결에 실패했습니다',
    message_en: 'Supabase connection failed',
    httpStatus: 503,
  },
  {
    code: 'ESVA-6008',
    message_ko: 'Stripe 결제 처리에 실패했습니다',
    message_en: 'Stripe payment processing failed',
    httpStatus: 502,
  },
  {
    code: 'ESVA-6009',
    message_ko: 'LLM 컨텍스트 길이를 초과했습니다',
    message_en: 'LLM context length exceeded',
    httpStatus: 400,
    suggestion: 'Reduce your query length or conversation history.',
  },
];

// =============================================================================
// PART 7: Standard Conversion (ESVA-7xxx)
// =============================================================================

const STANDARD_ERRORS: ESAError[] = [
  {
    code: 'ESVA-7001',
    message_ko: '표준 조항을 찾을 수 없습니다',
    message_en: 'Standard clause not found',
    httpStatus: 404,
    suggestion: 'Check the standard name and clause number.',
  },
  {
    code: 'ESVA-7002',
    message_ko: '표준 간 변환이 지원되지 않습니다',
    message_en: 'Standard conversion not supported',
    httpStatus: 400,
    suggestion: 'This standard pair is not yet supported for conversion.',
  },
  {
    code: 'ESVA-7003',
    message_ko: '표준 판/버전이 올바르지 않습니다',
    message_en: 'Invalid standard edition/version',
    httpStatus: 400,
  },
  {
    code: 'ESVA-7004',
    message_ko: '유료 표준이므로 전문을 제공할 수 없습니다',
    message_en: 'Full text unavailable due to licensing restrictions',
    httpStatus: 403,
    suggestion: 'Only summary and reference links are available for this standard.',
  },
  {
    code: 'ESVA-7005',
    message_ko: 'KEC-NEC 매핑 데이터가 없습니다',
    message_en: 'KEC-NEC mapping data not available',
    httpStatus: 404,
  },
];

// =============================================================================
// PART 8: System (ESVA-9xxx)
// =============================================================================

const SYSTEM_ERRORS: ESAError[] = [
  {
    code: 'ESVA-9001',
    message_ko: '내부 서버 오류가 발생했습니다',
    message_en: 'Internal server error',
    httpStatus: 500,
    suggestion: 'Please try again. If the problem persists, contact support.',
  },
  {
    code: 'ESVA-9002',
    message_ko: '서비스를 일시적으로 사용할 수 없습니다',
    message_en: 'Service temporarily unavailable',
    httpStatus: 503,
    suggestion: 'ESVA is under maintenance. Please try again later.',
  },
  {
    code: 'ESVA-9003',
    message_ko: '요청 형식이 올바르지 않습니다',
    message_en: 'Invalid request format',
    httpStatus: 400,
  },
  {
    code: 'ESVA-9004',
    message_ko: '데이터베이스 연결에 실패했습니다',
    message_en: 'Database connection failed',
    httpStatus: 503,
  },
  {
    code: 'ESVA-9005',
    message_ko: '미들웨어 인증 오류',
    message_en: 'Middleware authentication error',
    httpStatus: 500,
  },
  {
    code: 'ESVA-9006',
    message_ko: '지원하지 않는 API 버전입니다',
    message_en: 'Unsupported API version',
    httpStatus: 400,
  },
  {
    code: 'ESVA-9007',
    message_ko: 'CORS 정책 위반',
    message_en: 'CORS policy violation',
    httpStatus: 403,
  },
  {
    code: 'ESVA-9008',
    message_ko: 'CSP(Content Security Policy) 위반',
    message_en: 'Content Security Policy violation',
    httpStatus: 403,
  },
];

// =============================================================================
// PART 9: Export & Helpers
// =============================================================================

export const ESVA_ERRORS: ESAError[] = [
  ...AUTH_ERRORS,
  ...PLAN_ERRORS,
  ...SEARCH_ERRORS,
  ...CALC_ERRORS,
  ...EXPORT_ERRORS,
  ...EXTERNAL_ERRORS,
  ...STANDARD_ERRORS,
  ...SYSTEM_ERRORS,
];

/** 에러 코드로 에러 정보 조회 */
export function getErrorByCode(code: string): ESAError | undefined {
  return ESVA_ERRORS.find((e) => e.code === code);
}

/** HTTP 상태 코드에 해당하는 에러 목록 */
export function getErrorsByHttpStatus(status: number): ESAError[] {
  return ESVA_ERRORS.filter((e) => e.httpStatus === status);
}

/** 카테고리별 에러 목록 (코드 prefix 기준) */
export function getErrorsByCategory(prefix: string): ESAError[] {
  return ESVA_ERRORS.filter((e) => e.code.startsWith(prefix));
}

/** ESAError를 API 응답 형태로 직렬화 */
export function serializeError(code: string, locale: 'ko' | 'en' = 'ko') {
  const err = getErrorByCode(code);
  if (!err) return { error: code, message: 'Unknown error' };
  return {
    error: err.code,
    message: locale === 'ko' ? err.message_ko : err.message_en,
    ...(err.suggestion && { suggestion: err.suggestion }),
  };
}
