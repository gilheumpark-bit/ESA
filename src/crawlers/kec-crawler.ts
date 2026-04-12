import { log } from '@/lib/logger';
// =============================================================================
// PART 1: Imports & Configuration
// KEC (한국전기설비기술기준) 크롤러 — law.go.kr 공공 API
// =============================================================================

import {
  CrawledDocument,
  CrawlerConfig,
  DEFAULT_CRAWLER_CONFIG,
} from './types';

/** law.go.kr 공공 API 기본 URL */
const LAW_API_BASE = 'https://www.law.go.kr/DRF';

/** 크롤링 대상 법령 목록 */
const KEC_TARGETS = [
  {
    name: '전기설비기술기준',
    query: '전기설비기술기준',
    standard: 'KEC',
    genre: 'standard' as const,
  },
  {
    name: '전기사업법',
    query: '전기사업법',
    standard: '전기사업법',
    genre: 'regulation' as const,
  },
  {
    name: '전기안전관리법',
    query: '전기안전관리법',
    standard: '전기안전관리법',
    genre: 'regulation' as const,
  },
] as const;

/** KEC 크롤러 설정: law.go.kr은 1req/sec */
const KEC_CONFIG: CrawlerConfig = {
  ...DEFAULT_CRAWLER_CONFIG,
  rateLimit: 1000,
};

// =============================================================================
// PART 2: Utility Functions
// =============================================================================

/** 지정 시간만큼 대기 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 지수 백오프 재시도 fetch */
async function fetchWithRetry(
  url: string,
  config: CrawlerConfig,
  attempt = 1
): Promise<Response> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    const response = await fetch(url, {
      headers: { 'User-Agent': config.userAgent },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    if (attempt >= config.retries) {
      throw new Error(
        `[KEC] ${config.retries}회 재시도 후 실패: ${url} — ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const backoff = Math.min(1000 * Math.pow(2, attempt), 10_000);
    log.warn('crawl', 
      `[KEC] 재시도 ${attempt}/${config.retries} (${backoff}ms 후): ${error instanceof Error ? error.message : String(error)}`
    );
    await delay(backoff);

    return fetchWithRetry(url, config, attempt + 1);
  }
}

/** XML 텍스트에서 태그 값 추출 (단순 파서 — DOMParser 불필요) */
function extractXmlValue(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

/** XML 텍스트에서 반복 태그 배열 추출 */
function _extractXmlArray(xml: string, wrapperTag: string, itemTag: string): string[] {
  const wrapperRegex = new RegExp(`<${wrapperTag}>([\\s\\S]*?)</${wrapperTag}>`);
  const wrapperMatch = xml.match(wrapperRegex);
  if (!wrapperMatch) return [];

  const itemRegex = new RegExp(`<${itemTag}>([\\s\\S]*?)</${itemTag}>`, 'g');
  const results: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(wrapperMatch[1])) !== null) {
    results.push(match[1].trim());
  }

  return results;
}

/** 날짜 문자열 정규화 (YYYYMMDD → ISO) */
function normalizeLawDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) return new Date().toISOString();

  const cleaned = dateStr.replace(/[^0-9]/g, '');
  if (cleaned.length >= 8) {
    const y = cleaned.slice(0, 4);
    const m = cleaned.slice(4, 6);
    const d = cleaned.slice(6, 8);
    return `${y}-${m}-${d}T00:00:00+09:00`;
  }

  return new Date().toISOString();
}

// =============================================================================
// PART 3: 법령 목록 조회
// =============================================================================

interface LawListItem {
  /** 법령 일련번호 */
  lawId: string;
  /** 법령명 */
  lawName: string;
  /** 시행일 */
  enforcementDate: string;
  /** 공포일 */
  promulgationDate: string;
}

/**
 * law.go.kr 에서 법령 목록 검색
 * API: /DRF/lawSearch.do?OC=test&target=law&type=XML&query=...
 */
async function searchLaws(query: string): Promise<LawListItem[]> {
  // law.go.kr 공공 API — OC 파라미터는 공개 테스트용
  const url = `${LAW_API_BASE}/lawSearch.do?OC=test&target=law&type=XML&query=${encodeURIComponent(query)}&display=10&sort=date`;

  log.info('kec-crawl', `[KEC] 법령 검색: ${query}`);

  const response = await fetchWithRetry(url, KEC_CONFIG);
  const xml = await response.text();

  // <law> 블록 반복 추출
  const lawBlocks: string[] = [];
  const lawRegex = /<law>([\s\S]*?)<\/law>/g;
  let match: RegExpExecArray | null;

  while ((match = lawRegex.exec(xml)) !== null) {
    lawBlocks.push(match[1]);
  }

  return lawBlocks.map((block) => ({
    lawId: extractXmlValue(block, '법령일련번호') || extractXmlValue(block, 'lawId'),
    lawName: extractXmlValue(block, '법령명한글') || extractXmlValue(block, 'lawNameKorean'),
    enforcementDate: extractXmlValue(block, '시행일자') || extractXmlValue(block, 'enforcementDate'),
    promulgationDate: extractXmlValue(block, '공포일자') || extractXmlValue(block, 'promulgationDate'),
  }));
}

// =============================================================================
// PART 4: 법령 본문 조회
// =============================================================================

interface LawArticle {
  /** 조문 번호 */
  articleNumber: string;
  /** 조문 제목 */
  articleTitle: string;
  /** 조문 내용 */
  articleContent: string;
}

/**
 * 법령 상세 조회 (조문 목록)
 * API: /DRF/lawService.do?OC=test&target=law&MST=법령일련번호&type=XML
 */
async function fetchLawArticles(lawId: string): Promise<{
  lawName: string;
  lastAmended: string;
  articles: LawArticle[];
}> {
  const url = `${LAW_API_BASE}/lawService.do?OC=test&target=law&MST=${lawId}&type=XML`;

  log.info('kec-crawl', `[KEC] 법령 본문 조회: ${lawId}`);

  const response = await fetchWithRetry(url, KEC_CONFIG);
  const xml = await response.text();

  const lawName =
    extractXmlValue(xml, '법령명_한글') ||
    extractXmlValue(xml, '법령명한글') ||
    extractXmlValue(xml, 'lawNameKorean') ||
    '';

  const lastAmended =
    extractXmlValue(xml, '시행일자') ||
    extractXmlValue(xml, 'enforcementDate') ||
    '';

  // 조문 파싱
  const articles: LawArticle[] = [];
  const articleRegex = /<조문>([\s\S]*?)<\/조문>|<article>([\s\S]*?)<\/article>/g;
  let artMatch: RegExpExecArray | null;

  while ((artMatch = articleRegex.exec(xml)) !== null) {
    const block = artMatch[1] || artMatch[2] || '';

    const number =
      extractXmlValue(block, '조문번호') ||
      extractXmlValue(block, 'articleNo') ||
      '';
    const title =
      extractXmlValue(block, '조문제목') ||
      extractXmlValue(block, 'articleTitle') ||
      '';
    const content =
      extractXmlValue(block, '조문내용') ||
      extractXmlValue(block, 'articleContent') ||
      '';

    if (number || title || content) {
      articles.push({
        articleNumber: number,
        articleTitle: title,
        articleContent: content.replace(/<[^>]+>/g, '').trim(),
      });
    }
  }

  return { lawName, lastAmended, articles };
}

// =============================================================================
// PART 5: Public API — 전체 KEC 크롤링
// =============================================================================

/**
 * KEC 관련 법령 전체 크롤링
 * - 전기설비기술기준 (KEC)
 * - 전기사업법
 * - 전기안전관리법
 *
 * @returns 크롤링된 문서 배열 (IngestableDocument 호환)
 */
export async function crawlKEC(): Promise<CrawledDocument[]> {
  const documents: CrawledDocument[] = [];
  const now = new Date().toISOString();

  log.info('kec-crawl', '[KEC] === KEC 크롤링 시작 ===');

  for (const target of KEC_TARGETS) {
    try {
      // 법령 검색
      const laws = await searchLaws(target.query);
      await delay(KEC_CONFIG.rateLimit);

      if (laws.length === 0) {
        log.warn('kec-crawl', `[KEC] "${target.name}" 검색 결과 없음`);
        continue;
      }

      // 가장 최근 법령 선택
      const law = laws[0];
      if (!law.lawId) {
        log.warn('kec-crawl', `[KEC] "${target.name}" lawId 없음, 건너뜀`);
        continue;
      }

      // 법령 본문 조회
      const detail = await fetchLawArticles(law.lawId);
      await delay(KEC_CONFIG.rateLimit);

      // 조문별 문서 생성
      for (const article of detail.articles) {
        documents.push({
          title: `${target.name} ${article.articleNumber} ${article.articleTitle}`.trim(),
          content: article.articleContent,
          url: `https://www.law.go.kr/법령/${encodeURIComponent(target.name)}`,
          source: 'law.go.kr (국가법령정보센터)',
          licenseType: 'open',
          country: 'KR',
          genre: target.genre,
          publishedAt: normalizeLawDate(detail.lastAmended || law.enforcementDate),
          crawledAt: now,
          standard: target.standard,
          clause: article.articleNumber,
        });
      }

      log.info('crawl', 
        `[KEC] ${target.name}: ${detail.articles.length}개 조문 크롤링 완료`
      );
    } catch (error) {
      log.error('crawl', 
        `[KEC] ${target.name} 크롤링 실패:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  log.info('kec-crawl', `[KEC] === 크롤링 완료: 총 ${documents.length}개 문서 ===`);
  return documents;
}

// =============================================================================
// PART 6: Public API — 단일 조항 크롤링
// =============================================================================

/**
 * KEC 특정 조항 크롤링
 *
 * @param clauseNumber - 조문 번호 (예: "제3조", "112")
 * @param lawName - 법령명 (기본: 전기설비기술기준)
 * @returns 해당 조문의 CrawledDocument 또는 null
 */
export async function crawlKECClause(
  clauseNumber: string,
  lawName = '전기설비기술기준'
): Promise<CrawledDocument | null> {
  const now = new Date().toISOString();

  log.info('kec-crawl', `[KEC] 조항 크롤링: ${lawName} ${clauseNumber}`);

  try {
    const laws = await searchLaws(lawName);
    await delay(KEC_CONFIG.rateLimit);

    if (laws.length === 0 || !laws[0].lawId) {
      log.warn('kec-crawl', `[KEC] "${lawName}" 검색 결과 없음`);
      return null;
    }

    const detail = await fetchLawArticles(laws[0].lawId);

    // 조문 번호 매칭 (유연한 매칭: "제3조", "3조", "3" 등)
    const normalized = clauseNumber.replace(/[^0-9]/g, '');
    const article = detail.articles.find((a) => {
      const artNum = a.articleNumber.replace(/[^0-9]/g, '');
      return artNum === normalized || a.articleNumber.includes(clauseNumber);
    });

    if (!article) {
      log.warn('kec-crawl', `[KEC] 조문 "${clauseNumber}" 찾을 수 없음`);
      return null;
    }

    return {
      title: `${lawName} ${article.articleNumber} ${article.articleTitle}`.trim(),
      content: article.articleContent,
      url: `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}`,
      source: 'law.go.kr (국가법령정보센터)',
      licenseType: 'open',
      country: 'KR',
      genre: 'standard',
      publishedAt: normalizeLawDate(detail.lastAmended),
      crawledAt: now,
      standard: 'KEC',
      clause: article.articleNumber,
    };
  } catch (error) {
    log.error('crawl', 
      `[KEC] 조항 크롤링 실패:`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}
