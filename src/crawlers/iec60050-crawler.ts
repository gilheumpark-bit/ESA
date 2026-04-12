// =============================================================================
// IEC 60050 Electropedia — 링크 참조 전용
// electropedia.org 콘텐츠 크롤링 금지 (저작권 보호)
// 용어 ID → electropedia.org 링크만 생성
// =============================================================================

import {
  ElectricalTermCrawled,
} from './types';
import { log } from '@/lib/logger';

/** Electropedia base URL */
const ELECTROPEDIA_BASE = 'https://www.electropedia.org';

/** 전기공학 관련 IEC 60050 섹션 목록 */
const DEFAULT_SECTIONS = [826, 195, 441, 442, 461, 466, 601, 602, 604, 614];

// =============================================================================
// PART 1: 링크 전용 — 콘텐츠 크롤링 없음
// =============================================================================

/**
 * IEC 60050 용어 링크 생성 (크롤링 아님).
 * electropedia.org 콘텐츠는 IEC 저작물이므로 직접 크롤링하지 않습니다.
 * 대신 용어 ID + electropedia.org 링크를 생성하여 사용자가 원문을 직접 확인하도록 안내합니다.
 *
 * 자체 데이터: src/data/iec-60050/electrical-terms.ts에서 자체 작성한 한국어 설명 사용.
 * IEC 원문: electropedia.org 링크로 안내.
 *
 * @param sections - 섹션 번호 목록 (기본: DEFAULT_SECTIONS)
 * @returns IEC 60050 용어 링크 배열
 */
export async function crawlElectropedia(
  _startSection?: number,
  _limit = 500,
): Promise<ElectricalTermCrawled[]> {
  // 저작권 보호: electropedia.org HTML 크롤링 하지 않음.
  // 자체 데이터(electrical-terms.ts)의 IEC 참조번호에 대해 링크만 생성.
  const results: ElectricalTermCrawled[] = [];

  try {
    const { ELECTRICAL_TERMS } = await import('@/data/iec-60050/electrical-terms');

    for (const term of ELECTRICAL_TERMS) {
      if (!term.iecRef) continue;

      // IEC 참조번호에서 용어 ID 추출 (예: "IEC 60050-826-14-01" → "826-14-01")
      const idMatch = term.iecRef.match(/(\d{3}-\d{2}-\d{2})/);
      const termId = idMatch ? idMatch[1] : null;

      results.push({
        id: term.id,
        ko: term.ko,
        en: term.en,
        ja: term.ja,
        zh: term.zh,
        // 정의: 자체 작성 (IEC 원문 아님)
        definition: `[자체 작성] ${term.ko} — 원문은 Electropedia에서 확인`,
        synonyms: term.synonyms ?? [],
        category: term.category ?? 'general',
        iecRef: term.iecRef,
        // electropedia.org 링크 (사용자가 직접 원문 확인)
        sourceUrl: termId
          ? `${ELECTROPEDIA_BASE}/iev/iev.nsf/display?openform&ievref=${termId}`
          : undefined,
        relatedTerms: undefined,
      });
    }
  } catch {
    // electrical-terms.ts 로드 실패 시 빈 배열
  }

  log.info('crawl', `[IEC60050] ${results.length}개 용어 링크 생성 (크롤링 없음, 링크 참조만)`);
  return results;
}

/**
 * IEC 60050 용어 → electropedia.org 원문 링크 생성.
 * UI에서 "원문 보기" 버튼에 사용.
 */
export function getElectropediaLink(iecRef: string): string | null {
  const idMatch = iecRef.match(/(\d{3}-\d{2}-\d{2})/);
  if (!idMatch) return null;
  return `${ELECTROPEDIA_BASE}/iev/iev.nsf/display?openform&ievref=${idMatch[1]}`;
}
