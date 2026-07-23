/**
 * POST /api/team-review
 * ---------------------
 * ESVA 3개 전문팀 검토 + 별도 합의 단계 엔드포인트.
 * withApiHandler로 CORS/레이트리밋/에러핸들링/로깅 통합.
 */

import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/api';
import { getFormFile } from '@/lib/api/form-file';
import { startPerf, perfHeaders } from '@/lib/api/performance';
import { runOrchestrator } from '@/agent/orchestrator';
import { parseCustomRuleSet, type CustomRuleSet } from '@/engine/standards/custom-rules';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { isCatalogModel } from '@/lib/ai-providers';

/** 사내 규정 JSON 크기 상한 — 리포트·메모리 폭주 방지 */
const RULES_MAX_BYTES = 1024 * 1024;
const DRAWING_MAX_BYTES = 20 * 1024 * 1024;
const VISION_KEY_MAX_CHARS = 4096;
const VISION_MODEL_PATTERN = /^[a-zA-Z0-9._:/-]{1,128}$/;
const VISION_PROVIDERS = new Set(['openai', 'gemini', 'claude'] as const);
const TEAM_REVIEW_SOFT_DEADLINE_MS = 270_000;
type VisionProvider = 'openai' | 'gemini' | 'claude';

export function createRequestSignal(requestSignal: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromRequest = () => controller.abort();
  if (requestSignal.aborted) controller.abort();
  requestSignal.addEventListener('abort', abortFromRequest, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TEAM_REVIEW_SOFT_DEADLINE_MS);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => { clearTimeout(timer); requestSignal.removeEventListener('abort', abortFromRequest); },
  };
}

function drawingKind(file: File): 'image' | 'pdf' | 'dxf' | null {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension ?? '') &&
      ['image/png', 'image/jpeg', 'image/webp', ''].includes(file.type)) return 'image';
  if (extension === 'pdf' && ['application/pdf', ''].includes(file.type)) return 'pdf';
  if (extension === 'dxf' && ['', 'application/dxf', 'image/vnd.dxf', 'application/octet-stream', 'text/plain'].includes(file.type)) return 'dxf';
  return null;
}

function hasServerVisionKey(provider: VisionProvider): boolean {
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY?.trim());
  if (provider === 'gemini') return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export const runtime = 'nodejs';
export const maxDuration = 300;

export const POST = withApiHandler(
  {
    rateLimit: 'sld',
    checkOrigin: true,
    maxBodySize: (req) => (req.headers.get('content-type') ?? '').includes('multipart/form-data')
      ? DRAWING_MAX_BYTES + RULES_MAX_BYTES + (512 * 1024)
      : 256 * 1024,
  },
  async (req: NextRequest, ctx) => {
    const perf = startPerf('team-review');
    const requestScope = createRequestSignal(req.signal);
    try {
    const userId = await extractVerifiedUserId(req);
    const suppliedAuth = req.headers.has('authorization');
    if (suppliedAuth && !userId) {
      return ctx.error('ESVA-9401', '유효한 로그인이 필요합니다', 401);
    }

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
    let vision: {
      provider: VisionProvider;
      apiKey?: string;
      model?: string;
    } | undefined;

    // Multipart: 도면 파일 + 메타데이터
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const filePart = getFormFile(formData, 'file');
      if (!filePart.ok) {
        return ctx.error('ESVA-4400', filePart.message, 400);
      }
      const file = filePart.file;
      query = ctx.sanitize((formData.get('query') as string) ?? '') || undefined;
      projectName = ctx.sanitize((formData.get('projectName') as string) ?? '미지정 프로젝트');
      projectType = ctx.sanitize((formData.get('projectType') as string) ?? '전기 설비');

      const paramsStr = formData.get('params');
      if (typeof paramsStr === 'string' && paramsStr.length > 0) {
        // 무효 params를 조용히 버리면 사용자는 적용됐다고 오인한다 — rules와 동일 원칙
        try { params = JSON.parse(paramsStr); } catch {
          return ctx.error('ESVA-4400', 'params가 JSON이 아닙니다', 400);
        }
      }

      if (file) {
        if (file.size > DRAWING_MAX_BYTES) {
          return ctx.error('ESVA-4413', `도면 파일이 너무 큽니다 (최대 ${DRAWING_MAX_BYTES / 1024 / 1024}MB)`, 400);
        }
        const kind = drawingKind(file);
        if (!kind) {
          return ctx.error('ESVA-4415', 'PNG, JPG, WebP, PDF, DXF 도면만 검토할 수 있습니다', 400);
        }
        fileBuffer = await file.arrayBuffer();
        fileName = file.name;
        mimeType = file.type;

        if (kind === 'image') {
          const providerRaw = formData.get('provider');
          const provider = (typeof providerRaw === 'string' && providerRaw.trim()
            ? providerRaw.trim().toLowerCase()
            : 'openai') as VisionProvider;
          if (!VISION_PROVIDERS.has(provider)) {
            return ctx.error('ESVA-4400', '지원하지 않는 Vision 제공자입니다', 400);
          }
          const apiKeyRaw = formData.get('apiKey');
          const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw.trim() : '';
          if (apiKey.length > VISION_KEY_MAX_CHARS) {
            return ctx.error('ESVA-4400', 'Vision API 키 형식이 올바르지 않습니다', 400);
          }
          if (!apiKey && !userId) {
            return ctx.error('ESVA-9401', '비로그인 이미지 검토에는 Vision BYOK 키가 필요합니다', 401);
          }
          if (!apiKey && !hasServerVisionKey(provider)) {
            return ctx.error('ESVA-9401', '이미지 전문팀 검토에는 Vision BYOK 키가 필요합니다', 401);
          }
          const modelRaw = formData.get('model');
          const model = typeof modelRaw === 'string' ? modelRaw.trim() : '';
          if (model && !VISION_MODEL_PATTERN.test(model)) {
            return ctx.error('ESVA-4400', 'Vision 모델 이름 형식이 올바르지 않습니다', 400);
          }
          if (model && !apiKey && !isCatalogModel(provider, model)) {
            return ctx.error('ESVA-4400', '서버 Vision 키로 사용할 수 없는 모델입니다', 400);
          }
          vision = {
            provider,
            ...(apiKey ? { apiKey } : {}),
            ...(model ? { model } : {}),
          };
        }
      }

      // 사내 규정(선택) — 무효 룰셋을 조용히 버리고 검토를 진행하면 사용자는
      // "규정 대조가 됐다"고 오인한다. fail-closed: 오류 목록과 함께 400.
      // 문자열 파트면 .size가 undefined라 크기 캡 비교(undefined > N)가 항상
      // 통과했다 (독립 심사 발각) — getFormFile이 타입을 판별한다.
      const rulesPart = getFormFile(formData, 'rules');
      if (!rulesPart.ok) {
        return ctx.error('ESVA-4400', rulesPart.message, 400);
      }
      const rulesFile = rulesPart.file;
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
      // JSON 경로에서 rules를 조용히 무시하면 클라이언트는 대조가 됐다고
      // 오인한다 — 지원 경로(multipart)를 명시하고 거절 (독립 심사 발각).
      if (body.rules !== undefined) {
        return ctx.error('ESVA-4400', '사내 규정은 multipart form-data의 rules 파일 파트로만 첨부할 수 있습니다', 400);
      }
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
      vision,
      customRuleSet,
      signal: requestScope.signal,
    });

    perf.checkpoint('orchestrate');

    if (requestScope.timedOut()) {
      return ctx.error('ESVA-4504', '팀 리뷰 처리 시간이 초과되었습니다.', 504);
    }
    if (requestScope.signal.aborted) {
      return ctx.error('ESVA-4504', '요청이 중단되었습니다.', 499);
    }
    if (!result.success) {
      return ctx.error('ESVA-4500', result.error ?? '팀 리뷰 실행 실패', 500);
    }

    // 결과 전달이 완료된 뒤의 별도 명시 저장만 영속화할 수 있다. 이 request는
    // disconnect 시 remote write를 남기지 않도록 session-only report를 반환한다.
    const persistence = { attempted: false, saved: false };

    const durationMs = perf.end({ teamCount: result.teamResults.length });

    return ctx.ok({
      routing: {
        primaryTeam: result.routing.primaryTeam,
        supportTeams: result.routing.supportTeams,
        classification: result.routing.classification,
      },
      teamCount: result.teamResults.length,
      consensus: result.consensus,
      persistence,
      persisted: false,
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
      // 사내 규정 적용 정보 — 어떤 룰셋이 대조됐는지·린트 경고를 숨기지 않는다.
      // evaluatedBy: 실제로 사내규정 판정 행을 낸 팀. 빈 배열이면 룰셋이
      // 린트는 통과했으나 **아무 팀도 평가하지 않았다**는 뜻(예: layout 분류)
      // — "적용됨"으로 오인하지 않도록 명시한다 (독립 심사 발각).
      customRules: customRuleSet
        ? (() => {
            const label = customRuleSet.standardLabel ?? '사내규정';
            const evaluatedBy = result.teamResults
              .filter(tr => (tr.standards ?? []).some(s => s.standard === label))
              .map(tr => tr.teamId);
            return {
              name: customRuleSet.name,
              version: customRuleSet.version,
              articleCount: customRuleSet.articles.length,
              evaluated: evaluatedBy.length > 0,
              evaluatedBy,
              warnings: evaluatedBy.length > 0
                ? ruleWarnings
                : [...ruleWarnings, '이 입력 분류에서는 사내 규정이 평가되지 않았습니다 (SLD 도면 경로에서만 지원)'],
            };
          })()
        : null,
      durationMs,
    }, perfHeaders(durationMs));
    } finally {
      requestScope.dispose();
    }
  },
);
