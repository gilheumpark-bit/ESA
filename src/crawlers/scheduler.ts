import { log } from '@/lib/logger';
// =============================================================================
// PART 1: Imports & Schedule Definition
// 크롤 스케줄 매니저 — 주기적 크롤링 작업 관리
// =============================================================================

import type { CrawlJob, CrawlResult } from './types';
import { crawlKEC } from './kec-crawler';
import { crawlElectropedia } from './iec60050-crawler';
import { crawlNews, crawlArxiv } from './news-crawler';

/** 1시간 (ms) */
const HOUR = 60 * 60 * 1000;
/** 1일 (ms) */
const DAY = 24 * HOUR;
/** 1주 (ms) */
const WEEK = 7 * DAY;
/** 1개월 (ms, ~30일) */
const MONTH = 30 * DAY;

/**
 * 크롤 스케줄 정의
 * - KEC: 월 1회 (법령 개정 주기)
 * - IEC 60050: 월 1회 (용어 업데이트 주기)
 * - News: 6시간 (뉴스 갱신 주기)
 * - arXiv: 주 1회 (논문 업데이트 주기)
 */
export const CRAWL_SCHEDULE: CrawlJob[] = [
  {
    id: 'kec-laws',
    source: 'law.go.kr (KEC/전기사업법/전기안전관리법)',
    crawler: 'crawlKEC',
    interval: MONTH,
    enabled: true,
  },
  {
    id: 'iec60050-terms',
    source: 'electropedia.org (IEC 60050)',
    crawler: 'crawlElectropedia',
    interval: MONTH,
    enabled: true,
  },
  {
    id: 'news-electrical',
    source: '전기신문 + 에너지경제',
    crawler: 'crawlNews',
    interval: 6 * HOUR,
    enabled: true,
  },
  {
    id: 'arxiv-papers',
    source: 'arXiv (electrical engineering)',
    crawler: 'crawlArxiv',
    interval: WEEK,
    enabled: true,
  },
];

// =============================================================================
// PART 2: Schedule State Management
// =============================================================================

/**
 * lastRun 기록 저장소 (서버 메모리 / 환경에 따라 KV 스토어로 교체 가능)
 * Vercel 환경에서는 KV 또는 Supabase에 저장하는 것이 좋음
 */
const lastRunStore: Map<string, string> = new Map();

/** 마지막 실행 시각 조회 */
export function getLastRun(jobId: string): string | undefined {
  return lastRunStore.get(jobId);
}

/** 마지막 실행 시각 기록 */
export function setLastRun(jobId: string, timestamp: string): void {
  lastRunStore.set(jobId, timestamp);
}

// =============================================================================
// PART 3: Schedule Logic
// =============================================================================

/**
 * 작업 실행 필요 여부 판단
 * - 한 번도 실행한 적 없으면 true
 * - 마지막 실행 후 interval 이상 경과하면 true
 */
export function shouldRun(job: CrawlJob): boolean {
  if (!job.enabled) return false;

  const lastRun = job.lastRun ?? getLastRun(job.id);
  if (!lastRun) return true;

  const elapsed = Date.now() - new Date(lastRun).getTime();
  return elapsed >= job.interval;
}

// =============================================================================
// PART 4: Crawler Dispatch
// =============================================================================

/** 크롤러 함수명 → 실제 함수 매핑 */
type CrawlerFn = () => Promise<{ length: number }>;

const CRAWLER_MAP: Record<string, CrawlerFn> = {
  crawlKEC: async () => {
    const docs = await crawlKEC();
    return docs;
  },
  crawlElectropedia: async () => {
    const terms = await crawlElectropedia(undefined, 100);
    return terms;
  },
  crawlNews: async () => {
    const news = await crawlNews();
    return news;
  },
  crawlArxiv: async () => {
    const papers = await crawlArxiv();
    return papers;
  },
};

// =============================================================================
// PART 5: Public API — 대기 작업 실행
// =============================================================================

/**
 * 실행이 필요한 모든 크롤링 작업을 실행
 * @returns 각 작업의 실행 결과 배열
 */
export async function runDueJobs(): Promise<CrawlResult[]> {
  const results: CrawlResult[] = [];

  log.info('crawl-sched', '[Scheduler] === 스케줄러 실행 시작 ===');

  for (const job of CRAWL_SCHEDULE) {
    if (!shouldRun(job)) {
      log.info('crawl-sched', `[Scheduler] ${job.id}: 실행 불필요 (skip)`);
      continue;
    }

    const start = Date.now();
    const now = new Date().toISOString();

    log.info('crawl-sched', `[Scheduler] ${job.id}: 실행 시작`);

    try {
      const crawlerFn = CRAWLER_MAP[job.crawler];
      if (!crawlerFn) {
        throw new Error(`Unknown crawler: ${job.crawler}`);
      }

      const data = await crawlerFn();
      const duration = Date.now() - start;

      // lastRun 기록
      setLastRun(job.id, now);
      job.lastRun = now;

      results.push({
        jobId: job.id,
        success: true,
        documentsCount: data.length,
        duration,
        timestamp: now,
      });

      log.info('crawl', 
        `[Scheduler] ${job.id}: 완료 (${data.length}건, ${duration}ms)`,
      );
    } catch (error) {
      const duration = Date.now() - start;
      const errorMsg = error instanceof Error ? error.message : String(error);

      results.push({
        jobId: job.id,
        success: false,
        documentsCount: 0,
        duration,
        error: errorMsg,
        timestamp: now,
      });

      log.error('crawl-sched', `[Scheduler] ${job.id}: 실패 — ${errorMsg}`);
    }
  }

  log.info('crawl', 
    `[Scheduler] === 스케줄러 완료: ${results.length}개 작업 실행 ===`,
  );
  return results;
}
