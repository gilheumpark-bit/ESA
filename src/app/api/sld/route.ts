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
import { NextRequest, NextResponse } from 'next/server';
import { analyzeSLD, generateCalcChainFromSLD, type SLDAnalysis } from '@/lib/sld-recognition';
import { buildTopologyFromSLD, type TopologyGraph, type ValidationResult } from '@/engine/topology';
import { SagaOrchestrator } from '@/lib/saga-transaction';
import { apiLog, createRequestTimer } from '@/lib/api-logger';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const timer = createRequestTimer();

  try {
    const blocked = applyRateLimit(req, 'sld');
    if (blocked) return blocked;

    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;
    const provider = (formData.get('provider') as string) || 'openai';
    const model = (formData.get('model') as string) || '';
    const apiKey = (formData.get('apiKey') as string) || '';

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required (BYOK).' }, { status: 401 });
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
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
        error: `SLD 분석 실패 (단계: ${sagaResult.failedStep})`,
        sagaError: sagaResult.error,
        completedSteps: sagaResult.completedSteps,
      }, { status: 500 });
    }

    const calcChain = generateCalcChainFromSLD(analysis);

    return NextResponse.json({
      success: true,
      data: analysis,
      calcChain,
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
    const message = err instanceof Error ? err.message : 'SLD analysis failed';
    apiLog({ level: 'error', event: 'sld-analysis', route: '/api/sld', error: message, durationMs: timer.elapsed() });
    const status = message.includes('401') || message.includes('403') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
