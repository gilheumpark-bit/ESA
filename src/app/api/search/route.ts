/**
 * ESVA Search API — /api/search
 * ─────────────────────────────
 * POST: Main search endpoint.
 * Parses the query, routes through agent system,
 * ranks results with EngRank, returns structured SearchResult.
 *
 * PART 1: CSRF origin check
 * PART 2: Request validation
 * PART 3: Search execution pipeline
 * PART 4: Response builder
 */

import { NextRequest } from 'next/server';
import { logAudit } from '@/lib/audit-log';
import { getDefaultTenantId } from '@/lib/esa-config';
import { jsonWithEsa } from '@/lib/esa-http';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { checkPromptInjectionSafety } from '@/lib/safety-policies';
import { sanitizeInput } from '@/lib/security-hardening';
import { parseQuery } from '@search/query-parser';
import { rankResults } from '@search/eng-rank';
import { MainAgent } from '@agent/main';
import { CALCULATOR_REGISTRY } from '@engine/calculators';
import { searchRAG } from '@/lib/rag-pipeline';
import { searchKnowledgeGraph, getRelatedCalculators } from '@/lib/knowledge-graph';
import { STANDARD_REFS } from '@/data/standards/standard-refs';
import { ELECTRICAL_TERMS } from '@/data/iec-60050/electrical-terms';
import { getEquivalentStandards, type StandardCode } from '@/lib/standard-converter';
import { searchLocalData } from '@/lib/local-search';
import type { CountryCode } from '@agent/types';
import type {
  SearchResult,
  FeaturedCalculator,
  RankedResult,
  SearchDocument,
  KnowledgePanel,
  GlobalComparison,
} from '@search/types';

// ─── PART 1: CSRF Origin Check ─────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  'https://esva.engineer',
  'https://www.esva.engineer',
  'http://localhost:3000',
  'http://localhost:3001',
]);

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return true;
  return false;
}

// ─── PART 2: Request Body Schema ────────────────────────────────

interface SearchRequestBody {
  query: string;
  language?: 'ko' | 'en';
  countryCode?: CountryCode;
  page?: number;
  pageSize?: number;
}

// ─── PART 3: Agent Singleton ────────────────────────────────────

const agent = new MainAgent();

// ─── PART 4: POST Handler ───────────────────────────────────────

export async function POST(request: NextRequest) {
  const start = performance.now();

  try {
    // CSRF origin check
    const origin = request.headers.get('origin');
    if (!isOriginAllowed(origin)) {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-3001', message: 'Invalid origin' } },
        { status: 403 },
      );
    }

    // Rate limit
    const ip = getClientIp(request.headers);
    const rl = checkRateLimit(ip, 'search');
    if (!rl.allowed) {
      return jsonWithEsa(
        {
          success: false,
          error: {
            code: 'ESVA-3002',
            message: 'Rate limit exceeded',
            retryAfter: rl.retryAfter,
          },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfter ?? 60) },
        },
      );
    }

    // Parse body
    const body: SearchRequestBody = await request.json();

    if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-3003', message: 'Missing or empty query' } },
        { status: 400 },
      );
    }

    if (body.query.length > 500) {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-3004', message: 'Query too long (max 500 chars)' } },
        { status: 400 },
      );
    }

    // 입력 정제: null bytes, 제어 문자, zero-width 제거
    body.query = sanitizeInput(body.query);

    const injection = checkPromptInjectionSafety(body.query);
    if (injection.blocked) {
      return jsonWithEsa(
        { success: false, error: { code: injection.code, message: injection.message } },
        { status: 403 },
      );
    }

    const language = body.language ?? 'ko';
    const countryCode = body.countryCode ?? 'KR';
    const page = Math.max(1, body.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, body.pageSize ?? 10));

    // Step 1: Parse the query with electrical NER
    const parsed = parseQuery(body.query);

    // Step 2: If intent is 'calculate', redirect to calculator suggestion
    if (parsed.intent === 'calculate' && parsed.suggestedCalculator) {
      const entry = CALCULATOR_REGISTRY.get(parsed.suggestedCalculator);
      const featured: FeaturedCalculator | undefined = entry
        ? {
            id: entry.id,
            name: entry.name,
            nameEn: entry.nameEn,
            category: entry.category,
            relevance: 1.0,
          }
        : undefined;

      const result: SearchResult = {
        documents: [],
        featuredCalculator: featured,
        relatedCalcs: [],
        query: parsed,
        totalCount: 0,
        latencyMs: Math.round(performance.now() - start),
      };

      return jsonWithEsa(
        { success: true, data: result },
        {
          status: 200,
          headers: {
            'X-RateLimit-Remaining': String(rl.remaining),
            'Cache-Control': 'private, max-age=60',
          },
        },
      );
    }

    // Step 3: Run agent system for search/standard_lookup/definition/compare
    // Wrapped in try/catch for graceful degradation when Weaviate/BYOK unavailable
    let agentResponse: Awaited<ReturnType<typeof agent.processQuery>> | null = null;
    try {
      agentResponse = await agent.processQuery({
        sessionId: crypto.randomUUID(),
        query: body.query,
        language,
        countryCode,
      });
    } catch (agentErr) {
      console.warn('[ESVA /api/search] Agent failed, falling back:', agentErr);
    }

    // Step 4: Build documents from agent sources; fall back to RAG, then local search
    let documents: SearchDocument[] = [];

    if (agentResponse && agentResponse.sources.length > 0) {
      documents = agentResponse.sources.map((source, idx) => ({
        id: `agent-${idx}`,
        title: `${source.standard} ${source.clause ?? ''}`.trim(),
        body: agentResponse!.answer,
        excerpt: agentResponse!.answer.slice(0, 200),
        updatedAt: new Date().toISOString(),
        standardsCited: [source],
        accessTier: 'open' as const,
        verification: 'auto_verified' as const,
        relatedCalculators: agentResponse!.calculatorSuggestion
          ? [agentResponse!.calculatorSuggestion.calculatorId]
          : [],
        tags: [],
        language,
      }));
    }

    // Step 4b: If agent returned no results (0 sources, error, or threw), try RAG
    if (documents.length === 0) {
      try {
        const ragResults = await searchRAG({
          query: body.query,
          country: countryCode,
          limit: pageSize,
        });
        documents = ragResults.map((r, idx) => ({
          id: `rag-${idx}`,
          title: r.title,
          body: r.snippet,
          excerpt: r.snippet.slice(0, 200),
          url: r.url,
          updatedAt: r.publishedAt ?? new Date().toISOString(),
          standardsCited: r.standard
            ? [{ standard: r.standard, clause: r.clause ?? '', source: r.source }]
            : [],
          accessTier: r.licenseType === 'open' ? 'open' as const : r.licenseType === 'summary_only' ? 'summary_only' as const : 'link_only' as const,
          verification: 'auto_verified' as const,
          relatedCalculators: [],
          tags: [],
          language,
        }));
      } catch (ragErr) {
        console.warn('[ESVA /api/search] RAG fallback failed:', ragErr);
      }
    }

    // Step 4c: If RAG also returned nothing, fall back to local data search
    if (documents.length === 0) {
      const localResults = searchLocalData(body.query, language);
      documents = localResults.map((lr, idx) => ({
        id: `local-${idx}`,
        title: lr.title,
        body: lr.description,
        excerpt: lr.description.slice(0, 200),
        url: lr.url,
        updatedAt: new Date().toISOString(),
        standardsCited: lr.standardRef
          ? [{ standard: lr.standardRef, clause: '', source: 'local' }]
          : [],
        accessTier: 'open' as const,
        verification: 'auto_verified' as const,
        relatedCalculators: lr.calcId ? [lr.calcId] : [],
        tags: [lr.type],
        language,
      }));
    }

    // Step 5: Apply EngRank scoring
    const ranked: RankedResult[] = rankResults(documents, parsed);

    // Step 6: Paginate
    const startIdx = (page - 1) * pageSize;
    const paginated = ranked.slice(startIdx, startIdx + pageSize);

    // Step 7: Build featured calculator
    let featuredCalculator: FeaturedCalculator | undefined;
    if (parsed.suggestedCalculator) {
      const entry = CALCULATOR_REGISTRY.get(parsed.suggestedCalculator);
      if (entry) {
        featuredCalculator = {
          id: entry.id,
          name: entry.name,
          nameEn: entry.nameEn,
          category: entry.category,
          relevance: 0.9,
        };
      }
    } else if (agentResponse?.calculatorSuggestion) {
      const entry = CALCULATOR_REGISTRY.get(agentResponse.calculatorSuggestion.calculatorId);
      if (entry) {
        featuredCalculator = {
          id: entry.id,
          name: entry.name,
          nameEn: entry.nameEn,
          category: entry.category,
          relevance: 0.7,
        };
      }
    }

    // Step 8: Build related calcs from documents + knowledge graph
    const relatedCalcIds = new Set<string>();
    for (const r of ranked) {
      for (const calcId of r.document.relatedCalculators) {
        if (calcId !== featuredCalculator?.id) {
          relatedCalcIds.add(calcId);
        }
      }
    }
    // Enrich related calcs from knowledge graph
    try {
      const kgNodes = searchKnowledgeGraph(body.query);
      for (const node of kgNodes) {
        if (node.type === 'concept') {
          const calcNodes = getRelatedCalculators(node.id);
          for (const cn of calcNodes) {
            if (cn.id !== featuredCalculator?.id) {
              relatedCalcIds.add(cn.id);
            }
          }
        }
      }
    } catch {
      // Knowledge graph enrichment is non-critical
    }
    const relatedCalcs: FeaturedCalculator[] = [];
    for (const calcId of relatedCalcIds) {
      const entry = CALCULATOR_REGISTRY.get(calcId);
      if (entry) {
        relatedCalcs.push({
          id: entry.id,
          name: entry.name,
          nameEn: entry.nameEn,
          category: entry.category,
          relevance: 0.5,
        });
      }
      if (relatedCalcs.length >= 5) break;
    }

    // Step 9: Build knowledge panel from KnowledgeGraph + ELECTRICAL_TERMS
    let knowledgePanel: KnowledgePanel | undefined;
    try {
      const kgNodes = searchKnowledgeGraph(body.query);
      if (kgNodes.length > 0) {
        const topNode = kgNodes[0];
        // Try to find a matching electrical term for richer data
        const matchedTerm = ELECTRICAL_TERMS.find(
          (t) =>
            t.ko === topNode.name_ko ||
            t.en.toLowerCase() === topNode.name_en.toLowerCase(),
        );
        // Find related standards from STANDARD_REFS
        const relatedStdRefs = STANDARD_REFS.filter(
          (r) =>
            r.title_ko.includes(topNode.name_ko) ||
            r.title_en.toLowerCase().includes(topNode.name_en.toLowerCase()),
        ).slice(0, 5);
        knowledgePanel = {
          term: topNode.name_ko,
          iecRef: matchedTerm?.iecRef,
          definitionKo: matchedTerm
            ? `${matchedTerm.ko} — ${matchedTerm.category} 분야 전기공학 용어`
            : `${topNode.name_ko} — 전기공학 관련 개념`,
          definitionEn: matchedTerm
            ? `${matchedTerm.en} — Electrical engineering term in ${matchedTerm.category}`
            : `${topNode.name_en} — Electrical engineering concept`,
          relatedTerms: matchedTerm?.synonyms ?? [],
          relatedStandards: relatedStdRefs.map((r) => ({
            standard: r.standard,
            clause: r.clause ?? '',
            source: r.body,
            url: r.url,
          })),
        };
      }
    } catch {
      // Knowledge panel population is non-critical
    }

    // Step 10: Build globalComparison when cross-country query detected
    let globalComparison: GlobalComparison | undefined;
    try {
      // 'compare' intent indicates a cross-country comparison query
      if (parsed.intent === 'compare') {
        // Try to find a standard clause from the search results
        const firstSource = agentResponse?.sources[0];
        if (firstSource?.standard && firstSource?.clause) {
          const stdCode = firstSource.standard.toUpperCase() as StandardCode;
          const equivalents = getEquivalentStandards(stdCode, firstSource.clause);
          if (equivalents.length > 0) {
            const items = [firstSource.standard, ...equivalents.map((e) => e.standard)];
            globalComparison = {
              items,
              dimensions: [
                {
                  name: '대응 조항',
                  values: Object.fromEntries([
                    [firstSource.standard, firstSource.clause],
                    ...equivalents.map((e) => [e.standard, e.clause]),
                  ]),
                },
                {
                  name: '신뢰도',
                  values: Object.fromEntries([
                    [firstSource.standard, '1.00'],
                    ...equivalents.map((e) => [e.standard, e.confidence.toFixed(2)]),
                  ]),
                },
              ],
              source: {
                standard: firstSource.standard,
                clause: firstSource.clause,
              },
            };
          }
        }
      }
    } catch {
      // Global comparison is non-critical
    }

    const result: SearchResult = {
      documents: paginated,
      featuredCalculator,
      knowledgePanel,
      relatedCalcs,
      globalComparison,
      query: parsed,
      totalCount: ranked.length,
      latencyMs: Math.round(performance.now() - start),
    };

    void logAudit({
      tenantId: getDefaultTenantId(),
      userId: 'anonymous',
      action: 'search.query',
      resource: body.query.slice(0, 256),
      details: {
        intent: parsed.intent,
        countryCode,
        latencyMs: result.latencyMs,
        docCount: paginated.length,
      },
      ip,
    }).catch(() => undefined);

    return jsonWithEsa(
      { success: true, data: result },
      {
        status: 200,
        headers: {
          'X-RateLimit-Remaining': String(rl.remaining),
          'Cache-Control': 'private, max-age=30',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ESVA /api/search] Error:', message);

    return jsonWithEsa(
      { success: false, error: { code: 'ESVA-3999', message: 'Internal search error' } },
      { status: 500 },
    );
  }
}
