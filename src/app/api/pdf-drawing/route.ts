/**
 * ESVA PDF Drawing Analysis API
 * ────────────────────────────────
 * POST: PDF 도면 업로드 → 벡터 파싱 → TopologyGraph + 검증.
 * VLM 불필요. API 키 불필요. 순수 벡터 연산.
 * CAD에서 출력(Plot)한 PDF의 내부 좌표를 직접 추출.
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { parsePdfToSLD } from '@/engine/topology/pdf-vector-parser';
import { buildTopologyFromSLD } from '@/engine/topology';
import { generateCalcChainFromSLD } from '@/lib/sld-recognition';
import { apiLog, createRequestTimer } from '@/lib/api-logger';
import { isFeatureEnabled } from '@/lib/feature-flags';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const timer = createRequestTimer();

  if (!isFeatureEnabled('DRAWING_PARSER')) {
    return NextResponse.json({ error: 'PDF drawing parser not enabled.' }, { status: 403 });
  }

  try {
    const blocked = applyRateLimit(req, 'dxf');
    if (blocked) return blocked;

    const formData = await req.formData();
    const pdfFile = formData.get('file') as File | null;

    if (!pdfFile) {
      return NextResponse.json({ error: 'No PDF file provided.' }, { status: 400 });
    }

    if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only .pdf files are accepted.' }, { status: 400 });
    }

    if (pdfFile.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 100MB).' }, { status: 400 });
    }

    const pageNumber = parseInt((formData.get('page') as string) || '1');
    const pdfBytes = await pdfFile.arrayBuffer();

    const analysis = await parsePdfToSLD(pdfBytes, { pageNumber });
    const topology = buildTopologyFromSLD(analysis);
    const validation = topology.validate();
    const calcChain = generateCalcChainFromSLD(analysis);

    apiLog({
      level: 'info', event: 'pdf-drawing-parse', route: '/api/pdf-drawing',
      durationMs: timer.elapsed(),
      meta: { components: analysis.components.length, connections: analysis.connections.length, valid: validation.valid },
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
        method: 'pdf-vector',
        confidence: analysis.confidence,
        description: analysis.rawDescription,
        durationMs: timer.elapsed(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF drawing parse failed';
    apiLog({ level: 'error', event: 'pdf-drawing-parse', route: '/api/pdf-drawing', error: message, durationMs: timer.elapsed() });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
