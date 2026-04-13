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
}

export interface OrchestratorResponse {
  success: boolean;
  routing: TeamRouting;
  teamResults: TeamResult[];
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
  };
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
    try {
      return await dispatchToTeam(teamId, input);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        // 지수 백오프: 500ms, 1000ms
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
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
    const allTeamIds = [routing.primaryTeam, ...routing.supportTeams]
      .filter(t => t !== 'TEAM-CONSENSUS');

    const teamPromises = allTeamIds.map(teamId =>
      dispatchWithRetry(teamId, teamInput, 2).catch(err => ({
        teamId: teamId as TeamResult['teamId'],
        success: false,
        confidence: 0,
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
      } as TeamResult))
    );

    // 텍스트 쿼리 시 레거시 MainAgent도 병렬 호출 (검색 보강)
    if (classification === 'text_query' && request.query) {
      teamPromises.push(
        (async (): Promise<TeamResult> => {
          try {
            const { MainAgent } = await import('./main');
            const agent = new MainAgent();
            const agentResult = await agent.processQuery({
              sessionId: request.sessionId,
              query: request.query!,
              language: (request.language ?? 'ko') as 'ko' | 'en' | 'ja',
              countryCode: (request.countryCode ?? 'KR') as 'KR' | 'US' | 'JP' | 'CN' | 'DE' | 'AU',
            });
            return {
              teamId: 'TEAM-STD',
              success: true,
              confidence: 0.8,
              durationMs: agentResult.timing?.total ?? 0,
              rawOutput: agentResult.answer,
            };
          } catch {
            return { teamId: 'TEAM-STD', success: false, confidence: 0, durationMs: 0 };
          }
        })()
      );
    }

    const teamResults = await Promise.all(teamPromises);

    // Step 4: 합의 팀 실행 (routing이 합의 필요할 때만)
    let report: ESVAVerifiedReport | undefined;

    if (routing.requiresConsensus && teamResults.some(r => r.success)) {
      const { teamResult: consensusResult, report: verifiedReport } =
        await executeConsensusTeam({
          sessionId: request.sessionId,
          projectName: request.projectName ?? '미지정 프로젝트',
          projectType: request.projectType ?? '전기 설비',
          teamResults,
        });

      teamResults.push(consensusResult);
      report = verifiedReport;
    }

    return {
      success: teamResults.some(r => r.success),
      routing,
      teamResults,
      report,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      routing: routeToTeams('text_query'),
      teamResults: [],
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
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
