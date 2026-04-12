/**
 * ESVA DXF Upload API Endpoint
 * ──────────────────────────────
 * POST: DXF 파일 업로드 → 벡터 파싱 → TopologyGraph + 검증.
 * VLM 불필요. API 키 불필요. 순수 벡터 연산.
 */

import { applyRateLimit } from '@/lib/rate-limit';
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

    const formData = await req.formData();
    const dxfFile = formData.get('file') as File | null;

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
