/**
 * ESVA SLD Analysis API Endpoint
 * POST multipart/form-data: image extraction → topology → validation.
 * Luna's experimental compact path returns extraction evidence only.
 */

import { buildQuickDrawingReadout } from '@/lib/quick-drawing-readout';
import { applyRateLimit } from '@/lib/rate-limit';
import { getFormFile } from '@/lib/api';
import { NextRequest, NextResponse } from 'next/server';
import { analyzeSLD, generateCalcChainFromSLD, type SLDAnalysis } from '@/lib/sld-recognition';
import { analyzeSLDWithLunaFastPath, isLunaSldFastPathEnabled } from '@/lib/sld-luna-fast-path';
import { LUNA_REDUCED_SCOPE_WARNING } from '@/lib/sld-luna-output';
import { reviewAnalysis } from '@/engine/review/circuit-review';
import { buildTopologyFromSLD, type TopologyGraph, type ValidationResult } from '@/engine/topology';
import { SagaOrchestrator } from '@/lib/saga-transaction';
import { apiLog, createRequestTimer } from '@/lib/api-logger';
import { isRequestOriginAllowed } from '@/lib/request-origin';
import { withRequestLog } from '@/lib/api/with-request-log';
import { checkRasterImage } from '@/lib/image-signature';
import { measureTextQuality } from '@/lib/drawing-text-quality';
import { deriveConstraints } from '@/engine/review/cross-constraint';
import {
  DrawingVisionRequestError,
  resolveDrawingVisionRequest,
} from '@/lib/drawing-vision-request';

/** Classify failures without exposing provider prose or request secrets. */
export function classifyProviderFailure(raw: string | undefined): {
  message: string; code: string; status: number; retryable: boolean;
} {
  const text = raw ?? '';
  if (text.includes('LUNA_CANCELLED')) {
    return { message: '도면 분석 요청이 취소되었습니다.', code: 'LUNA_CANCELLED', status: 499, retryable: false };
  }
  if (text.includes('LUNA_TIMEOUT')) {
    return { message: '도면 분석 제한시간을 초과했습니다. 분석 구역을 줄여 다시 요청하세요.', code: 'LUNA_TIMEOUT', status: 504, retryable: false };
  }
  if (text.includes('LUNA_REFUSED')) {
    return { message: 'AI 공급자가 이 도면 요청에 응답하지 않았습니다. 자동 재호출하지 않았습니다.', code: 'LUNA_REFUSED', status: 422, retryable: false };
  }
  if (text.includes('LUNA_EMPTY_RESULT')) {
    return { message: '두 차례 판독에서 사용할 수 있는 기기를 찾지 못했습니다. 도면 원본과 분석 구역을 확인하세요.', code: 'LUNA_EMPTY_RESULT', status: 422, retryable: false };
  }
  if (text.includes('LUNA_INVALID_OUTPUT') || text.includes('LUNA_RESPONSE_LIMIT')) {
    return { message: 'AI 응답이 불완전하거나 허용 크기를 초과해 판독 결과로 사용하지 않았습니다.', code: 'LUNA_INVALID_OUTPUT', status: 502, retryable: false };
  }
  const httpCode = /(?:error|status)\s*(\d{3})/i.exec(text)?.[1];
  if (httpCode === '503' || /overload|unavailable|과부하/i.test(text)) {
    return {
      message: 'AI 공급자가 일시적으로 응답하지 못했습니다(과부하). 잠시 후 다시 시도하세요 — 키·파일 설정 문제가 아닙니다.',
      code: 'ESA-6003', status: 503, retryable: true,
    };
  }
  if (httpCode === '429' || /rate.?limit|quota|exceeded/i.test(text)) {
    return {
      message: 'AI 공급자 호출 한도에 걸렸습니다. 잠시 후 다시 시도하거나 다른 키를 사용하세요.',
      code: 'ESA-6004', status: 429, retryable: true,
    };
  }
  if (text.includes('LUNA_AUTH_REQUIRED') || httpCode === '401' || httpCode === '403' || /api.?key|unauthor|permission/i.test(text)) {
    return {
      message: 'AI 공급자가 인증을 거부했습니다. API 키 또는 로컬 계정 연결을 확인하세요.',
      code: 'ESA-6002', status: 502, retryable: false,
    };
  }
  return {
    message: 'SLD 공급자 분석을 완료하지 못했습니다. 잠시 후 다시 시도하고, 계속되면 API 키와 파일 형식을 확인하세요.',
    code: 'ESA-6001', status: 502, retryable: false,
  };
}

export const runtime = 'nodejs';

async function POST__impl(req: NextRequest) {
  const timer = createRequestTimer();
  try {
    if (!isRequestOriginAllowed(req.headers.get('origin'), req.url, undefined, req.headers.get('host'), req.headers.get('x-forwarded-proto'))) {
      return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
    }
    const blocked = applyRateLimit(req, 'sld');
    if (blocked) return blocked;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: '도면 요청 본문을 읽을 수 없습니다.', code: 'ESA-4001' },
        { status: 400 },
      );
    }
    const imagePart = getFormFile(formData, 'image');
    if (!imagePart.ok) return NextResponse.json({ error: imagePart.message }, { status: 400 });
    const imageFile = imagePart.file;
    if (!imageFile) return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
    let vision;
    try {
      vision = await resolveDrawingVisionRequest(formData, req, false);
    } catch (error) {
      if (error instanceof DrawingVisionRequestError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
    if (!vision) return NextResponse.json({ error: 'API key required (BYOK).' }, { status: 401 });
    const provider = vision.provider;
    const model = vision.model ?? '';
    const effort = vision.effort;
    const apiKey = 'apiKey' in vision ? vision.apiKey : '';
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(imageFile.type)) {
      return NextResponse.json({ error: `Invalid image type: ${imageFile.type}` }, { status: 400 });
    }
    if (imageFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large (max 20MB).' }, { status: 400 });
    }
    const bytes = new Uint8Array(await imageFile.arrayBuffer());
    const signature = checkRasterImage(bytes);
    if (!signature.ok) {
      return NextResponse.json({ error: signature.message, code: 'ESA-4002' }, { status: 400 });
    }
    // Text quality is an independent input warning, not model confidence.
    const textQuality = await measureTextQuality(bytes);
    const blob = new Blob([bytes], { type: signature.type });
    const useLunaFastPath = isLunaSldFastPathEnabled(provider, model);
    if (useLunaFastPath && vision.effortProfile) {
      return NextResponse.json({ error: 'Luna 경량 판독은 역할별 추론 프로필을 지원하지 않습니다. 전체 문서 분석을 사용하세요.' }, { status: 400 });
    }

    let analysis: SLDAnalysis | null = null;
    let topology: TopologyGraph | null = null;
    let validation: ValidationResult | null = null;
    const saga = new SagaOrchestrator('sld-analysis');
    saga.addStep({
      name: 'vlm-analyze',
      execute: async () => {
        const result = useLunaFastPath
          ? await analyzeSLDWithLunaFastPath(blob, { provider, model, apiKey, effort, signal: req.signal })
          : await analyzeSLD(blob, { provider, model, apiKey });
        analysis = useLunaFastPath ? {
          ...result, suggestedCalculations: [],
          warnings: [...new Set([...(result.warnings ?? []), LUNA_REDUCED_SCOPE_WARNING])],
        } : result;
        return analysis;
      },
      // A completed provider call may be billed; compensation cannot undo it.
      compensate: async () => {},
    });
    saga.addStep({
      name: 'build-topology',
      execute: async () => {
        topology = buildTopologyFromSLD(analysis!);
        return topology;
      },
      compensate: async () => {},
    });
    saga.addStep({
      name: 'validate-topology',
      execute: async () => {
        validation = topology!.validate();
        return validation;
      },
      compensate: async () => {},
    });
    const sagaResult = await saga.execute();
    apiLog({
      level: sagaResult.status === 'COMPLETED' ? 'info' : 'warn',
      event: 'sld-analysis', route: '/api/sld', provider, model, durationMs: timer.elapsed(),
      // apiLog redacts secrets; provider prose is never appended to client errors.
      ...(sagaResult.error ? { error: sagaResult.error } : {}),
      meta: {
        sagaStatus: sagaResult.status, steps: sagaResult.completedSteps,
        analysisPath: useLunaFastPath ? 'luna-fast' : 'standard',
        ...(sagaResult.failedStep ? { failedStep: sagaResult.failedStep } : {}),
      },
    });
    if (sagaResult.status !== 'COMPLETED' || !analysis) {
      const failure = classifyProviderFailure(sagaResult.error);
      return NextResponse.json({
        error: failure.message, code: failure.code,
        ...(failure.retryable ? { retryable: true } : {}),
      }, { status: failure.status });
    }

    // Saga callbacks assign analysis. Restore its type only after the success guard.
    const analyzed = analysis as unknown as SLDAnalysis;
    const extractionOnly = useLunaFastPath || Boolean(analyzed.warnings?.includes(LUNA_REDUCED_SCOPE_WARNING));
    const calcChain = extractionOnly ? [] : generateCalcChainFromSLD(analysis);
    const stats = validation!.stats;
    const danglingEdges = validation!.issues.filter((i) => i.type === 'MISSING_EDGE_TARGET').length;
    const danglingInlineDevices = validation!.issues.filter((i) => i.type === 'DANGLING_INLINE_DEVICE').length;
    const duplicateFlowMeasurements = validation!.issues.filter((i) => i.type === 'DUPLICATE_FLOW_MEASUREMENT').length;
    const topologyReadout = {
      nodes: stats.nodeCount, edges: stats.edgeCount,
      isolated: stats.isolatedNodes, fragments: stats.connectedComponents,
      ...(danglingEdges > 0 ? { danglingEdges } : {}),
      ...(danglingInlineDevices > 0 ? { danglingInlineDevices } : {}),
      ...(duplicateFlowMeasurements > 0 ? { duplicateFlowMeasurements } : {}),
    };
    const review = extractionOnly
      ? { skipped: true as const, reason: 'Luna 축약 판독 초안 — 원본 대조 전 자동 계산·안전 판정을 수행하지 않습니다.', topology: topologyReadout }
      : analyzed.confidence >= 0.5
        ? { ...reviewAnalysis(analyzed), extractionSource: 'VLM-scan (미검증·HOLD)' as const,
            topology: topologyReadout,
            disclaimer: '스캔 판독 기반 검토 — 추출값이 VLM 판독(미검증)이라 판정은 도면 원본 재확인이 필요합니다. 최종 판정·지시는 유자격 기술자의 몫입니다.' }
        : { skipped: true as const, reason: `confidence ${analyzed.confidence} — 구조 판독 미달로 검토 생략`, topology: topologyReadout };

    return NextResponse.json({
      success: true,
      data: extractionOnly ? { ...analyzed, suggestedCalculations: [] } : analysis,
      readout: buildQuickDrawingReadout(analysis), textQuality,
      constraints: extractionOnly ? [] : deriveConstraints(analyzed.components ?? []),
      calcChain, review,
      ...(extractionOnly ? { analysisMode: 'luna-extraction-only', requiresReview: true } : {}),
      topology: {
        nodeCount: validation!.stats.nodeCount,
        edgeCount: validation!.stats.edgeCount,
        connectedComponents: validation!.stats.connectedComponents,
        isolatedNodes: validation!.stats.isolatedNodes,
        valid: validation!.valid && (!extractionOnly || stats.nodeCount > 0),
        issues: validation!.issues,
      },
      saga: { status: sagaResult.status, steps: sagaResult.completedSteps, durationMs: sagaResult.durationMs },
    });
  } catch (err) {
    apiLog({
      level: 'error', event: 'sld-analysis', route: '/api/sld',
      error: err instanceof Error ? err.name : 'UnknownError', durationMs: timer.elapsed(),
    });
    const failure = classifyProviderFailure(err instanceof Error ? err.message : undefined);
    return NextResponse.json(
      { error: failure.message, code: failure.code, ...(failure.retryable ? { retryable: true } : {}) },
      { status: failure.status },
    );
  }
}

export const POST = withRequestLog(POST__impl);
