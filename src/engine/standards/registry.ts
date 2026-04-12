/**
 * Multi-Country Standard Registry
 *
 * 국가별 전기설비 기준서를 통합 관리하는 레지스트리.
 * 현재 KEC(한국) 지원. NEC(미국), IEC(국제), JIS(일본)로 확장 가능한 구조.
 *
 * 사용법:
 *   getCodeArticle('KR', 'KEC', '232.52')  → CodeArticle | null
 *   evaluateStandard('KR', 'KEC-232.52-MAIN', params) → JudgmentResult
 */

import {
  CodeArticle,
  JudgmentResult,
  makeHold,
  makePass,
  makeFail,
  evaluateCondition,
} from './kec/types';

import {
  KEC_ARTICLES,
  evaluateKEC,
  getKECArticle,
} from './kec';

// Re-export modules
export * from './kec';
export * from './kec/types';
import { NEC_ARTICLES_FULL, getNECArticleFull } from './nec/nec-articles';
import { IEC_ARTICLES, getIECArticle } from './iec/iec-articles';
import { JIS_ARTICLES, getJISArticle } from './jis/jis-articles';
export { NEC_ARTICLES_FULL, getNECArticleFull } from './nec/nec-articles';
export { IEC_ARTICLES, getIECArticle } from './iec/iec-articles';
export { JIS_ARTICLES, getJISArticle } from './jis/jis-articles';

// ---------------------------------------------------------------------------
// PART 1 — 지원 국가/기준서 타입
// ---------------------------------------------------------------------------

/** 지원 국가 코드 */
export type CountryCode = 'KR' | 'US' | 'INT' | 'JP';

/** 지원 기준서명 */
export type StandardName = 'KEC' | 'NEC' | 'IEC' | 'JIS';

/** 국가-기준서 매핑 */
const COUNTRY_STANDARDS: Record<CountryCode, StandardName[]> = {
  KR:  ['KEC'],
  US:  ['NEC'],
  INT: ['IEC'],
  JP:  ['JIS'],
};

// ---------------------------------------------------------------------------
// PART 2 — 레지스트리 인터페이스
// ---------------------------------------------------------------------------

/**
 * 국가, 기준서, 조항 번호로 CodeArticle을 조회한다.
 *
 * @param country - 국가 코드 (예: 'KR')
 * @param standard - 기준서명 (예: 'KEC')
 * @param article - 조항 번호 (예: '232.52')
 * @returns CodeArticle | null — 조항을 찾지 못하면 null
 */
export function getCodeArticle(
  country: string,
  standard: string,
  article: string,
): CodeArticle | null {
  // KEC 처리
  if (standard === 'KEC' || country === 'KR') {
    // KEC_ARTICLES에서 article 번호가 일치하는 것을 찾는다
    for (const [, codeArticle] of KEC_ARTICLES) {
      if (codeArticle.article === article) {
        return codeArticle;
      }
    }
    // articleId 직접 조회 시도
    return getKECArticle(article) ?? getKECArticle(`KEC-${article}`) ?? null;
  }

  // NEC 처리 (19조)
  if (standard === 'NEC' || country === 'US') {
    return getNECArticleFull(article);
  }

  // IEC 처리 (10조)
  if (standard === 'IEC' || standard === 'IEC 60364' || country === 'INT') {
    return getIECArticle(article);
  }

  // JIS 처리
  if (standard === 'JIS' || standard === 'JIS C 0364' || country === 'JP') {
    return getJISArticle(article);
  }

  // 기타
  return null;
}

/**
 * 국가 기준서의 조항을 평가한다.
 *
 * @param country - 국가 코드
 * @param articleId - 조항 식별자 (예: "KEC-232.52-MAIN")
 * @param params - 평가 파라미터
 * @returns JudgmentResult
 */
export function evaluateStandard(
  country: string,
  articleId: string,
  params: Record<string, number>,
): JudgmentResult {
  // KEC 라우팅
  if (country === 'KR' || articleId.startsWith('KEC')) {
    return evaluateKEC(articleId, params);
  }

  // IEC 라우팅
  if (country === 'INT' || articleId.startsWith('IEC')) {
    const iecArticle = getIECArticle(articleId.replace('IEC-', ''));
    if (iecArticle) {
      const matched = iecArticle.conditions.filter(c => {
        const val = params[c.param];
        if (val === undefined) return false;
        return evaluateCondition(c, val);
      });
      const failed = iecArticle.conditions.filter(c => !matched.includes(c) && params[c.param] !== undefined);
      if (failed.length > 0) return makeFail(iecArticle, matched, failed);
      if (matched.length === iecArticle.conditions.length) return makePass(iecArticle, matched);
      return makeHold(iecArticle, iecArticle.conditions.filter(c => params[c.param] === undefined).map(c => c.param));
    }
  }

  // NEC 라우팅
  if (country === 'US' || articleId.startsWith('NEC')) {
    const necArticle = getNECArticleFull(articleId.replace('NEC-', ''));
    if (necArticle) {
      const matched = necArticle.conditions.filter(c => {
        const val = params[c.param];
        if (val === undefined) return false;
        return evaluateCondition(c, val);
      });
      const failed = necArticle.conditions.filter(c => !matched.includes(c) && params[c.param] !== undefined);
      if (failed.length > 0) return makeFail(necArticle, matched, failed);
      if (matched.length === necArticle.conditions.length) return makePass(necArticle, matched);
      return makeHold(necArticle, necArticle.conditions.filter(c => params[c.param] === undefined).map(c => c.param));
    }
  }

  // JIS 라우팅
  if (country === 'JP' || articleId.startsWith('JIS')) {
    const jisArticle = getJISArticle(articleId.replace('JIS-', ''));
    if (jisArticle) {
      const matched = jisArticle.conditions.filter(c => {
        const val = params[c.param];
        if (val === undefined) return false;
        return evaluateCondition(c, val);
      });
      const failed = jisArticle.conditions.filter(c => !matched.includes(c) && params[c.param] !== undefined);
      if (failed.length > 0) return makeFail(jisArticle, matched, failed);
      if (matched.length === jisArticle.conditions.length) return makePass(jisArticle, matched);
      return makeHold(jisArticle, jisArticle.conditions.filter(c => params[c.param] === undefined).map(c => c.param));
    }
  }

  // 미지원 기준서 → HOLD
  const placeholder: CodeArticle = {
    id: articleId,
    country,
    standard: 'UNKNOWN',
    article: articleId,
    title: `미지원 기준서 조항: ${articleId}`,
    conditions: [],
    effectiveDate: '',
    version: '',
  };

  return makeHold(placeholder, [`기준서 미지원: ${country}/${articleId}`]);
}

/**
 * 특정 국가에서 지원하는 기준서 목록을 반환한다.
 */
export function getSupportedStandards(country: CountryCode): StandardName[] {
  return COUNTRY_STANDARDS[country] ?? [];
}

/**
 * 현재 레지스트리에 등록된 모든 조항 수를 반환한다.
 */
export function getRegisteredArticleCount(): number {
  return KEC_ARTICLES.size + NEC_ARTICLES_FULL.size + IEC_ARTICLES.size + JIS_ARTICLES.size;
}

// NEC 조항은 src/engine/standards/nec/nec-articles.ts에서 통합 관리 (19조)
// 이전 3-article NEC_ARTICLES Map은 NEC_ARTICLES_FULL로 대체되어 삭제됨.
