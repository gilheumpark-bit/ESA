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

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
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
    const providerPart = formData.get('provider');
    const modelPart = formData.get('model');
    const apiKeyPart = formData.get('apiKey');
    const provider = typeof providerPart === 'string' && providerPart ? providerPart : 'openai';
    const model = typeof modelPart === 'string' ? modelPart.trim() : '';
    const apiKey = typeof apiKeyPart === 'string' ? apiKeyPart.trim() : '';

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required (BYOK).' }, { status: 401 });
    }
    if (!['openai', 'claude', 'gemini'].includes(provider)) {
      return NextResponse.json({ error: 'Unsupported Vision provider.' }, { status: 400 });
    }
    if (apiKey.length > 4096 || (model && !/^[a-zA-Z0-9._:/-]{1,128}$/.test(model))) {
      return NextResponse.json({ error: 'Invalid Vision credential parameters.' }, { status: 400 });
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(imageFile.type)) {
      return NextResponse.json({ error: `Invalid image type: ${imageFile.type}` }, { status: 400 });
    }
    if (imageFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large (max 20MB).' }, { status: 400 });
    }

    const blob = new Blob([await imageFile.arrayBuffer()], { type: imageFile.type });

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
      meta: { sagaStatus: sagaResult.status, steps: sagaResult.completedSteps },
    });

    if (sagaResult.status !== 'COMPLETED' || !analysis) {
      return NextResponse.json({
        error: 'SLD 공급자 분석을 완료하지 못했습니다. API 키·모델·파일을 확인하세요.',
        code: 'ESA-6001',
      }, { status: 502 });
    }

    const calcChain = generateCalcChainFromSLD(analysis);
    // 스캔/VLM 경로에도 검토(계산+기준+판정)를 붙인다. 단 추출 자체가 VLM
    // 판독(미검증·HOLD)이므로 vector 경로보다 caveat가 하나 더 겹친다 —
    // AT>AF 같은 표기 자체 오류는 유효하나, 케이블-차단기 판정은 오독 가능성을
    // 안고 본다. 구조를 못 읽은(confidence<0.5) 판독으로는 판정하지 않는다.
    // analysis는 saga 클로저에서 대입돼 TS 흐름상 never로 좁혀진다 — 위 COMPLETED
    // 가드로 non-null이 보장되므로 명시 캐스트로 타입을 회복한다(파일 관례).
    const analyzed = analysis as unknown as SLDAnalysis;
    const review = analyzed.confidence >= 0.5
      ? { ...reviewAnalysis(analyzed), extractionSource: 'VLM-scan (미검증·HOLD)' as const,
          disclaimer: '스캔 판독 기반 검토 — 추출값이 VLM 판독(미검증)이라 판정은 도면 원본 재확인이 필요합니다. 최종 판정·지시는 유자격 기술자의 몫입니다.' }
      : { skipped: true as const, reason: `confidence ${analyzed.confidence} — 구조 판독 미달로 검토 생략` };

    return NextResponse.json({
      success: true,
      data: analysis,
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
    return NextResponse.json(
      { error: 'SLD 공급자 분석을 완료하지 못했습니다. API 키·모델·파일을 확인하세요.', code: 'ESA-6001' },
      { status: 502 },
    );
  }
}
