/**
 * IEC 60050 Enhanced Embeddings
 *
 * Expands queries with IEC synonyms and electrical term context
 * for higher-quality vector search retrieval.
 *
 * PART 1: Types & Constants
 * PART 2: Query enhancer
 * PART 3: Term context lookup
 * PART 4: Embedding index builder
 * PART 5: Fuzzy matching (Levenshtein)
 */

import { ELECTRICAL_SYNONYMS } from '@/data/synonyms/electrical-synonyms';
import { ELECTRICAL_TERMS, type ElectricalTerm } from '@/data/iec-60050/electrical-terms';

// ---------------------------------------------------------------------------
// PART 1 — Types & Constants
// ---------------------------------------------------------------------------

export interface EmbeddingIndex {
  /** term id -> concatenated text for embedding */
  termTexts: Map<string, string>;
  /** reverse lookup: any synonym/name -> term ids */
  reverseMap: Map<string, string[]>;
  /** total terms indexed */
  size: number;
}

const MAX_LEVENSHTEIN_DISTANCE = 2;

// ---------------------------------------------------------------------------
// PART 2 — Query Enhancer
// ---------------------------------------------------------------------------

/**
 * Expand a user query with IEC synonyms and electrical terms.
 * Example: "MCCB 용량" -> "MCCB 배선용차단기 Molded Case Circuit Breaker 용량 정격전류"
 */
export function enhanceQueryForEmbedding(query: string): string {
  const tokens = query.split(/\s+/).filter(Boolean);
  const expanded: string[] = [...tokens];
  const seen = new Set(tokens.map((t) => t.toLowerCase()));

  for (const token of tokens) {
    const upper = token.toUpperCase();

    // 1) 약어 동의어 확장
    const synonyms = ELECTRICAL_SYNONYMS.get(upper);
    if (synonyms) {
      for (const syn of synonyms) {
        if (!seen.has(syn.toLowerCase())) {
          expanded.push(syn);
          seen.add(syn.toLowerCase());
        }
      }
    }

    // 2) IEC 60050 용어 매칭 (정확 + 퍼지)
    const matchedTerms = findMatchingTerms(token);
    for (const term of matchedTerms) {
      const candidates = [term.ko, term.en, ...term.synonyms];
      for (const c of candidates) {
        if (!seen.has(c.toLowerCase())) {
          expanded.push(c);
          seen.add(c.toLowerCase());
        }
      }
    }
  }

  // 3) 관련 계산기 키워드 추가
  const relatedCalcKeywords = getRelatedCalcKeywords(tokens);
  for (const kw of relatedCalcKeywords) {
    if (!seen.has(kw.toLowerCase())) {
      expanded.push(kw);
      seen.add(kw.toLowerCase());
    }
  }

  return expanded.join(' ');
}

function findMatchingTerms(token: string): ElectricalTerm[] {
  const lower = token.toLowerCase();
  const results: ElectricalTerm[] = [];

  for (const term of ELECTRICAL_TERMS) {
    // 정확 매칭
    if (
      term.ko.toLowerCase() === lower ||
      term.en.toLowerCase() === lower ||
      term.synonyms.some((s) => s.toLowerCase() === lower)
    ) {
      results.push(term);
      continue;
    }

    // 퍼지 매칭 (영문 3자 이상)
    if (token.length >= 3 && /^[a-zA-Z]+$/.test(token)) {
      if (
        levenshtein(lower, term.en.toLowerCase()) <= MAX_LEVENSHTEIN_DISTANCE ||
        term.synonyms.some((s) => levenshtein(lower, s.toLowerCase()) <= MAX_LEVENSHTEIN_DISTANCE)
      ) {
        results.push(term);
      }
    }
  }

  return results;
}

/** 관련 계산기에서 핵심 키워드 추출 */
function getRelatedCalcKeywords(tokens: string[]): string[] {
  const keywords: string[] = [];
  const query = tokens.join(' ').toLowerCase();

  const CALC_KEYWORD_MAP: Record<string, string[]> = {
    '용량': ['정격전류', 'rated current', 'kVA'],
    '전압강하': ['voltage drop', 'cable length', '케이블 길이'],
    '단락': ['short circuit', 'fault current', '차단용량'],
    '접지': ['ground resistance', 'soil resistivity', '대지저항률'],
    '역률': ['power factor', 'cosφ', '무효전력'],
    '조도': ['illuminance', 'lux', '광속법'],
    '태양광': ['solar generation', 'peak sun hours', '일사량'],
    '변압기': ['transformer', 'kVA', '부하율'],
  };

  for (const [key, values] of Object.entries(CALC_KEYWORD_MAP)) {
    if (query.includes(key)) {
      keywords.push(...values);
    }
  }

  return keywords;
}

// ---------------------------------------------------------------------------
// PART 3 — Term Context Lookup
// ---------------------------------------------------------------------------

/**
 * Get surrounding context for a term from the IEC dictionary.
 * Returns a rich text description combining all languages and related info.
 */
export function getTermContext(term: string): string {
  const lower = term.toLowerCase();

  for (const t of ELECTRICAL_TERMS) {
    const match =
      t.ko.toLowerCase() === lower ||
      t.en.toLowerCase() === lower ||
      t.synonyms.some((s) => s.toLowerCase() === lower);

    if (match) {
      const parts: string[] = [
        `[${t.id}] ${t.ko} / ${t.en}`,
      ];
      if (t.ja) parts.push(`ja: ${t.ja}`);
      if (t.zh) parts.push(`zh: ${t.zh}`);
      if (t.synonyms.length > 0) parts.push(`synonyms: ${t.synonyms.join(', ')}`);
      if (t.iecRef) parts.push(`IEC 60050: ${t.iecRef}`);
      if (t.relatedCalc) parts.push(`related calc: ${t.relatedCalc}`);
      parts.push(`category: ${t.category}`);
      return parts.join(' | ');
    }
  }

  // 약어 사전에서 찾기
  const synMatch = ELECTRICAL_SYNONYMS.get(term.toUpperCase());
  if (synMatch) {
    return `${term.toUpperCase()}: ${synMatch.join(', ')}`;
  }

  return '';
}

// ---------------------------------------------------------------------------
// PART 4 — Embedding Index Builder
// ---------------------------------------------------------------------------

/**
 * Pre-compute a text index for fast term lookup in embedding pipelines.
 */
export function buildEmbeddingIndex(terms: ElectricalTerm[]): EmbeddingIndex {
  const termTexts = new Map<string, string>();
  const reverseMap = new Map<string, string[]>();

  for (const term of terms) {
    // 임베딩용 텍스트: 모든 언어 + 동의어를 결합
    const textParts = [term.ko, term.en];
    if (term.ja) textParts.push(term.ja);
    if (term.zh) textParts.push(term.zh);
    textParts.push(...term.synonyms);
    if (term.iecRef) textParts.push(`IEC ${term.iecRef}`);

    termTexts.set(term.id, textParts.join(' '));

    // 역색인: 각 이름/동의어 -> term id 매핑
    const lookupKeys = [
      term.ko.toLowerCase(),
      term.en.toLowerCase(),
      ...term.synonyms.map((s) => s.toLowerCase()),
    ];
    for (const key of lookupKeys) {
      const existing = reverseMap.get(key) ?? [];
      existing.push(term.id);
      reverseMap.set(key, existing);
    }
  }

  return {
    termTexts,
    reverseMap,
    size: terms.length,
  };
}

// ---------------------------------------------------------------------------
// PART 5 — Fuzzy Matching (Levenshtein)
// ---------------------------------------------------------------------------

/**
 * Levenshtein distance between two strings.
 * Used for typo tolerance (distance <= 2).
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // 빠른 탈출 조건
  if (m === 0) return n;
  if (n === 0) return m;
  if (Math.abs(m - n) > MAX_LEVENSHTEIN_DISTANCE) return MAX_LEVENSHTEIN_DISTANCE + 1;

  // DP with two rows (메모리 최적화)
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}
