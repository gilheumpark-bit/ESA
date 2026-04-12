import { log } from '@/lib/logger';
// =============================================================================
// PART 1: Imports & Configuration
// 뉴스 크롤러 — 제목+링크+날짜만 (저작권 클린)
// Sources: 전기신문(electimes.com), 에너지경제(ekn.kr), arXiv
// =============================================================================

import {
  NewsCrawled,
  CrawlerConfig,
  DEFAULT_CRAWLER_CONFIG,
} from './types';

/** 뉴스 크롤러 설정 */
const NEWS_CONFIG: CrawlerConfig = {
  ...DEFAULT_CRAWLER_CONFIG,
  rateLimit: 1500,
  retries: 3,
};

/** arXiv API base URL */
const ARXIV_API_BASE = 'http://export.arxiv.org/api/query';

// =============================================================================
// PART 2: Utility Functions
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  config: CrawlerConfig,
  attempt = 1,
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
        `[News] ${config.retries}회 재시도 후 실패: ${url} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const backoff = Math.min(1000 * Math.pow(2, attempt), 10_000);
    log.warn('crawl', 
      `[News] 재시도 ${attempt}/${config.retries} (${backoff}ms 후): ${error instanceof Error ? error.message : String(error)}`,
    );
    await delay(backoff);

    return fetchWithRetry(url, config, attempt + 1);
  }
}

/** XML 태그 값 추출 (단순 파서) */
function extractXmlValue(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
}

/** HTML에서 날짜 추출 시도 (ISO 8601 변환) */
function normalizeDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();

  // YYYY-MM-DD 형태
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00+09:00`;

  // YYYY.MM.DD 형태
  const dotMatch = dateStr.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (dotMatch) return `${dotMatch[1]}-${dotMatch[2]}-${dotMatch[3]}T00:00:00+09:00`;

  // YYYYMMDD 형태
  const numMatch = dateStr.match(/(\d{4})(\d{2})(\d{2})/);
  if (numMatch) return `${numMatch[1]}-${numMatch[2]}-${numMatch[3]}T00:00:00+09:00`;

  return new Date().toISOString();
}

// =============================================================================
// PART 3: 전기신문 (electimes.com) 크롤러
// =============================================================================

/**
 * 전기신문 최신 뉴스 제목+링크+날짜 크롤링
 * 본문 크롤링 안 함 — 저작권 클린
 */
async function crawlElectimes(): Promise<NewsCrawled[]> {
  const results: NewsCrawled[] = [];
  const url = 'https://www.electimes.com/news/articleList.html?sc_section_code=S1N1&view_type=sm';

  log.info('news-crawl', '[News] 전기신문 크롤링 시작');

  try {
    const response = await fetchWithRetry(url, NEWS_CONFIG);
    const html = await response.text();

    // 기사 제목 + URL 패턴 추출
    const articlePattern = /<a[^>]*href="(\/news\/articleView\.html\?idxno=\d+)"[^>]*>\s*([^<]+)/gi;
    let match: RegExpExecArray | null;

    while ((match = articlePattern.exec(html)) !== null) {
      const articleUrl = `https://www.electimes.com${match[1]}`;
      const title = match[2].trim();

      if (!title || title.length < 5) continue;

      // 날짜 패턴: 기사 근처에서 추출 시도
      const nearby = html.slice(Math.max(0, match.index - 200), match.index + 500);
      const dateMatch = nearby.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/);
      const publishedAt = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T00:00:00+09:00`
        : new Date().toISOString();

      results.push({
        title,
        url: articleUrl,
        source: '전기신문 (electimes.com)',
        publishedAt,
        category: 'electrical-news',
      });
    }

    log.info('news-crawl', `[News] 전기신문: ${results.length}개 기사`);
  } catch (error) {
    log.error('crawl', 
      '[News] 전기신문 크롤링 실패:',
      error instanceof Error ? error.message : String(error),
    );
  }

  return results;
}

// =============================================================================
// PART 4: 에너지경제 (ekn.kr) 크롤러
// =============================================================================

/**
 * 에너지경제 최신 뉴스 제목+링크+날짜 크롤링
 * 본문 크롤링 안 함 — 저작권 클린
 */
async function crawlEKN(): Promise<NewsCrawled[]> {
  const results: NewsCrawled[] = [];
  const url = 'https://www.ekn.kr/web/news/news_list';

  log.info('news-crawl', '[News] 에너지경제 크롤링 시작');

  try {
    const response = await fetchWithRetry(url, NEWS_CONFIG);
    const html = await response.text();

    // 기사 패턴 추출
    const articlePattern = /<a[^>]*href="(\/web\/news\/news_view[^"]*)"[^>]*>\s*([^<]+)/gi;
    let match: RegExpExecArray | null;

    while ((match = articlePattern.exec(html)) !== null) {
      const articleUrl = `https://www.ekn.kr${match[1]}`;
      const title = match[2].trim();

      if (!title || title.length < 5) continue;

      const nearby = html.slice(Math.max(0, match.index - 200), match.index + 500);
      const dateMatch = nearby.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/);
      const publishedAt = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T00:00:00+09:00`
        : new Date().toISOString();

      results.push({
        title,
        url: articleUrl,
        source: '에너지경제 (ekn.kr)',
        publishedAt,
        category: 'energy-news',
      });
    }

    log.info('news-crawl', `[News] 에너지경제: ${results.length}개 기사`);
  } catch (error) {
    log.error('crawl', 
      '[News] 에너지경제 크롤링 실패:',
      error instanceof Error ? error.message : String(error),
    );
  }

  return results;
}

// =============================================================================
// PART 5: arXiv 크롤러 (Atom API — 공개 데이터)
// =============================================================================

/**
 * arXiv electrical engineering 논문 크롤링
 * arXiv API는 Atom XML 반환 — 제목+링크+날짜+abstract(오픈소스)
 *
 * @param query - 검색 쿼리 (기본: electrical engineering power systems)
 * @param limit - 최대 결과 수 (기본: 50)
 */
export async function crawlArxiv(
  query = 'electrical engineering power systems',
  limit = 50,
): Promise<NewsCrawled[]> {
  const results: NewsCrawled[] = [];

  // arXiv API 쿼리 구성
  const searchQuery = encodeURIComponent(
    `all:${query} AND (cat:eess.SP OR cat:eess.SY OR cat:cs.SY)`,
  );
  const url = `${ARXIV_API_BASE}?search_query=${searchQuery}&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`;

  log.info('news-crawl', `[News] arXiv 크롤링 시작 (query: ${query}, limit: ${limit})`);

  try {
    const response = await fetchWithRetry(url, NEWS_CONFIG);
    const xml = await response.text();

    // <entry> 블록 추출
    const entryPattern = /<entry>([\s\S]*?)<\/entry>/g;
    let match: RegExpExecArray | null;

    while ((match = entryPattern.exec(xml)) !== null) {
      const entry = match[1];

      const title = extractXmlValue(entry, 'title').replace(/\s+/g, ' ');
      const link = entry.match(/href="(https:\/\/arxiv\.org\/abs\/[^"]+)"/)?.[1] ?? '';
      const published = extractXmlValue(entry, 'published');
      const summary = extractXmlValue(entry, 'summary').replace(/\s+/g, ' ');

      if (!title || !link) continue;

      results.push({
        title,
        url: link,
        source: 'arXiv',
        publishedAt: normalizeDate(published),
        category: 'arxiv-paper',
        summary, // arXiv abstract는 CC BY 라이선스 — 저작권 클린
      });
    }

    log.info('news-crawl', `[News] arXiv: ${results.length}개 논문`);
  } catch (error) {
    log.error('crawl', 
      '[News] arXiv 크롤링 실패:',
      error instanceof Error ? error.message : String(error),
    );
  }

  return results;
}

// =============================================================================
// PART 6: Public API — 통합 뉴스 크롤링
// =============================================================================

/**
 * 전체 뉴스 소스 크롤링 (제목+링크+날짜만 — 저작권 클린)
 * Sources: 전기신문, 에너지경제
 * (arXiv는 별도 crawlArxiv로 호출)
 */
export async function crawlNews(): Promise<NewsCrawled[]> {
  log.info('news-crawl', '[News] === 뉴스 크롤링 시작 ===');

  const [electimes, ekn] = await Promise.allSettled([
    crawlElectimes(),
    crawlEKN(),
  ]);

  const results: NewsCrawled[] = [];

  if (electimes.status === 'fulfilled') {
    results.push(...electimes.value);
  }

  await delay(NEWS_CONFIG.rateLimit);

  if (ekn.status === 'fulfilled') {
    results.push(...ekn.value);
  }

  log.info('news-crawl', `[News] === 크롤링 완료: 총 ${results.length}개 뉴스 ===`);
  return results;
}
