// =============================================================================
// PART 1: Crawler Common Types
// 크롤러 공통 타입 정의
// =============================================================================

/** 크롤링된 문서 (법령, 표준 등) */
export interface CrawledDocument {
  /** 문서 제목 */
  title: string;
  /** 본문 (전문 크롤링 시) */
  content?: string;
  /** 요약 */
  summary?: string;
  /** 원문 URL */
  url: string;
  /** 출처 명칭 */
  source: string;
  /** 라이선스 유형: open=공공/오픈, restricted=제한적, proprietary=유료 */
  licenseType: 'open' | 'restricted' | 'proprietary';
  /** 국가 코드 (ISO 3166-1 alpha-2) */
  country: string;
  /** 장르: standard, regulation, news, paper, datasheet */
  genre: 'standard' | 'regulation' | 'news' | 'paper' | 'datasheet';
  /** 원문 게시/개정일 */
  publishedAt: string;
  /** 크롤링 시각 (ISO 8601) */
  crawledAt: string;
  /** 표준 번호 (KEC, IEC 등) */
  standard?: string;
  /** 조항/절 번호 */
  clause?: string;
}

// =============================================================================
// PART 2: IEC 60050 용어 크롤링 타입
// =============================================================================

/** Electropedia에서 크롤링한 전기공학 용어 */
export interface ElectricalTermCrawled {
  /** IEC 60050 용어 ID (예: 826-14-01) */
  id: string;
  /** 한국어 용어 */
  ko: string;
  /** 영어 용어 */
  en: string;
  /** 일본어 용어 */
  ja?: string;
  /** 중국어 용어 */
  zh?: string;
  /** 정의 (영문) */
  definition: string;
  /** 동의어/약어 */
  synonyms: string[];
  /** 분류 카테고리 */
  category: string;
  /** IEC 참조 번호 */
  iecRef: string;
  /** 관련 용어 ID 목록 */
  relatedTerms?: string[];
  /** electropedia.org 원문 링크 (크롤링 대신 링크 참조) */
  sourceUrl?: string;
}

// =============================================================================
// PART 3: 뉴스 크롤링 타입
// =============================================================================

/** 뉴스 크롤링 결과 (제목+링크+날짜+출처만 — 저작권 클린) */
export interface NewsCrawled {
  /** 기사 제목 */
  title: string;
  /** 원문 URL */
  url: string;
  /** 출처 매체명 */
  source: string;
  /** 게시일 (ISO 8601) */
  publishedAt: string;
  /** 분류 카테고리 */
  category: string;
  /** 요약 (arXiv abstract 등 오픈소스만) */
  summary?: string;
}

// =============================================================================
// PART 4: 크롤러 설정
// =============================================================================

/** 크롤러 공통 설정 */
export interface CrawlerConfig {
  /** 요청 간 최소 간격 (ms) */
  rateLimit: number;
  /** robots.txt 준수 여부 */
  respectRobots: boolean;
  /** User-Agent 헤더 */
  userAgent: string;
  /** 요청 타임아웃 (ms) */
  timeout: number;
  /** 재시도 횟수 */
  retries: number;
}

/** 기본 크롤러 설정 */
export const DEFAULT_CRAWLER_CONFIG: CrawlerConfig = {
  rateLimit: 1000,
  respectRobots: true,
  userAgent: 'ESVA-Crawler/1.0 (+https://esva.engineer; electrical-engineering-search)',
  timeout: 30_000,
  retries: 3,
};

// =============================================================================
// PART 5: 스케줄러 타입
// =============================================================================

/** 크롤 작업 정의 */
export interface CrawlJob {
  /** 고유 작업 ID */
  id: string;
  /** 데이터 소스 명칭 */
  source: string;
  /** 크롤러 함수 이름 */
  crawler: string;
  /** 실행 주기 (ms) */
  interval: number;
  /** 마지막 실행 시각 (ISO 8601) */
  lastRun?: string;
  /** 활성화 여부 */
  enabled: boolean;
}

/** 크롤 실행 결과 */
export interface CrawlResult {
  /** 작업 ID */
  jobId: string;
  /** 성공 여부 */
  success: boolean;
  /** 크롤링된 문서 수 */
  documentsCount: number;
  /** 실행 시간 (ms) */
  duration: number;
  /** 에러 메시지 */
  error?: string;
  /** 실행 시각 */
  timestamp: string;
}
