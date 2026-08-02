/**
 * ESVA SLD Analysis API Endpoint
 * --------------------------------
 * POST: multipart/form-data with diagram image
 * → SLDAnalysis + topology graph + calc chain
 * Saga 트랜잭션으로 래핑: VLM 분석 → 토폴로지 변환 → 검증.
 * 실패 시 어떤 단계에서 중단되었는지 명확히 반환.
 * BYOK required (Vision LLM).
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { getFormFile } from '@/lib/api';
import { NextRequest, NextResponse } from 'next/server';
import { analyzeSLD, generateCalcChainFromSLD, type SLDAnalysis } from '@/lib/sld-recognition';
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

/**
 * 공급자 실패를 사용자가 무엇을 해야 하는지로 번역한다.
 *
 * 그동안 어떤 실패든 "API 키·모델·파일을 확인하세요" 한 줄이었다. 실측
 * 2026-07-27: Gemini 가 503(과부하)을 냈는데 그 문구가 떠서, 멀쩡한 키를 직접
 * 조회해 보고(모델 50 개 정상 응답) 파일 크기를 대조하는 데 몇 분을 썼다.
 * 원인이 상대편에 있는데 이쪽을 뒤지게 만드는 문구는 오답보다 나쁠 때가 있다.
 *
 * 재시도로 풀리는 것(과부하·한도)과 설정을 고쳐야 하는 것(키·요청)을 가른다.
 */
export function classifyProviderFailure(raw: string | undefined): {
  message: string; code: string; status: number; retryable: boolean;
} {
  const text = raw ?? '';
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
  if (httpCode === '401' || httpCode === '403' || /api.?key|unauthor|permission/i.test(text)) {
    return {
      message: 'AI 공급자가 인증을 거부했습니다. API 키를 확인하세요.',
      code: 'ESA-6002', status: 502, retryable: false,
    };
  }
  // 분류가 안 되면 **원문을 붙이지 않는다.** 처음엔 단서를 주려고 원문을 잘라
  // 넣었는데 기존 보안 테스트(`SLD saga diagnostics stay server-side`)가 잡았다 —
  // 공급자 오류 문자열에는 내부 경로·키 조각·모델명이 섞여 나올 수 있다.
  // 원문은 서버 로그에만 남기고 클라이언트에는 분류만 준다.
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
    if (!imagePart.ok) {
      return NextResponse.json({ error: imagePart.message }, { status: 400 });
    }
    const imageFile = imagePart.file;
    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
    }
    let vision;
    try {
      vision = await resolveDrawingVisionRequest(formData, req, false);
    } catch (error) {
      if (error instanceof DrawingVisionRequestError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
    if (!vision) {
      return NextResponse.json({ error: 'API key required (BYOK).' }, { status: 401 });
    }
    const provider = vision.provider;
    const model = vision.model ?? '';
    const apiKey = 'apiKey' in vision ? vision.apiKey : '';
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(imageFile.type)) {
      return NextResponse.json({ error: `Invalid image type: ${imageFile.type}` }, { status: 400 });
    }
    if (imageFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large (max 20MB).' }, { status: 400 });
    }

    // 선언된 MIME 은 클라이언트가 붙인 문자열이다. 바이트로 다시 본다.
    const bytes = new Uint8Array(await imageFile.arrayBuffer());
    const signature = checkRasterImage(bytes);
    if (!signature.ok) {
      return NextResponse.json({ error: signature.message, code: 'ESA-4002' }, { status: 400 });
    }

    /**
     * **글자 선명도를 먼저 잰다.** AI 를 부르기 전이다.
     *
     * 실측: 같은 스캔 이미지·같은 모델로 두 번 돌렸더니 변압기를 300kVA 와
     * 1000kVA 로 읽었다(실제 500kVA). 그리고 그 답의 문서 confidence 는 0.9
     * 였다 — 못 읽었다는 신호가 응답 어디에도 없었다.
     *
     * 막지는 않는다. 이 제품은 판단을 대신하지 않으므로, **읽히지 않는다는
     * 사실을 함께 실어 보낸다.** 화면이 스펙 수치에 그 경고를 붙일 수 있다.
     */
    const textQuality = await measureTextQuality(bytes);

    const blob = new Blob([bytes], { type: signature.type });

    // Saga: VLM 분석 → 토폴로지 변환 → 검증 (3단계 원자적 실행)
    let analysis: SLDAnalysis | null = null;
    let topology: TopologyGraph | null = null;
    let validation: ValidationResult | null = null;

    const saga = new SagaOrchestrator('sld-analysis');

    saga.addStep({
      name: 'vlm-analyze',
      execute: async () => {
        analysis = await analyzeSLD(blob, { provider, model, apiKey });
        return analysis;
      },
      compensate: async () => { /* VLM 호출은 부작용 없음 */ },
    });

    saga.addStep({
      name: 'build-topology',
      execute: async () => {
        topology = buildTopologyFromSLD(analysis!);
        return topology;
      },
      compensate: async () => { /* 인메모리 그래프 — 롤백 불필요 */ },
    });

    saga.addStep({
      name: 'validate-topology',
      execute: async () => {
        validation = topology!.validate();
        return validation;
      },
      compensate: async () => { /* 검증은 읽기 전용 */ },
    });

    const sagaResult = await saga.execute();

    apiLog({
      level: sagaResult.status === 'COMPLETED' ? 'info' : 'warn',
      event: 'sld-analysis',
      route: '/api/sld',
      provider,
      model,
      durationMs: timer.elapsed(),
      // 공급자 원문을 **여기 남긴다.** `classifyProviderFailure` 주석은
      // "원문은 서버 로그에만 남기고 클라이언트에는 분류만 준다" 고 하는데,
      // 정작 로그에 안 실려 원문이 통째로 사라지고 있었다(2026-07-28 실측:
      // 503 을 열 번 넘게 받고도 로그에 sagaStatus·steps 뿐이라 공급자
      // 과부하인지 다른 원인인지 가릴 수 없었다).
      //
      // `apiLog` 는 `error` 필드에 redactSecrets 를 걸므로 키가 섞여 있어도
      // 마스킹된다 — 클라이언트로 나가는 것은 여전히 분류뿐이다.
      ...(sagaResult.error ? { error: sagaResult.error } : {}),
      meta: {
        sagaStatus: sagaResult.status,
        steps: sagaResult.completedSteps,
        ...(sagaResult.failedStep ? { failedStep: sagaResult.failedStep } : {}),
      },
    });

    if (sagaResult.status !== 'COMPLETED' || !analysis) {
      // 사가는 failedStep·error 를 갖고 있는데 그동안 버리고 일반 문구만 냈다.
      // 실측 2026-07-27: 공급자가 503(과부하)을 냈는데 화면에는 "API 키·모델·
      // 파일을 확인하세요" 가 떴다 — 멀쩡한 키와 파일을 몇 분간 뒤졌다.
      const failure = classifyProviderFailure(sagaResult.error);
      return NextResponse.json({
        error: failure.message,
        code: failure.code,
        ...(failure.retryable ? { retryable: true } : {}),
      }, { status: failure.status });
    }

    const calcChain = generateCalcChainFromSLD(analysis);
    // 스캔/VLM 경로에도 검토(계산+기준+판정)를 붙인다. 단 추출 자체가 VLM
    // 판독(미검증·HOLD)이므로 vector 경로보다 caveat가 하나 더 겹친다 —
    // AT>AF 같은 표기 자체 오류는 유효하나, 케이블-차단기 판정은 오독 가능성을
    // 안고 본다. 구조를 못 읽은(confidence<0.5) 판독으로는 판정하지 않는다.
    // analysis는 saga 클로저에서 대입돼 TS 흐름상 never로 좁혀진다 — 위 COMPLETED
    // 가드로 non-null이 보장되므로 명시 캐스트로 타입을 회복한다(파일 관례).
    const analyzed = analysis as unknown as SLDAnalysis;
    // 계통 판독 상태 — 사가의 validate 단계가 이미 세는 값이다. 그동안
    // 응답에 실어 보내고 **화면이 통째로 버렸다**(2026-07-28 실측: src 전체에
    // `topology` 소비처 0). 검토 패널에 같이 실어 읽히게 한다 — 부품 목록만
    // 보고 계통까지 읽힌 것으로 오해하는 것이 이 경로의 실패 모드다.
    const stats = validation!.stats;
    const danglingEdges = validation!.issues.filter((i) => i.type === 'MISSING_EDGE_TARGET').length;
    const danglingInlineDevices = validation!.issues.filter((i) => i.type === 'DANGLING_INLINE_DEVICE').length;
    const duplicateFlowMeasurements = validation!.issues.filter((i) => i.type === 'DUPLICATE_FLOW_MEASUREMENT').length;
    const topologyReadout = {
      nodes: stats.nodeCount,
      edges: stats.edgeCount,
      isolated: stats.isolatedNodes,
      fragments: stats.connectedComponents,
      ...(danglingEdges > 0 ? { danglingEdges } : {}),
      ...(danglingInlineDevices > 0 ? { danglingInlineDevices } : {}),
      ...(duplicateFlowMeasurements > 0 ? { duplicateFlowMeasurements } : {}),
    };
    const review = analyzed.confidence >= 0.5
      ? { ...reviewAnalysis(analyzed), extractionSource: 'VLM-scan (미검증·HOLD)' as const,
          topology: topologyReadout,
          disclaimer: '스캔 판독 기반 검토 — 추출값이 VLM 판독(미검증)이라 판정은 도면 원본 재확인이 필요합니다. 최종 판정·지시는 유자격 기술자의 몫입니다.' }
      : { skipped: true as const, reason: `confidence ${analyzed.confidence} — 구조 판독 미달로 검토 생략`,
          topology: topologyReadout };

    return NextResponse.json({
      success: true,
      data: analysis,
      // 스펙 수치를 믿어도 되는지 — 화면이 이걸 보고 경고를 붙인다.
      textQuality,
      /**
       * 읽은 값들끼리 맞는지. **품질이 나빠도 여기서 멈추지 않는다** —
       * 못 읽은 용량을 옆 차단기가 구속하므로, 거절 대신 범위를 낸다.
       */
      constraints: deriveConstraints(analyzed.components ?? []),
      calcChain,
      review,
      topology: {
        nodeCount: validation!.stats.nodeCount,
        edgeCount: validation!.stats.edgeCount,
        connectedComponents: validation!.stats.connectedComponents,
        isolatedNodes: validation!.stats.isolatedNodes,
        valid: validation!.valid,
        issues: validation!.issues,
      },
      saga: {
        status: sagaResult.status,
        steps: sagaResult.completedSteps,
        durationMs: sagaResult.durationMs,
      },
    });
  } catch (err) {
    apiLog({
      level: 'error',
      event: 'sld-analysis',
      route: '/api/sld',
      error: err instanceof Error ? err.name : 'UnknownError',
      durationMs: timer.elapsed(),
    });
    const failure = classifyProviderFailure(err instanceof Error ? err.message : undefined);
    return NextResponse.json(
      { error: failure.message, code: failure.code, ...(failure.retryable ? { retryable: true } : {}) },
      { status: failure.status },
    );
  }
}

export const POST = withRequestLog(POST__impl);
