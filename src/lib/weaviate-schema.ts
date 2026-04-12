/**
 * Weaviate Schema — ESVA Document Collection
 * --------------------------------------------
 * 스키마 초기화 및 검증.
 * `npm run weaviate:init` 또는 앱 시작 시 자동 실행.
 *
 * PART 1: Schema definition
 * PART 2: Initialization
 */

import { createLogger } from './logger';
const logger = createLogger('weaviate');

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Schema Definition
// ═══════════════════════════════════════════════════════════════════════════════

const ESVA_SCHEMA = {
  class: 'ESVADocument',
  description: 'ESVA 전기 기준서/법규/기술 문서 벡터 저장소',
  vectorizer: 'text2vec-openai',
  moduleConfig: {
    'text2vec-openai': {
      model: 'text-embedding-3-small',
      dimensions: 1536,
    },
  },
  properties: [
    { name: 'title', dataType: ['text'], description: '문서 제목' },
    { name: 'content', dataType: ['text'], description: '본문 (청크)' },
    { name: 'standard', dataType: ['text'], description: '기준서명 (KEC, NEC, IEC)' },
    { name: 'clause', dataType: ['text'], description: '조항 번호' },
    { name: 'country', dataType: ['text'], description: '국가 코드 (KR, US, INT)' },
    { name: 'chunkIndex', dataType: ['int'], description: '청크 순번' },
    { name: 'source', dataType: ['text'], description: '출처 URL or 법전명' },
    { name: 'edition', dataType: ['text'], description: '판 (2021, 2023 등)' },
    { name: 'category', dataType: ['text'], description: '분류 (protection, wiring, grounding, motor 등)' },
    { name: 'language', dataType: ['text'], description: '언어 (ko, en, ja)' },
    { name: 'createdAt', dataType: ['date'], description: '인덱싱 시각' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Initialization
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Weaviate 스키마 초기화.
 * 이미 존재하면 스킵. 없으면 생성.
 */
export async function initWeaviateSchema(): Promise<boolean> {
  const url = process.env.WEAVIATE_URL;
  if (!url) {
    logger.warn('WEAVIATE_URL not set — skipping schema init');
    return false;
  }

  try {
    // 클래스 존재 확인
    const checkRes = await fetch(`${url}/v1/schema/${ESVA_SCHEMA.class}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (checkRes.ok) {
      logger.info('Weaviate schema already exists', { class: ESVA_SCHEMA.class });
      return true;
    }

    // 클래스 생성
    const createRes = await fetch(`${url}/v1/schema`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ESVA_SCHEMA),
    });

    if (createRes.ok) {
      logger.info('Weaviate schema created', { class: ESVA_SCHEMA.class });
      return true;
    }

    const errText = await createRes.text();
    logger.error('Weaviate schema creation failed', { status: createRes.status, error: errText });
    return false;
  } catch (err) {
    logger.error('Weaviate connection failed', { url, error: String(err) });
    return false;
  }
}

/**
 * Weaviate에 현재 인덱싱된 문서 수 조회.
 */
export async function getDocumentCount(): Promise<number> {
  const url = process.env.WEAVIATE_URL;
  if (!url) return 0;

  try {
    const res = await fetch(`${url}/v1/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{ Aggregate { ESVADocument { meta { count } } } }`,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return 0;
    const data = await res.json();
    return data?.data?.Aggregate?.ESVADocument?.[0]?.meta?.count ?? 0;
  } catch {
    return 0;
  }
}

export { ESVA_SCHEMA };
