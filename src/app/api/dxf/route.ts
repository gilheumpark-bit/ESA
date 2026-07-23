/**
 * ESVA DXF Upload API Endpoint
 * ──────────────────────────────
 * POST: DXF 파일 업로드 → 벡터 파싱 → TopologyGraph + 검증.
 * VLM 불필요. API 키 불필요. 순수 벡터 연산.
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { getFormFile, withApiHandler } from '@/lib/api';
import { NextRequest, NextResponse } from 'next/server';
import { parseDxfToSLD } from '@/engine/topology/dxf-parser';
import { buildTopologyFromSLD } from '@/engine/topology';
import { generateCalcChainFromSLD } from '@/lib/sld-recognition';
import { reviewAnalysis } from '@/engine/review/circuit-review';
import { apiLog, createRequestTimer } from '@/lib/api-logger';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { isRequestOriginAllowed } from '@/lib/request-origin';

export const runtime = 'nodejs';
const DXF_FILE_MAX_BYTES = 16 * 1024 * 1024;
const DXF_BODY_MAX_BYTES = DXF_FILE_MAX_BYTES + (1024 * 1024);

async function handlePost(req: NextRequest) {
  const timer = createRequestTimer();

  // 피처 플래그 확인
  if (!isFeatureEnabled('DRAWING_PARSER')) {
    return NextResponse.json(
      { error: 'DXF parsing is not enabled. Enable DRAWING_PARSER feature flag.' },
      { status: 403 },
    );
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
      // 여기로 온다 — "multipart가 아니다"로 단정하면 오진이다(PDF 라우트
      // 24.8MB 실도면 실측에서 발각된 동종 패턴).
      return NextResponse.json(
        { error: '요청 본문을 읽지 못했습니다 — multipart/form-data(file 필드에 .dxf)인지, 파일이 16MB 이하인지 확인하세요.' },
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

    if (dxfFile.size > DXF_FILE_MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 16MB).' }, { status: 413 });
    }

    const dxfContent = await dxfFile.text();
    const unitScalePart = formData.get('unitScale');
    let unitScale: number | undefined;
    if (unitScalePart != null && unitScalePart !== '') {
      if (typeof unitScalePart !== 'string') {
        return NextResponse.json({ error: 'unitScale must be a positive number.' }, { status: 400 });
      }
      unitScale = Number(unitScalePart);
      if (!Number.isFinite(unitScale) || unitScale <= 0 || unitScale > 1_000) {
        return NextResponse.json({ error: 'unitScale must be a positive number no greater than 1000.' }, { status: 400 });
      }
    }

    // 벡터 파싱 (VLM 없이)
    const analysis = parseDxfToSLD(dxfContent, unitScale ? { unitScale } : {});

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
    // 초급 하이브리드 검토 — PDF 라우트와 동일 계약(구조 신뢰 성립 시에만).
    // DXF 벡터 파스는 0.95가 정상 경로라 0.85 이상을 신뢰선으로 공유한다.
    const review = analysis.confidence >= 0.85
      ? reviewAnalysis(analysis)
      : { skipped: true as const, reason: `confidence ${analysis.confidence} — 구조 신뢰 미달로 부합 판정 생략` };

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
      review,
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
    apiLog({
      level: 'error',
      event: 'dxf-parse',
      route: '/api/dxf',
      error: err instanceof Error ? err.name : 'UnknownError',
      durationMs: timer.elapsed(),
    });
    return NextResponse.json(
      { error: 'DXF 도면을 처리하는 중 내부 오류가 발생했습니다.', code: 'ESA-9500' },
      { status: 500 },
    );
  }
}

export const POST = withApiHandler(
  { rateLimit: null, checkOrigin: false, maxBodySize: DXF_BODY_MAX_BYTES },
  handlePost,
);
