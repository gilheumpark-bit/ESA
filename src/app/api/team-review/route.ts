/**
 * POST /api/team-review
 * ---------------------
 * ESVA 4-Team 설계 리뷰 엔드포인트.
 * withApiHandler로 CORS/레이트리밋/에러핸들링/로깅 통합.
 */

import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/api';
import { startPerf, perfHeaders } from '@/lib/api/performance';
import { runOrchestrator } from '@/agent/orchestrator';
import { parseCustomRuleSet, type CustomRuleSet } from '@/engine/standards/custom-rules';

/** 사내 규정 JSON 크기 상한 — 리포트·메모리 폭주 방지 */
const RULES_MAX_BYTES = 1024 * 1024;

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = withApiHandler(
  { rateLimit: 'sld', checkOrigin: true },
  async (req: NextRequest, ctx) => {
    const perf = startPerf('team-review');

    const contentType = req.headers.get('content-type') ?? '';
    let sessionId = `session-${Date.now().toString(36)}`;
    let projectName = '미지정 프로젝트';
    let projectType = '전기 설비';
    let query: string | undefined;
    let fileBuffer: ArrayBuffer | undefined;
    let fileName: string | undefined;
    let mimeType: string | undefined;
    let params: Record<string, unknown> = {};
    let customRuleSet: CustomRuleSet | undefined;
    let ruleWarnings: string[] = [];

    // Multipart: 도면 파일 + 메타데이터
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      query = ctx.sanitize((formData.get('query') as string) ?? '') || undefined;
      projectName = ctx.sanitize((formData.get('projectName') as string) ?? '미지정 프로젝트');
      projectType = ctx.sanitize((formData.get('projectType') as string) ?? '전기 설비');

      const paramsStr = formData.get('params') as string;
      if (paramsStr) {
        try { params = JSON.parse(paramsStr); } catch { /* ignore */ }
      }

      if (file) {
        fileBuffer = await file.arrayBuffer();
        fileName = file.name;
        mimeType = file.type;
      }

      // 사내 규정(선택) — 무효 룰셋을 조용히 버리고 검토를 진행하면 사용자는
      // "규정 대조가 됐다"고 오인한다. fail-closed: 오류 목록과 함께 400.
      const rulesFile = formData.get('rules') as File | null;
      if (rulesFile) {
        if (rulesFile.size > RULES_MAX_BYTES) {
          return ctx.error('ESVA-4413', `사내 규정 파일이 너무 큽니다 (최대 ${RULES_MAX_BYTES / 1024}KB)`, 400);
        }
        let rulesRaw: unknown;
        try {
          rulesRaw = JSON.parse(await rulesFile.text());
        } catch {
          return ctx.error('ESVA-4400', '사내 규정 파일이 JSON이 아닙니다', 400);
        }
        const lint = parseCustomRuleSet(rulesRaw);
        if (!lint.ok || !lint.ruleSet) {
          return ctx.error(
            'ESVA-4400',
            `사내 규정 검증 실패: ${lint.errors.slice(0, 5).join(' / ')}${lint.errors.length > 5 ? ` 외 ${lint.errors.length - 5}건` : ''}`,
            400,
          );
        }
        customRuleSet = lint.ruleSet;
        ruleWarnings = lint.warnings;
      }
    } else {
      const body = await req.json();
      query = body.query ? ctx.sanitize(body.query) : undefined;
      projectName = body.projectName ?? projectName;
      projectType = body.projectType ?? projectType;
      params = body.params ?? {};
      sessionId = body.sessionId ?? sessionId;
    }

    perf.checkpoint('parse');

    // Orchestrator 실행
    const result = await runOrchestrator({
      sessionId,
      projectName,
      projectType,
      query,
      file: fileBuffer ? { buffer: fileBuffer, name: fileName!, mimeType: mimeType! } : undefined,
      params,
      countryCode: (params.countryCode as string) ?? 'KR',
      language: (params.language as string) ?? 'ko',
      customRuleSet,
    });

    perf.checkpoint('orchestrate');

    if (!result.success) {
      return ctx.error('ESVA-4500', result.error ?? '팀 리뷰 실행 실패', 500);
    }

    const durationMs = perf.end({ teamCount: result.teamResults.length });

    return ctx.ok({
      routing: {
        primaryTeam: result.routing.primaryTeam,
        supportTeams: result.routing.supportTeams,
        classification: result.routing.classification,
      },
      teamCount: result.teamResults.length,
      teamSummary: result.teamResults.map(tr => ({
        teamId: tr.teamId,
        success: tr.success,
        confidence: tr.confidence,
        durationMs: tr.durationMs,
        calculationCount: tr.calculations?.length ?? 0,
        violationCount: tr.violations?.length ?? 0,
      })),
      report: result.report
        ? {
            reportId: result.report.reportId,
            verdict: result.report.verdict,
            grade: result.report.grade,
            compositeScore: result.report.compositeScore,
            markings: result.report.markings,
            summary: result.report.summary,
            debateCount: result.report.debateResults.length,
          }
        : null,
      // /report/[id] 페이지가 sessionStorage(esva-report-{id})로 인계받아
      // 렌더하는 전체 ESVAVerifiedReport. 요약(report)만으론 페이지가 뜰 수
      // 없어 이 기능이 UI에서 영구 미도달이었다(Batch C1 배선).
      reportFull: result.report ?? null,
      // 사내 규정 적용 정보 — 어떤 룰셋이 대조됐는지·린트 경고를 숨기지 않는다
      customRules: customRuleSet
        ? {
            name: customRuleSet.name,
            version: customRuleSet.version,
            articleCount: customRuleSet.articles.length,
            warnings: ruleWarnings,
          }
        : null,
      durationMs,
    }, perfHeaders(durationMs));
  },
);
