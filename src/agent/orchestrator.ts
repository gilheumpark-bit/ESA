/**
 * ESVA Enhanced Orchestrator
 * --------------------------
 * 설계안 1단계: 입력 분류 → 팀 배분 → 병렬 실행 → 합의 → 출력
 *
 * PART 1: Input classification
 * PART 2: Team dispatch
 * PART 3: Parallel execution
 * PART 4: Report assembly
 */

import type { TeamInput, TeamResult, ESVAVerifiedReport } from './teams/types';
import { classifyInput, routeToTeams, type TeamRouting } from './teams/team-registry';
import { executeSLDTeam } from './teams/sld-team';
import { executeLayoutTeam } from './teams/layout-team';
import { executeStandardsTeam } from './teams/standards-team';
import { executeConsensusTeam } from './teams/consensus-team';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Input Classification
// ═══════════════════════════════════════════════════════════════════════════════

export interface OrchestratorRequest {
  sessionId: string;
  projectName?: string;
  projectType?: string;
  query?: string;
  file?: {
    buffer: ArrayBuffer;
    name: string;
    mimeType: string;
  };
  params?: Record<string, unknown>;
  countryCode?: string;
  language?: string;
  dxfLayers?: string[];
  /** 이미지 분석용 요청 한정 Vision 자격 증명. 보고서·응답에는 직렬화하지 않는다. */
  vision?: TeamInput['vision'];
  /** 사내 규정 룰셋 — 라우트에서 린트 통과분만 (engine/standards/custom-rules) */
  customRuleSet?: import('@/engine/standards/custom-rules').CustomRuleSet;
  /** 요청 메모리 안에서만 전달하며 결과·보고서·JSON에 직렬화하지 않는다. */
  signal?: AbortSignal;
}

export interface OrchestratorResponse {
  success: boolean;
  routing: TeamRouting;
  teamResults: TeamResult[];
  consensus: {
    requested: boolean;
    executed: boolean;
    participatingTeams: TeamResult['teamId'][];
    reason?: string;
  };
  report?: ESVAVerifiedReport;
  durationMs: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Team Dispatch
// ═══════════════════════════════════════════════════════════════════════════════

function buildTeamInput(req: OrchestratorRequest, routing: TeamRouting): TeamInput {
  return {
    sessionId: req.sessionId,
    classification: routing.classification,
    query: req.query,
    fileBuffer: req.file?.buffer,
    fileName: req.file?.name,
    mimeType: req.file?.mimeType,
    params: req.params,
    countryCode: req.countryCode,
    language: req.language,
    vision: req.vision,
    customRuleSet: req.customRuleSet,
    signal: req.signal,
  };
}

function abortError(): Error {
  return new Error('request aborted');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function waitForBackoff(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, delayMs));
  const activeSignal = signal;
  if (activeSignal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, delayMs);
    const onAbort = () => { clearTimeout(timer); done(abortError()); };
    function done(error?: Error) {
      activeSignal.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve();
    }
    activeSignal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 팀 디스패치 + 지수 백오프 재시도.
 * 일시적 오류(네트워크, 타임아웃) 시 자동 복구.
 */
async function dispatchWithRetry(
  teamId: string,
  input: TeamInput,
  maxRetries: number = 2,
): Promise<TeamResult> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    throwIfAborted(input.signal);
    try {
      const result = await dispatchToTeam(teamId, input);
      throwIfAborted(input.signal);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (input.signal?.aborted) throw abortError();
      if (attempt < maxRetries) {
        // 지수 백오프: 500ms, 1000ms
        await waitForBackoff(500 * Math.pow(2, attempt), input.signal);
      }
    }
  }
  throw lastError ?? new Error(`[Orchestrator] ${teamId} dispatch failed after ${maxRetries} retries`);
}

async function dispatchToTeam(teamId: string, input: TeamInput): Promise<TeamResult> {
  switch (teamId) {
    case 'TEAM-SLD':
      return executeSLDTeam(input);
    case 'TEAM-LAYOUT':
      return executeLayoutTeam(input);
    case 'TEAM-STD':
      return executeStandardsTeam(input);
    default:
      return {
        teamId: teamId as TeamResult['teamId'],
        success: false,
        confidence: 0,
        durationMs: 0,
        error: `Unknown team: ${teamId}`,
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Parallel Execution
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ESVA Orchestrator 메인 실행.
 *
 * 1. 입력 분류 (파일 타입 + 키워드 → 계통도/평면도/규정)
 * 2. 팀 라우팅 (1차 팀 + 지원 팀)
 * 3. 병렬 실행 (Promise.allSettled)
 * 4. 합의 팀 실행 (토론 → 검증 마킹 → 보고서)
 * 5. 최종 응답
 */
export async function runOrchestrator(
  request: OrchestratorRequest,
): Promise<OrchestratorResponse> {
  const start = Date.now();

  try {
    if (request.signal?.aborted) throw abortError();
    // Step 1: 입력 분류
    const classification = classifyInput(
      request.file?.mimeType,
      request.file?.name,
      request.query,
      request.dxfLayers,
    );

    // Step 2: 팀 라우팅
    const routing = routeToTeams(classification);
    const teamInput = buildTeamInput(request, routing);

    // Step 3: 병렬 실행 (1차 팀 + 지원 팀)
    const allTeamIds = [routing.primaryTeam, ...routing.supportTeams];

    const teamPromises = allTeamIds.map(teamId =>
      dispatchWithRetry(teamId, teamInput, routing.classification === 'sld_image' && teamId === 'TEAM-SLD' ? 0 : 2).catch(err => ({
        teamId: teamId as TeamResult['teamId'],
        success: false,
        confidence: 0,
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
      } as TeamResult))
    );

    const teamResults = await Promise.all(teamPromises);
    if (request.signal?.aborted) throw abortError();

    // Step 4: 합의는 서로 다른 전문팀이 2개 이상 성공한 경우에만 실행한다.
    // 같은 TEAM-STD 구현을 두 번 호출해 독립 협의체처럼 세던 경로는 제거했다.
    let report: ESVAVerifiedReport | undefined;
    const participatingTeams = [...new Set(
      teamResults
        .filter(result => result.success && result.teamId !== 'TEAM-CONSENSUS')
        .map(result => result.teamId),
    )];
    const consensus = {
      requested: routing.requiresConsensus,
      executed: false,
      participatingTeams,
      reason: routing.requiresConsensus
        ? '서로 다른 전문팀 2개 이상의 성공 결과가 필요합니다.'
        : '이 입력 유형은 다중팀 합의를 요청하지 않습니다.',
    };

    if (routing.requiresConsensus && participatingTeams.length >= 2) {
      if (request.signal?.aborted) throw abortError();
      const { teamResult: consensusResult, report: verifiedReport } =
        await executeConsensusTeam({
          sessionId: request.sessionId,
          projectName: request.projectName ?? '미지정 프로젝트',
          projectType: request.projectType ?? '전기 설비',
          teamResults,
        });
      if (request.signal?.aborted) throw abortError();

      teamResults.push(consensusResult);
      report = verifiedReport;
      consensus.executed = true;
      consensus.reason = '서로 다른 전문팀 결과를 합의·출력 단계에서 병합했습니다.';
    }

    return {
      success: teamResults.some(r => r.success),
      routing,
      teamResults,
      consensus,
      report,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      routing: routeToTeams('text_query'),
      teamResults: [],
      consensus: {
        requested: false,
        executed: false,
        participatingTeams: [],
        reason: '오케스트레이터 실행 전에 오류가 발생했습니다.',
      },
      durationMs: Date.now() - start,
      error: request.signal?.aborted ? '요청이 중단되었습니다.' : err instanceof Error ? err.message : String(err),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Barrel Exports
// ═══════════════════════════════════════════════════════════════════════════════

export { classifyInput, routeToTeams } from './teams/team-registry';
export { executeSLDTeam } from './teams/sld-team';
export { executeLayoutTeam } from './teams/layout-team';
export { executeStandardsTeam } from './teams/standards-team';
export { executeConsensusTeam } from './teams/consensus-team';
export { runDebate, buildEscalation } from './debate/debate-protocol';
