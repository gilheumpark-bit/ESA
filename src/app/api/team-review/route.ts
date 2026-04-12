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
      durationMs,
    }, perfHeaders(durationMs));
  },
);
