/**
 * ESVA DXF Upload API Endpoint
 * ──────────────────────────────
 * POST: DXF 파일 업로드 → 벡터 파싱 → TopologyGraph + 검증.
 * VLM 불필요. API 키 불필요. 순수 벡터 연산.
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { getFormFile } from '@/lib/api';
import { NextRequest, NextResponse } from 'next/server';
import { parseDxfToSLD } from '@/engine/topology/dxf-parser';
import { buildTopologyFromSLD } from '@/engine/topology';
import { generateCalcChainFromSLD } from '@/lib/sld-recognition';
import { apiLog, createRequestTimer } from '@/lib/api-logger';
import { isFeatureEnabled } from '@/lib/feature-flags';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const timer = createRequestTimer();

  // 피처 플래그 확인
  if (!isFeatureEnabled('DRAWING_PARSER')) {
    return NextResponse.json(
      { error: 'DXF parsing is not enabled. Enable DRAWING_PARSER feature flag.' },
      { status: 403 },
    );
  }

  try {
    const blocked = applyRateLimit(req, 'dxf');
    if (blocked) return blocked;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      // multipart가 아닌 요청(빈 본문 등)은 서버 오류가 아니라 클라이언트 오류
      return NextResponse.json(
        { error: 'multipart/form-data 요청이 필요합니다 (file 필드에 .dxf).' },
        { status: 400 },
      );
    }
    // as File 무검증 캐스팅이면 문자열 파트에서 .name/.size 접근이 500으로 터진다
    const dxfPart = getFormFile(formData, 'file');
    if (!dxfPart.ok) {
      return NextResponse.json({ error: dxfPart.message }, { status: 400 });
    }
    const dxfFile = dxfPart.file;

    if (!dxfFile) {
      return NextResponse.json({ error: 'No DXF file provided.' }, { status: 400 });
    }

    if (!dxfFile.name.toLowerCase().endsWith('.dxf')) {
      return NextResponse.json({ error: 'Only .dxf files are accepted.' }, { status: 400 });
    }

    if (dxfFile.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 50MB).' }, { status: 400 });
    }

    const dxfContent = await dxfFile.text();
    const unitScale = parseFloat((formData.get('unitScale') as string) || '0.001');

    // 벡터 파싱 (VLM 없이)
    const analysis = parseDxfToSLD(dxfContent, { unitScale });

    // 파싱 실패를 success:true로 넘기면 사용자는 "빈 도면"과 "잘못된 파일"을
    // 구분할 수 없다. 파서는 confidence 0으로 신호하고, 라우트가 이를 400으로
    // 번역한다 (서버 장애가 아니라 입력 문제이므로 500이 아니다).
    if (analysis.confidence === 0 && analysis.components.length === 0) {
      apiLog({
        level: 'warn', event: 'dxf-parse', route: '/api/dxf',
        error: analysis.rawDescription, durationMs: timer.elapsed(),
      });
      return NextResponse.json(
        { error: 'DXF 파일을 읽을 수 없습니다. 파일이 손상됐거나 DXF 형식이 아닙니다.', detail: analysis.rawDescription },
        { status: 400 },
      );
    }

    const topology = buildTopologyFromSLD(analysis);
    const validation = topology.validate();
    const calcChain = generateCalcChainFromSLD(analysis);

    apiLog({
      level: 'info',
      event: 'dxf-parse',
      route: '/api/dxf',
      durationMs: timer.elapsed(),
      meta: {
        components: analysis.components.length,
        connections: analysis.connections.length,
        valid: validation.valid,
      },
    });

    return NextResponse.json({
      success: true,
      data: analysis,
      calcChain,
      topology: {
        nodeCount: validation.stats.nodeCount,
        edgeCount: validation.stats.edgeCount,
        connectedComponents: validation.stats.connectedComponents,
        isolatedNodes: validation.stats.isolatedNodes,
        valid: validation.valid,
        issues: validation.issues,
      },
      parserInfo: {
        method: 'vector',
        confidence: analysis.confidence,
        description: analysis.rawDescription,
        durationMs: timer.elapsed(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DXF parse failed';
    apiLog({ level: 'error', event: 'dxf-parse', route: '/api/dxf', error: message, durationMs: timer.elapsed() });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
