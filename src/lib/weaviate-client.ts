/**
 * Weaviate Vector Search Client
 * ------------------------------
 * RAG 벡터 검색 실제 연동. Weaviate Cloud / Self-hosted 지원.
 *
 * 연결 방식:
 * 1. WEAVIATE_URL 환경변수 설정 시 → Weaviate 인스턴스 직접 연결
 * 2. 미설정 시 → 로컬 임베딩 + 코사인 유사도 폴백 (개발용)
 *
 * PART 1: Client initialization
 * PART 2: Semantic search
 * PART 3: Fallback local search
 * PART 4: Indexing
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Client Initialization
// ═══════════════════════════════════════════════════════════════════════════════

export interface WeaviateConfig {
  url?: string;             // WEAVIATE_URL or null for local fallback
  apiKey?: string;          // Weaviate API key (cloud)
  embeddingProvider?: 'openai' | 'google';
  embeddingApiKey?: string;
  className?: string;       // Default: 'ESVADocument'
}

interface SearchResult {
  id: string;
  title: string;
  content: string;
  standard?: string;
  clause?: string;
  score: number;            // 0~1 cosine similarity
  metadata?: Record<string, unknown>;
}

function getConfig(): WeaviateConfig {
  return {
    url: process.env.WEAVIATE_URL ?? undefined,
    apiKey: process.env.WEAVIATE_API_KEY ?? undefined,
    embeddingProvider: (process.env.EMBEDDING_PROVIDER as 'openai' | 'google') ?? 'openai',
    embeddingApiKey: process.env.OPENAI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? undefined,
    className: 'ESVADocument',
  };
}

function isWeaviateAvailable(): boolean {
  return !!getConfig().url;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Semantic Search (Weaviate)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Weaviate nearText 검색.
 * GraphQL API 사용.
 */
async function searchWeaviate(
  query: string,
  limit: number = 5,
  filters?: { standard?: string; country?: string },
): Promise<SearchResult[]> {
  const config = getConfig();
  if (!config.url) return [];

  const whereFilter = filters ? buildWhereFilter(filters) : '';

  // 안전한 파라미터 이스케이프 — GraphQL 인젝션 방지
  const safeQuery = query
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .slice(0, 500); // 최대 500자 제한

  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);

  const graphql = `{
    Get {
      ${config.className}(
        nearText: { concepts: ["${safeQuery}"] }
        limit: ${safeLimit}
        ${whereFilter}
      ) {
        _additional { id distance certainty }
        title
        content
        standard
        clause
        country
        chunkIndex
      }
    }
  }`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const res = await fetch(`${config.url}/v1/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: graphql }),
    });

    if (!res.ok) {
      console.error(`[ESVA] Weaviate search error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results = data?.data?.Get?.[config.className!] ?? [];

    return results.map((r: Record<string, unknown>) => ({
      id: (r._additional as Record<string, string>)?.id ?? '',
      title: r.title as string ?? '',
      content: r.content as string ?? '',
      standard: r.standard as string,
      clause: r.clause as string,
      score: (r._additional as Record<string, number>)?.certainty ?? 0,
      metadata: { country: r.country, chunkIndex: r.chunkIndex },
    }));
  } catch (err) {
    console.error('[ESVA] Weaviate search failed:', err);
    return [];
  }
}

function buildWhereFilter(filters: { standard?: string; country?: string }): string {
  const conditions: string[] = [];
  if (filters.standard) {
    conditions.push(`{ path: ["standard"], operator: Equal, valueText: "${filters.standard}" }`);
  }
  if (filters.country) {
    conditions.push(`{ path: ["country"], operator: Equal, valueText: "${filters.country}" }`);
  }
  if (conditions.length === 0) return '';
  if (conditions.length === 1) return `where: ${conditions[0]}`;
  return `where: { operator: And, operands: [${conditions.join(', ')}] }`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Fallback Local Search (TF-IDF 기반)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Weaviate 미연결 시 로컬 키워드 기반 검색.
 * KEC 조문 + 용어사전에서 키워드 매칭.
 */
async function searchLocal(
  query: string,
  limit: number = 5,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);

  try {
    // KEC 조문 검색
    const { KEC_ARTICLES } = await import('@/engine/standards/kec');
    for (const [id, article] of KEC_ARTICLES) {
      const text = `${article.title} ${article.conditions.map(c => c.note).join(' ')}`.toLowerCase();
      const matchCount = queryTerms.filter(t => text.includes(t)).length;
      if (matchCount > 0) {
        results.push({
          id,
          title: article.title,
          content: article.conditions.map(c => c.note).join('. '),
          standard: 'KEC',
          clause: article.article,
          score: matchCount / queryTerms.length,
        });
      }
    }

    // NEC 조문 검색
    const { NEC_ARTICLES_FULL } = await import('@/engine/standards/nec/nec-articles');
    for (const [id, article] of NEC_ARTICLES_FULL) {
      const text = `${article.title} ${article.conditions.map(c => c.note).join(' ')}`.toLowerCase();
      const matchCount = queryTerms.filter(t => text.includes(t)).length;
      if (matchCount > 0) {
        results.push({
          id,
          title: article.title,
          content: article.conditions.map(c => c.note).join('. '),
          standard: 'NEC',
          clause: article.article,
          score: matchCount / queryTerms.length,
        });
      }
    }

    // IEC 조문 검색
    const { IEC_ARTICLES } = await import('@/engine/standards/iec/iec-articles');
    for (const [id, article] of IEC_ARTICLES) {
      const text = `${article.title} ${article.conditions.map(c => c.note).join(' ')}`.toLowerCase();
      const matchCount = queryTerms.filter(t => text.includes(t)).length;
      if (matchCount > 0) {
        results.push({
          id,
          title: article.title,
          content: article.conditions.map(c => c.note).join('. '),
          standard: 'IEC',
          clause: article.article,
          score: matchCount / queryTerms.length,
        });
      }
    }
  } catch (err) {
    console.error('[ESVA] Local search error:', err);
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Indexing (문서 → Weaviate 저장)
// ═══════════════════════════════════════════════════════════════════════════════

export interface DocumentToIndex {
  title: string;
  content: string;
  standard: string;
  clause: string;
  country: string;
  chunkIndex?: number;
}

/**
 * 문서를 Weaviate에 인덱싱.
 * Weaviate 미연결 시 무시 (로컬 검색은 코드 내장 데이터 사용).
 */
export async function indexDocument(doc: DocumentToIndex): Promise<boolean> {
  const config = getConfig();
  if (!config.url) return false;

  try {
    const res = await fetch(`${config.url}/v1/objects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        class: config.className,
        properties: doc,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 통합 벡터 검색.
 * Weaviate 연결 시 → nearText 시맨틱 검색
 * 미연결 시 → 로컬 키워드 매칭 폴백
 */
export async function semanticSearch(
  query: string,
  options?: {
    limit?: number;
    standard?: string;
    country?: string;
  },
): Promise<SearchResult[]> {
  const limit = options?.limit ?? 5;

  if (isWeaviateAvailable()) {
    const weaviateResults = await searchWeaviate(query, limit, {
      standard: options?.standard,
      country: options?.country,
    });
    if (weaviateResults.length > 0) return weaviateResults;
  }

  // 폴백: 로컬 키워드 검색
  return searchLocal(query, limit);
}

/**
 * Weaviate 연결 상태 확인.
 */
export async function checkWeaviateHealth(): Promise<{
  connected: boolean;
  mode: 'weaviate' | 'local-fallback';
  url?: string;
}> {
  const config = getConfig();

  if (!config.url) {
    return { connected: false, mode: 'local-fallback' };
  }

  try {
    const res = await fetch(`${config.url}/v1/.well-known/ready`, {
      signal: AbortSignal.timeout(3000),
    });
    return {
      connected: res.ok,
      mode: res.ok ? 'weaviate' : 'local-fallback',
      url: config.url,
    };
  } catch {
    return { connected: false, mode: 'local-fallback', url: config.url };
  }
}
