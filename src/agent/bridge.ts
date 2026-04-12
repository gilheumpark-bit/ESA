/**
 * ESVA Bridge Agent — Cross-Domain Coordinator
 * ────────────────────────────────────────────
 * Tier 2: Ephemeral, on-demand coordinator.
 * Created per cross-domain request, destroyed after response.
 * Mediates ALL communication between sandboxes.
 *
 * PART 1: BridgeAgent class
 * PART 2: Result merging logic
 * PART 3: Timeout handling
 */

import type {
  SandboxId,
  ParsedQuery,
  AgentContext,
  AgentResponse,
  SandboxResult,
  SandboxData,
  ResponseTiming,
  SourceTag,
  CalculatorSuggestion,
  RelatedStandard,
} from '@agent/types';
import { getSandbox } from './sandbox/sandbox-registry';
import { createSandboxAgent } from './sandbox/sandbox-agent';
import { getIsolationMatrix } from './sandbox/isolation';

// ─── Constants ──────────────────────────────────────────────────

/** Maximum time (ms) to wait for a single sandbox response */
const SANDBOX_TIMEOUT_MS = 3_000;

/** Warning message when sandbox results are excluded due to timeout */
const PARTIAL_RESULTS_WARNING_KO = '일부 결과 제외됨 (시간 초과)';
const PARTIAL_RESULTS_WARNING_EN = 'Some results excluded (timeout)';

// ─── PART 1: BridgeAgent Class ──────────────────────────────────

export class BridgeAgent {
  private readonly sandboxIds: SandboxId[];
  private readonly createdAt: number;

  /**
   * Bridge is ephemeral: constructed with the set of sandboxes to coordinate,
   * used once, then discarded.
   */
  constructor(sandboxIds: SandboxId[]) {
    this.sandboxIds = sandboxIds;
    this.createdAt = performance.now();
  }

  /**
   * Coordinate parallel execution across multiple sandboxes.
   *
   * Steps:
   * 1. Spawn sandbox agents for each target
   * 2. Execute all in parallel with per-sandbox timeout
   * 3. Log cross-access in isolation matrix
   * 4. Merge successful results
   * 5. Return aggregated response with timing
   */
  async coordinate(
    sandboxIds: SandboxId[],
    query: ParsedQuery,
    context?: AgentContext,
  ): Promise<AgentResponse> {
    const startTime = performance.now();
    const isolation = getIsolationMatrix();

    // Log all cross-access pairs through bridge
    this.logCrossAccessPairs(sandboxIds, isolation, query.raw);

    // Spawn and execute sandboxes in parallel with timeout
    const results = await this.executeParallel(sandboxIds, query, context);

    // Separate successes from failures/timeouts
    const { successes, failures } = this.partitionResults(results);

    // Merge successful results
    const merged = this.mergeResults(successes);

    // Build timing breakdown
    const perSandbox: Record<string, number> = {};
    for (const r of results) {
      perSandbox[r.sandboxId] = r.timing;
    }

    const totalTime = Math.round(performance.now() - startTime);

    // Build warnings
    const warnings: string[] = [];
    if (failures.length > 0) {
      const isKorean = query.language === 'ko';
      warnings.push(isKorean ? PARTIAL_RESULTS_WARNING_KO : PARTIAL_RESULTS_WARNING_EN);
      for (const f of failures) {
        warnings.push(`${f.sandboxId}: ${f.error ?? 'timeout'}`);
      }
    }

    return {
      answer: merged.answer,
      sources: merged.sources,
      calculatorSuggestion: merged.calculatorSuggestion,
      relatedStandards: merged.relatedStandards,
      sandboxesUsed: successes.map(r => r.sandboxId),
      timing: {
        total: totalTime,
        perSandbox: perSandbox as ResponseTiming['perSandbox'],
        aggregationMs: Math.round(performance.now() - startTime - Math.max(...results.map(r => r.timing), 0)),
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Execute multiple sandboxes in parallel, each with a timeout guard.
   */
  private async executeParallel(
    sandboxIds: SandboxId[],
    query: ParsedQuery,
    context?: AgentContext,
  ): Promise<SandboxResult[]> {
    const promises = sandboxIds.map(id =>
      this.executeWithTimeout(id, query, context),
    );
    return Promise.all(promises);
  }

  /**
   * Execute a single sandbox with a timeout.
   * If the sandbox exceeds SANDBOX_TIMEOUT_MS, return an error result.
   */
  private async executeWithTimeout(
    sandboxId: SandboxId,
    query: ParsedQuery,
    context?: AgentContext,
  ): Promise<SandboxResult> {
    const config = getSandbox(sandboxId);
    const agent = createSandboxAgent(config);

    const timeoutPromise = new Promise<SandboxResult>(resolve => {
      setTimeout(() => {
        resolve({
          sandboxId,
          data: { answer: '', sources: [] },
          timing: SANDBOX_TIMEOUT_MS,
          error: `Sandbox ${sandboxId} timed out after ${SANDBOX_TIMEOUT_MS}ms`,
        });
      }, SANDBOX_TIMEOUT_MS);
    });

    const executionPromise = agent.execute(query, context);

    // Race: first to resolve wins
    return Promise.race([executionPromise, timeoutPromise]);
  }

  // ─── PART 2: Result Merging ─────────────────────────────────

  /**
   * Merge results from multiple sandboxes into a single coherent response.
   *
   * Strategy:
   * - Concatenate answers with sandbox attribution headers
   * - Deduplicate sources by standard + clause
   * - Pick the first non-null calculator suggestion
   * - Merge and deduplicate related standards
   */
  private mergeResults(results: SandboxResult[]): SandboxData {
    if (results.length === 0) {
      return { answer: '', sources: [] };
    }

    if (results.length === 1) {
      return results[0].data;
    }

    // Merge answers with clear section separation
    const answerParts = results
      .filter(r => r.data.answer)
      .map(r => r.data.answer);
    const answer = answerParts.join('\n\n---\n\n');

    // Deduplicate sources
    const sources = this.deduplicateSources(
      results.flatMap(r => r.data.sources),
    );

    // First non-null calculator suggestion
    const calculatorSuggestion = results
      .map(r => r.data.calculatorSuggestion)
      .find((s): s is CalculatorSuggestion => s !== undefined);

    // Merge related standards, deduplicate
    const allStandards = results
      .flatMap(r => r.data.relatedStandards ?? []);
    const relatedStandards = this.deduplicateStandards(allStandards);

    return {
      answer,
      sources,
      calculatorSuggestion,
      relatedStandards: relatedStandards.length > 0 ? relatedStandards : undefined,
    };
  }

  /**
   * Deduplicate SourceTag array by standard + clause key.
   */
  private deduplicateSources(sources: SourceTag[]): SourceTag[] {
    const seen = new Set<string>();
    return sources.filter(s => {
      const key = `${s.standard}:${s.clause}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Deduplicate RelatedStandard array by standard name.
   */
  private deduplicateStandards(standards: RelatedStandard[]): RelatedStandard[] {
    const seen = new Set<string>();
    return standards.filter(s => {
      if (seen.has(s.standard)) return false;
      seen.add(s.standard);
      return true;
    });
  }

  // ─── PART 3: Helpers ──────────────────────────────────────────

  /**
   * Partition results into successes (no error) and failures (has error).
   */
  private partitionResults(results: SandboxResult[]): {
    successes: SandboxResult[];
    failures: SandboxResult[];
  } {
    const successes: SandboxResult[] = [];
    const failures: SandboxResult[] = [];

    for (const r of results) {
      if (r.error) {
        failures.push(r);
      } else {
        successes.push(r);
      }
    }

    return { successes, failures };
  }

  /**
   * Log all cross-access pairs through the isolation matrix.
   * For N sandboxes, logs N*(N-1)/2 bidirectional access entries.
   */
  private logCrossAccessPairs(
    sandboxIds: SandboxId[],
    isolation: ReturnType<typeof getIsolationMatrix>,
    queryRaw: string,
  ): void {
    for (let i = 0; i < sandboxIds.length; i++) {
      for (let j = i + 1; j < sandboxIds.length; j++) {
        isolation.logCrossAccess(
          sandboxIds[i],
          sandboxIds[j],
          `Bridge-mediated cross-domain query: "${queryRaw.slice(0, 100)}"`,
        );
      }
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────

/**
 * Create an ephemeral BridgeAgent for a set of sandbox targets.
 */
export function createBridgeAgent(sandboxIds: SandboxId[]): BridgeAgent {
  return new BridgeAgent(sandboxIds);
}
