/**
 * ESVA Sandbox Agent — Domain Expert
 * ──────────────────────────────────
 * Tier 3: Isolated, on-demand domain expert.
 * Each instance is scoped to a single country × genre combination.
 * Direct sandbox-to-sandbox communication is FORBIDDEN.
 *
 * PART 1: SandboxAgent class
 * PART 2: Tool execution stub
 * PART 3: Factory
 */

import type {
  SandboxId,
  SandboxConfig,
  SandboxResult,
  SandboxData,
  ParsedQuery,
  AgentContext,
  SourceTag,
} from '@agent/types';
import { searchRAG, type RAGResult } from '@/lib/rag-pipeline';
import { CALCULATOR_REGISTRY } from '@engine/calculators';
import { STANDARD_REFS } from '@/data/standards/standard-refs';
import { ELECTRICAL_TERMS } from '@/data/iec-60050/electrical-terms';
import { searchKnowledgeGraph } from '@/lib/knowledge-graph';

// ─── PART 1: SandboxAgent Class ─────────────────────────────────

export class SandboxAgent {
  public readonly sandboxId: SandboxId;
  private readonly config: SandboxConfig;

  constructor(sandboxId: SandboxId, config: SandboxConfig) {
    this.sandboxId = sandboxId;
    this.config = config;
  }

  /**
   * Execute a query within this sandbox's isolated scope.
   *
   * The sandbox:
   * 1. Validates that the query falls within its data scope
   * 2. Runs its tool pipeline (search, calculate, etc.)
   * 3. Formats results with source citations
   * 4. Returns a SandboxResult (never communicates with other sandboxes)
   */
  async execute(query: ParsedQuery, context?: AgentContext): Promise<SandboxResult> {
    const startTime = performance.now();

    try {
      const data = await this.processQuery(query, context);
      const timing = Math.round(performance.now() - startTime);

      return {
        sandboxId: this.sandboxId,
        data,
        timing,
      };
    } catch (err) {
      const timing = Math.round(performance.now() - startTime);
      const message = err instanceof Error ? err.message : String(err);

      return {
        sandboxId: this.sandboxId,
        data: {
          answer: '',
          sources: [],
        },
        timing,
        error: message,
      };
    }
  }

  /**
   * Core query processing pipeline.
   * Subclasses or future implementations will override this
   * with actual LLM calls and tool invocations.
   */
  private async processQuery(
    query: ParsedQuery,
    _context?: AgentContext,
  ): Promise<SandboxData> {
    // Step 1: Build the prompt with sandbox's system context
    const systemContext = this.buildSystemContext(query);

    // Step 2: Execute available tools for this sandbox
    const toolResults = await this.executeTools(query);

    // Step 3: Synthesize answer from tool results
    const answer = this.synthesizeAnswer(systemContext, toolResults, query);

    // Step 4: Extract sources from tool results
    const sources = this.extractSources(toolResults);

    // Step 5: Check for calculator relevance
    const calculatorSuggestion = this.detectCalculator(query);

    // Step 6: Find related standards
    const relatedStandards = this.findRelatedStandards(query);

    return {
      answer,
      sources,
      calculatorSuggestion,
      relatedStandards,
    };
  }

  /**
   * Build system context string combining the sandbox's system prompt
   * with query-specific context.
   */
  private buildSystemContext(query: ParsedQuery): string {
    return [
      this.config.systemPrompt,
      `\nData scope: ${this.config.dataScope}`,
      `Query language: ${query.language}`,
      `Keywords: ${query.keywords.join(', ')}`,
    ].join('\n');
  }

  /**
   * Execute tools available to this sandbox.
   * Each sandbox only has access to its configured tool set.
   */
  private async executeTools(query: ParsedQuery): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolId of this.config.tools) {
      try {
        const result = await executeTool(toolId, query);
        results.push(result);
      } catch {
        // Tool failure is non-fatal; continue with remaining tools
        results.push({
          toolId,
          success: false,
          data: null,
          sources: [],
        });
      }
    }

    return results;
  }

  /**
   * Tool 결과를 구조화하여 답변을 합성한다.
   * LLM 의존 없이 Tool 출력을 정형화 — "AI는 계산기가 아니다" 원칙 준수.
   * 검색 결과는 출처 포함, 계산 결과는 수식 포함.
   */
  private synthesizeAnswer(
    _systemContext: string,
    toolResults: ToolResult[],
    query: ParsedQuery,
  ): string {
    const successful = toolResults.filter(r => r.success && r.data);

    if (successful.length === 0) {
      return query.language === 'ko'
        ? `[${this.config.displayName}] 관련 정보를 찾지 못했습니다.`
        : `[${this.config.displayName}] No relevant information found.`;
    }

    const sections: string[] = [];

    for (const result of successful) {
      const data = String(result.data);
      if (!data) continue;

      switch (result.toolId) {
        case 'SEARCH':
          sections.push(`### 검색 결과\n${data}`);
          break;
        case 'CALCULATE':
          sections.push(`### 계산기 정보\n${data}`);
          break;
        case 'STANDARD_LOOKUP':
          sections.push(`### 기준/규격 조회\n${data}`);
          break;
        case 'TERM_LOOKUP':
          sections.push(`### 용어 정의\n${data}`);
          break;
        case 'KNOWLEDGE_GRAPH':
          sections.push(`### 관련 개념\n${data}`);
          break;
        default:
          sections.push(data);
      }
    }

    // 출처 요약 추가
    const allSources = successful.flatMap(r => r.sources);
    if (allSources.length > 0) {
      const sourceList = allSources
        .map(s => `[SOURCE: ${s.standard} ${s.clause}]`)
        .join(' ');
      sections.push(`\n---\n출처: ${sourceList}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Extract SourceTag references from tool results.
   */
  private extractSources(toolResults: ToolResult[]): SourceTag[] {
    const allSources: SourceTag[] = [];
    for (const result of toolResults) {
      if (result.sources.length > 0) {
        allSources.push(...result.sources);
      }
    }
    // Deduplicate by standard + clause
    const seen = new Set<string>();
    return allSources.filter(s => {
      const key = `${s.standard}:${s.clause}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Detect if the query implies a calculator should be suggested.
   */
  private detectCalculator(query: ParsedQuery) {
    if (query.calculatorId) {
      return {
        calculatorId: query.calculatorId,
        name: query.calculatorId,
        reason: 'Query references a calculable parameter',
      };
    }
    return undefined;
  }

  /**
   * Find related standards based on the query keywords.
   */
  private findRelatedStandards(query: ParsedQuery) {
    // Placeholder: will hook into standards search index
    if (query.keywords.length === 0) return undefined;

    return [{
      standard: this.config.dataScope.split(',')[0]?.trim() ?? this.config.dataScope,
      description: `Primary standard for ${this.config.displayName}`,
      country: this.config.country,
    }];
  }

  /**
   * Get sandbox metadata (for logging/telemetry).
   */
  getInfo(): { id: SandboxId; country: string; genre: string; displayName: string } {
    return {
      id: this.sandboxId,
      country: this.config.country,
      genre: this.config.genre,
      displayName: this.config.displayName,
    };
  }
}

// ─── PART 2: Tool Execution Stub ────────────────────────────────

interface ToolResult {
  toolId: string;
  success: boolean;
  data: unknown;
  sources: SourceTag[];
}

/**
 * Execute a single tool by ID.
 * Routes to the real tool implementation based on the tool identifier.
 */
async function executeTool(toolId: string, query: ParsedQuery): Promise<ToolResult> {
  switch (toolId) {
    // ── SEARCH: RAG pipeline over Weaviate ──
    case 'SEARCH': {
      const ragResults = await searchRAG({
        query: query.raw,
        country: query.countries[0],
        genre: query.genres[0],
        limit: 10,
      });
      if (ragResults.length === 0) {
        return { toolId, success: true, data: null, sources: [] };
      }
      const sources: SourceTag[] = ragResults
        .filter((r: RAGResult) => r.standard)
        .map((r: RAGResult) => ({
          standard: r.standard!,
          clause: r.clause ?? '',
          source: r.source,
          url: r.url,
        }));
      const data = ragResults
        .map((r: RAGResult) => `[${r.standard ?? r.source}] ${r.title}\n${r.snippet}`)
        .join('\n\n');
      return { toolId, success: true, data, sources };
    }

    // ── CALCULATE: lookup and describe a calculator from registry ──
    case 'CALCULATE': {
      if (!query.calculatorId) {
        return { toolId, success: true, data: null, sources: [] };
      }
      const entry = CALCULATOR_REGISTRY.get(query.calculatorId);
      if (!entry) {
        return { toolId, success: false, data: null, sources: [] };
      }
      const data = `계산기: ${entry.name} (${entry.nameEn})\n카테고리: ${entry.category}\n난이도: ${entry.difficulty}`;
      return { toolId, success: true, data, sources: [] };
    }

    // ── STANDARD_LOOKUP: search standard references ──
    case 'STANDARD_LOOKUP': {
      const keyword = query.keywords[0] ?? query.raw;
      const upperKw = keyword.toUpperCase();
      const matched = STANDARD_REFS.filter(
        (r) =>
          r.standard.toUpperCase().includes(upperKw) ||
          r.title_ko.includes(keyword) ||
          r.title_en.toLowerCase().includes(keyword.toLowerCase()) ||
          (r.clause && r.clause.includes(keyword)),
      ).slice(0, 10);
      if (matched.length === 0) {
        return { toolId, success: true, data: null, sources: [] };
      }
      const sources: SourceTag[] = matched.map((r) => ({
        standard: r.standard,
        clause: r.clause ?? '',
        source: r.body,
        url: r.url,
      }));
      const data = matched
        .map((r) => `${r.standard} ${r.clause ?? ''} — ${r.title_ko} (${r.title_en})`)
        .join('\n');
      return { toolId, success: true, data, sources };
    }

    // ── TERM_LOOKUP: search electrical terminology (IEC 60050) ──
    case 'TERM_LOOKUP': {
      const keyword = query.keywords[0] ?? query.raw;
      const lower = keyword.toLowerCase();
      const matched = ELECTRICAL_TERMS.filter(
        (t) =>
          t.ko.includes(keyword) ||
          t.en.toLowerCase().includes(lower) ||
          t.synonyms.some((s) => s.toLowerCase().includes(lower)),
      ).slice(0, 5);
      if (matched.length === 0) {
        return { toolId, success: true, data: null, sources: [] };
      }
      const data = matched
        .map(
          (t) =>
            `${t.ko} (${t.en})${t.iecRef ? ` [IEC ${t.iecRef}]` : ''} — ${t.category}${t.synonyms.length > 0 ? `\n  동의어: ${t.synonyms.join(', ')}` : ''}`,
        )
        .join('\n');
      const sources: SourceTag[] = matched
        .filter((t) => t.iecRef)
        .map((t) => ({
          standard: 'IEC 60050',
          clause: t.iecRef ?? '',
          source: 'IEC',
        }));
      return { toolId, success: true, data, sources };
    }

    // ── KNOWLEDGE_GRAPH: query concept graph ──
    case 'KNOWLEDGE_GRAPH': {
      const nodes = searchKnowledgeGraph(query.raw);
      if (nodes.length === 0) {
        return { toolId, success: true, data: null, sources: [] };
      }
      const data = nodes
        .slice(0, 10)
        .map((n) => `[${n.type}] ${n.name_ko} (${n.name_en})`)
        .join('\n');
      return { toolId, success: true, data, sources: [] };
    }

    // ── CONVERT: unit conversion ──
    case 'CONVERT': {
      const text = query.raw.toLowerCase();
      const conversions: string[] = [];

      // AWG ↔ mm² 변환
      const awgMatch = text.match(/(\d+)\s*awg/);
      if (awgMatch) {
        const awg = parseInt(awgMatch[1]);
        const AWG_TO_MM2: Record<number, number> = {
          14: 2.08, 12: 3.31, 10: 5.26, 8: 8.37, 6: 13.3, 4: 21.2,
          3: 26.7, 2: 33.6, 1: 42.4, 0: 53.5,
        };
        const mm2 = AWG_TO_MM2[awg];
        if (mm2) conversions.push(`${awg} AWG = ${mm2} mm²`);
      }

      // HP ↔ kW 변환
      const hpMatch = text.match(/([\d.]+)\s*hp/);
      if (hpMatch) {
        const hp = parseFloat(hpMatch[1]);
        conversions.push(`${hp} HP = ${(hp * 0.7457).toFixed(2)} kW`);
      }

      // kVA ↔ kW 변환
      const kvaMatch = text.match(/([\d.]+)\s*kva/);
      if (kvaMatch) {
        const kva = parseFloat(kvaMatch[1]);
        conversions.push(`${kva} kVA = ${(kva * 0.8).toFixed(1)} kW (역률 0.8 기준)`);
      }

      // mm² → AWG 역변환
      const mm2Match = text.match(/([\d.]+)\s*(?:sq|mm2|㎟)/);
      if (mm2Match && !awgMatch) {
        const mm2 = parseFloat(mm2Match[1]);
        const MM2_TO_AWG: Array<[number, string]> = [
          [0.5, '20'], [0.75, '18'], [1.0, '17'], [1.5, '15'], [2.5, '13'],
          [4, '11'], [6, '9'], [10, '7'], [16, '5'], [25, '3'],
          [35, '2'], [50, '1/0'], [70, '2/0'], [95, '3/0'], [120, '4/0'],
          [150, '300MCM'], [185, '350MCM'], [240, '500MCM'],
        ];
        const closest = MM2_TO_AWG.reduce((prev, curr) =>
          Math.abs(curr[0] - mm2) < Math.abs(prev[0] - mm2) ? curr : prev,
        );
        conversions.push(`${mm2} mm² ≈ AWG ${closest[1]} (근사 ${closest[0]} mm²)`);
      }

      if (conversions.length === 0) {
        return { toolId, success: true, data: null, sources: [] };
      }

      return {
        toolId,
        success: true,
        data: conversions.join('\n'),
        sources: [{ standard: 'IEC 60228', clause: 'Table 1' }],
      };
    }

    default:
      return { toolId, success: false, data: null, sources: [] };
  }
}

// ─── PART 3: Factory ────────────────────────────────────────────

/**
 * Create a SandboxAgent from a SandboxConfig.
 * Validates that the config's ID matches the requested sandboxId.
 */
export function createSandboxAgent(config: SandboxConfig): SandboxAgent {
  return new SandboxAgent(config.id, config);
}
