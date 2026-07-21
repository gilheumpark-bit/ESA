/**
 * ESVA PDF Drawing Analysis API
 * ────────────────────────────────
 * POST: PDF 도면 업로드 → 벡터 파싱 → TopologyGraph + 검증.
 * VLM 불필요. API 키 불필요. 순수 벡터 연산.
 * CAD에서 출력(Plot)한 PDF의 내부 좌표를 직접 추출.
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { getFormFile } from '@/lib/api';
import { NextRequest, NextResponse } from 'next/server';
import { parsePdfToSLD } from '@/engine/topology/pdf-vector-parser';
import { buildTopologyFromSLD } from '@/engine/topology';
import { generateCalcChainFromSLD } from '@/lib/sld-recognition';
import { apiLog, createRequestTimer } from '@/lib/api-logger';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { isRequestOriginAllowed } from '@/lib/request-origin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const timer = createRequestTimer();

  if (!isFeatureEnabled('DRAWING_PARSER')) {
    return NextResponse.json({ error: 'PDF drawing parser not enabled.' }, { status: 403 });
  }

  try {
    if (!isRequestOriginAllowed(req.headers.get('origin'), req.url, undefined, req.headers.get('host'), req.headers.get('x-forwarded-proto'))) {
      return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
    }
    const blocked = applyRateLimit(req, 'dxf');
    if (blocked) return blocked;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      // 비multipart 요청뿐 아니라 프록시 본문 캡 초과로 절단된 multipart도
      // 여기로 온다 — "multipart가 아니다"로 단정하면 오진이다(24.8MB 실도면
      // 실측 발각). 원인 중립으로 안내한다.
      return NextResponse.json(
        { error: '요청 본문을 읽지 못했습니다 — multipart/form-data(file 필드에 .pdf)인지, 파일이 100MB 이하인지 확인하세요.' },
        { status: 400 },
      );
    }
    const pdfPart = getFormFile(formData, 'file');
    if (!pdfPart.ok) {
      return NextResponse.json({ error: pdfPart.message }, { status: 400 });
    }
    const pdfFile = pdfPart.file;

    if (!pdfFile) {
      return NextResponse.json({ error: 'No PDF file provided.' }, { status: 400 });
    }

    if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only .pdf files are accepted.' }, { status: 400 });
    }

    if (pdfFile.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 100MB).' }, { status: 400 });
    }

    const pagePart = formData.get('page');
    const pageNumber = pagePart == null || pagePart === '' ? 1 : Number(pagePart);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 10_000) {
      return NextResponse.json({ error: 'page must be an integer between 1 and 10000.' }, { status: 400 });
    }
    const pdfBytes = await pdfFile.arrayBuffer();

    const analysis = await parsePdfToSLD(pdfBytes, { pageNumber });

    // DXF 라우트와 동일 계약 — 파싱 실패는 success:true가 아니라 400이다.
    if (analysis.confidence === 0 && analysis.components.length === 0) {
      apiLog({
        level: 'warn', event: 'pdf-drawing-parse', route: '/api/pdf-drawing',
        error: analysis.rawDescription, durationMs: timer.elapsed(),
      });
      return NextResponse.json(
        { error: 'PDF를 읽을 수 없습니다. 파일이 손상됐거나, 해당 페이지가 없거나, 스캔/이미지 도면(벡터 정보 없음)입니다.', detail: analysis.rawDescription },
        { status: 400 },
      );
    }

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
    apiLog({
      level: 'error',
      event: 'pdf-drawing-parse',
      route: '/api/pdf-drawing',
      error: err instanceof Error ? err.name : 'UnknownError',
      durationMs: timer.elapsed(),
    });
    return NextResponse.json(
      { error: 'PDF 도면을 처리하는 중 내부 오류가 발생했습니다.', code: 'ESA-9500' },
      { status: 500 },
    );
  }
}
