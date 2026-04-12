/**
 * ESVA Main Agent — Text Query Router
 * ─────────────────────────────────────
 * @deprecated 텍스트 전용 라우터. 도면 분석은 orchestrator.ts 사용.
 *
 * Tier 1: Stateless text query router.
 * Receives text queries, routes to the appropriate sandbox(es),
 * and aggregates results into a coherent response.
 *
 * PART 1: Query analysis (keyword extraction, language detection)
 * PART 2: Routing logic (single / cross / direct_calc)
 * PART 3: Execution orchestration
 * PART 4: Response aggregation
 */

import type {
  AgentRequest,
  AgentResponse,
  AgentContext,
  ParsedQuery,
  RoutingDecision,
  SandboxId,
  SandboxResult,
  CountryCode,
  Genre,
  ResponseTiming,
} from '@agent/types';
import type { Lang } from '@/lib/i18n';
import { getSandbox } from './sandbox/sandbox-registry';
import { createSandboxAgent } from './sandbox/sandbox-agent';
import { createBridgeAgent } from './bridge';
import { ariManager, routeToHealthiest } from '@/lib/ari-engine';

// ─── Keyword Dictionaries ───────────────────────────────────────

const ELECTRICAL_KEYWORDS_KO = [
  '전압', '전류', '저항', '전력', '케이블', '차단기', '접지', '변압기',
  '배선', '간선', '분기', '누전', '과전류', '단락', '아크', '절연',
  '전선', '콘덴서', '역률', '부하', '수전', '배전', '송전', '전기설비',
  '전압강하', '허용전류', '전선관', '케이블트레이', '분전반', '수배전반',
];

const ELECTRICAL_KEYWORDS_EN = [
  'voltage', 'current', 'resistance', 'power', 'cable', 'breaker', 'grounding',
  'transformer', 'wiring', 'feeder', 'branch', 'leakage', 'overcurrent',
  'short circuit', 'arc', 'insulation', 'conductor', 'capacitor',
  'power factor', 'load', 'switchgear', 'panel', 'voltage drop',
  'ampacity', 'conduit', 'cable tray', 'bus duct',
];

const COMPARISON_KEYWORDS = [
  '비교', '차이', 'compare', 'comparison', 'difference', 'versus', 'vs',
  '대비', '대조', '비교분석',
];

const CALC_KEYWORDS_KO = [
  '계산', '산출', '구하', '얼마', '몇', '산정',
];

const CALC_KEYWORDS_EN = [
  'calculate', 'compute', 'how much', 'what is', 'find the', 'determine',
];

const AI_KEYWORDS = [
  'ai', 'ml', 'machine learning', 'deep learning', 'neural',
  'predictive', 'smart grid', 'digital twin', 'iot',
  '인공지능', '머신러닝', '딥러닝', '스마트그리드', '디지털트윈',
];

const CERTIFICATION_KEYWORDS = [
  '기사', '자격증', '시험', '기출', 'exam', 'certification', 'license',
  '전기기사', '전기공사기사', '전기산업기사', '기능사',
  'PE exam', 'journeyman', 'master electrician',
  '電気主任', '電気工事士',
];

const COUNTRY_PATTERNS: Record<CountryCode, RegExp[]> = {
  KR: [/한국/i, /korea/i, /\bKR\b/, /KEC/i, /KEPIC/i, /전기설비규정/],
  US: [/미국/i, /america/i, /\bUS\b/, /\bUSA\b/, /NEC/i, /NFPA/i],
  JP: [/일본/i, /japan/i, /\bJP\b/, /JEAC/i, /JIS/i, /電気設備/],
  CN: [/중국/i, /china/i, /\bCN\b/, /\bGB\b/i, /DL\/T/i],
  DE: [/독일/i, /german/i, /\bDE\b/, /VDE/i, /DIN/i, /유럽|europe/i],
  AU: [/호주/i, /australia/i, /\bAU\b/, /AS\/NZS/i, /뉴질랜드|new zealand/i],
  ME: [/중동/i, /middle east/i, /\bME\b/, /DEWA/i, /사우디|saudi/i, /UAE/i],
};

const CALCULATOR_PATTERNS: Record<string, RegExp[]> = {
  'voltage-drop':       [/전압강하/i, /voltage\s*drop/i],
  'cable-sizing':       [/케이블\s*선정/i, /전선\s*굵기/i, /cable\s*siz/i, /conductor\s*siz/i],
  'single-phase-power': [/단상\s*전력/i, /single.phase\s*power/i],
  'three-phase-power':  [/3상\s*전력/i, /삼상\s*전력/i, /three.phase\s*power/i],
  'breaker-sizing':     [/차단기\s*선정/i, /차단기\s*용량/i, /breaker\s*siz/i],
  'transformer-capacity': [/변압기\s*용량/i, /transformer\s*capacity/i, /트랜스\s*용량/i],
  'short-circuit':      [/단락\s*전류/i, /short.circuit/i],
  'ground-resistance':  [/접지\s*저항/i, /ground\s*resistance/i],
  'solar-generation':   [/태양광\s*발전/i, /solar\s*gen/i, /PV\s*gen/i],
  'battery-capacity':   [/배터리\s*용량/i, /battery\s*capacity/i, /ESS\s*용량/i],
};

// ─── PART 1: MainAgent Class ────────────────────────────────────

export class MainAgent {

  /**
   * Process a user query end-to-end.
   * Stateless: no conversation memory is retained between calls.
   */
  async processQuery(request: AgentRequest): Promise<AgentResponse> {
    const totalStart = performance.now();

    try {
      // Step 1: Analyze the query
      const parsed = this.analyzeQuery(request.query, request.language);

      // Step 2: Route to sandbox(es)
      const routingStart = performance.now();
      const routing = this.routeQuery(parsed, request.countryCode);
      const routingMs = Math.round(performance.now() - routingStart);

      // Step 2.5: ARI-based sandbox priority (건강한 샌드박스 우선)
      if (routing.targetSandboxes.length > 1) {
        const best = routeToHealthiest('query', routing.targetSandboxes) as SandboxId;
        routing.targetSandboxes = [
          best,
          ...routing.targetSandboxes.filter(s => s !== best),
        ];
      }

      // Step 3: Execute
      let response: AgentResponse;

      if (routing.bridgeNeeded) {
        response = await this.executeBridge(routing, parsed, request.context);
      } else {
        response = await this.executeSingle(routing, parsed, request.context);
      }

      // Step 4: Finalize timing
      response.timing.total = Math.round(performance.now() - totalStart);
      response.timing.routingMs = routingMs;

      return response;

    } catch (err) {
      // Fallback: return error response
      const totalTime = Math.round(performance.now() - totalStart);
      return this.buildErrorResponse(err, totalTime, request.language);
    }
  }

  // ─── PART 1: Query Analysis ─────────────────────────────────

  /**
   * Parse a natural language query into structured data.
   * Extracts countries, genres, keywords, and intent signals.
   */
  private analyzeQuery(query: string, language: Lang): ParsedQuery {
    const normalized = query.toLowerCase().trim();

    const countries = this.detectCountries(normalized);
    const genres = this.detectGenres(normalized);
    const isComparison = this.detectComparison(normalized);
    const isCalculation = this.detectCalculation(normalized);
    const calculatorId = this.detectCalculatorId(normalized);
    const keywords = this.extractKeywords(normalized);

    // Confidence: higher if we detected clear signals
    let parseConfidence = 0.5;
    if (countries.length > 0) parseConfidence += 0.2;
    if (genres.length > 0) parseConfidence += 0.15;
    if (calculatorId) parseConfidence += 0.15;
    parseConfidence = Math.min(parseConfidence, 1.0);

    return {
      raw: query,
      normalized,
      language,
      countries,
      genres,
      isComparison,
      isCalculation,
      calculatorId,
      keywords,
      parseConfidence,
    };
  }

  private detectCountries(normalized: string): CountryCode[] {
    const found: CountryCode[] = [];
    for (const [code, patterns] of Object.entries(COUNTRY_PATTERNS)) {
      if (patterns.some(p => p.test(normalized))) {
        found.push(code as CountryCode);
      }
    }
    return found;
  }

  private detectGenres(normalized: string): Genre[] {
    const genres: Genre[] = [];

    const isElectrical =
      ELECTRICAL_KEYWORDS_KO.some(kw => normalized.includes(kw)) ||
      ELECTRICAL_KEYWORDS_EN.some(kw => normalized.includes(kw));
    if (isElectrical) genres.push('electrical');

    if (AI_KEYWORDS.some(kw => normalized.includes(kw))) {
      genres.push('ai');
    }

    if (CERTIFICATION_KEYWORDS.some(kw => normalized.includes(kw))) {
      genres.push('certification');
    }

    // 'standard' genre if user asks about regulations/standards specifically
    if (/규정|규격|표준|standard|regulation|code\b/i.test(normalized)) {
      genres.push('standard');
    }

    return genres;
  }

  private detectComparison(normalized: string): boolean {
    return COMPARISON_KEYWORDS.some(kw => normalized.includes(kw));
  }

  private detectCalculation(normalized: string): boolean {
    return (
      CALC_KEYWORDS_KO.some(kw => normalized.includes(kw)) ||
      CALC_KEYWORDS_EN.some(kw => normalized.includes(kw))
    );
  }

  private detectCalculatorId(normalized: string): string | undefined {
    for (const [id, patterns] of Object.entries(CALCULATOR_PATTERNS)) {
      if (patterns.some(p => p.test(normalized))) {
        return id;
      }
    }
    return undefined;
  }

  private extractKeywords(normalized: string): string[] {
    // Remove common stop words, keep meaningful tokens
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by',
      '은', '는', '이', '가', '을', '를', '의', '에', '에서', '로', '으로',
      '와', '과', '도', '만', '까지', '부터', '에게', '한테',
    ]);

    return normalized
      .split(/[\s,;.?!]+/)
      .filter(w => w.length > 1 && !stopWords.has(w));
  }

  // ─── PART 2: Routing Logic ──────────────────────────────────

  /**
   * Determine how to route a parsed query.
   *
   * Priority:
   * 1. Direct calculation → direct_calc (skip search)
   * 2. Multi-country comparison → cross (bridge needed)
   * 3. Single country + electrical → single sandbox
   * 4. AI-only query → global-ai sandbox
   * 5. Certification query → country-certification sandbox
   * 6. Fallback → global-standard or inferred default
   */
  private routeQuery(parsed: ParsedQuery, countryHint?: CountryCode): RoutingDecision {

    // Priority 1: Direct calculation request
    if (parsed.isCalculation && parsed.calculatorId) {
      const country = parsed.countries[0] ?? countryHint ?? 'KR';
      const sandboxId: SandboxId = `${country.toLowerCase() as Lowercase<CountryCode>}-electrical`;

      return {
        type: 'direct_calc',
        targetSandboxes: [sandboxId],
        bridgeNeeded: false,
        reason: `Direct calculation: ${parsed.calculatorId} in ${country} context`,
      };
    }

    // Priority 2: Cross-country comparison
    if (parsed.isComparison || parsed.countries.length > 1) {
      const countries = parsed.countries.length > 1
        ? parsed.countries
        : [...parsed.countries, countryHint ?? 'KR'].filter((v, i, a) => a.indexOf(v) === i) as CountryCode[];

      const genre = parsed.genres[0] ?? 'electrical';
      const targets = countries.map(
        c => `${c.toLowerCase() as Lowercase<CountryCode>}-${genre}` as SandboxId,
      );

      return {
        type: 'cross',
        targetSandboxes: targets,
        bridgeNeeded: true,
        reason: `Cross-country comparison: ${countries.join(' vs ')} for ${genre}`,
      };
    }

    // Priority 3: AI-only query
    if (parsed.genres.includes('ai') && !parsed.genres.includes('electrical')) {
      return {
        type: 'single',
        targetSandboxes: ['global-ai'],
        bridgeNeeded: false,
        reason: 'AI/technology domain query',
      };
    }

    // Priority 4: Certification query
    if (parsed.genres.includes('certification')) {
      const country = parsed.countries[0] ?? countryHint ?? 'KR';
      const sandboxId: SandboxId = `${country.toLowerCase() as Lowercase<CountryCode>}-certification`;

      return {
        type: 'single',
        targetSandboxes: [sandboxId],
        bridgeNeeded: false,
        reason: `Certification exam query for ${country}`,
      };
    }

    // Priority 5: Single country electrical
    if (parsed.genres.includes('electrical') && parsed.countries.length <= 1) {
      const country = parsed.countries[0] ?? countryHint ?? 'KR';
      const sandboxId: SandboxId = `${country.toLowerCase() as Lowercase<CountryCode>}-electrical`;

      return {
        type: 'single',
        targetSandboxes: [sandboxId],
        bridgeNeeded: false,
        reason: `Single-country electrical query for ${country}`,
      };
    }

    // Priority 6: Standards query
    if (parsed.genres.includes('standard')) {
      const country = parsed.countries[0] ?? countryHint ?? 'KR';
      const sandboxId: SandboxId = `${country.toLowerCase() as Lowercase<CountryCode>}-standard`;

      return {
        type: 'single',
        targetSandboxes: [sandboxId],
        bridgeNeeded: false,
        reason: `Standards/regulation query for ${country}`,
      };
    }

    // Fallback: default to KR electrical (ESVA primary audience)
    const fallbackCountry = countryHint ?? 'KR';
    const fallbackSandbox: SandboxId = `${fallbackCountry.toLowerCase() as Lowercase<CountryCode>}-electrical`;

    return {
      type: 'single',
      targetSandboxes: [fallbackSandbox],
      bridgeNeeded: false,
      reason: `Fallback: default ${fallbackCountry} electrical sandbox`,
    };
  }

  // ─── PART 3: Execution ──────────────────────────────────────

  /**
   * Execute a single-sandbox query.
   */
  private async executeSingle(
    routing: RoutingDecision,
    parsed: ParsedQuery,
    context?: AgentContext,
  ): Promise<AgentResponse> {
    const sandboxId = routing.targetSandboxes[0];
    const config = getSandbox(sandboxId);
    const agent = createSandboxAgent(config);

    const execStart = performance.now();
    const result = await agent.execute(parsed, context);
    const latencyMs = Math.round(performance.now() - execStart);

    // ARI 건강도 추적 — 프로바이더별 성공/실패/지연 기록
    ariManager.updateAfterCall(sandboxId, !result.error, latencyMs);

    return {
      answer: result.data.answer,
      sources: result.data.sources,
      calculatorSuggestion: result.data.calculatorSuggestion,
      relatedStandards: result.data.relatedStandards,
      sandboxesUsed: [sandboxId],
      timing: {
        total: result.timing,
        perSandbox: { [sandboxId]: result.timing } as ResponseTiming['perSandbox'],
      },
      warnings: result.error ? [result.error] : undefined,
    };
  }

  /**
   * Execute a cross-domain query via the Bridge Agent.
   * If bridge fails, fall back to executing sandboxes sequentially from main.
   */
  private async executeBridge(
    routing: RoutingDecision,
    parsed: ParsedQuery,
    context?: AgentContext,
  ): Promise<AgentResponse> {
    try {
      const bridge = createBridgeAgent(routing.targetSandboxes);
      return await bridge.coordinate(routing.targetSandboxes, parsed, context);

    } catch (bridgeError) {
      // Fallback: main handles directly by running sandboxes sequentially
      console.warn(
        '[MainAgent] Bridge failed, falling back to sequential execution:',
        bridgeError,
      );

      return this.executeFallbackSequential(routing, parsed, context);
    }
  }

  /**
   * Fallback: execute sandboxes sequentially when bridge fails.
   */
  private async executeFallbackSequential(
    routing: RoutingDecision,
    parsed: ParsedQuery,
    _context?: unknown,
  ): Promise<AgentResponse> {
    const results: SandboxResult[] = [];

    for (const sandboxId of routing.targetSandboxes) {
      try {
        const config = getSandbox(sandboxId);
        const agent = createSandboxAgent(config);
        const result = await agent.execute(parsed);
        results.push(result);
      } catch {
        results.push({
          sandboxId,
          data: { answer: '', sources: [] },
          timing: 0,
          error: `Sandbox ${sandboxId} failed in fallback mode`,
        });
      }
    }

    // Aggregate results manually
    const successResults = results.filter(r => !r.error);
    const answer = successResults.map(r => r.data.answer).filter(Boolean).join('\n\n---\n\n');
    const sources = successResults.flatMap(r => r.data.sources);
    const perSandbox: Record<string, number> = {};
    for (const r of results) {
      perSandbox[r.sandboxId] = r.timing;
    }

    return {
      answer: answer || (parsed.language === 'ko' ? '결과를 가져올 수 없습니다.' : 'Unable to retrieve results.'),
      sources,
      sandboxesUsed: successResults.map(r => r.sandboxId),
      timing: {
        total: 0, // Will be set by caller
        perSandbox: perSandbox as ResponseTiming['perSandbox'],
      },
      warnings: ['Bridge agent failed; results aggregated in fallback mode'],
    };
  }

  // ─── PART 4: Error Response ─────────────────────────────────

  private buildErrorResponse(err: unknown, totalMs: number, language: Lang): AgentResponse {
    const message = err instanceof Error ? err.message : String(err);

    return {
      answer: language === 'ko'
        ? `요청 처리 중 오류가 발생했습니다: ${message}`
        : `Error processing request: ${message}`,
      sources: [],
      sandboxesUsed: [],
      timing: {
        total: totalMs,
        perSandbox: {} as ResponseTiming['perSandbox'],
      },
      warnings: [`Error: ${message}`],
    };
  }
}
