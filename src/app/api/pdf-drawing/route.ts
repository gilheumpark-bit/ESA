/**
 * ESVA PDF Drawing Analysis API
 * ────────────────────────────────
 * POST: PDF 도면 업로드 → 벡터 파싱 → TopologyGraph + 검증.
 * VLM 불필요. API 키 불필요. 순수 벡터 연산.
 * CAD에서 출력(Plot)한 PDF의 내부 좌표를 직접 추출.
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { getFormFile, withApiHandler } from '@/lib/api';
import { NextRequest, NextResponse } from 'next/server';
import { parsePdfToSLD } from '@/engine/topology/pdf-vector-parser';
import { buildTopologyFromSLD } from '@/engine/topology';
import { generateCalcChainFromSLD } from '@/lib/sld-recognition';
import { reviewAnalysis, reviewScheduleTables } from '@/engine/review/circuit-review';
import { apiLog, createRequestTimer } from '@/lib/api-logger';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { isRequestOriginAllowed } from '@/lib/request-origin';

export const runtime = 'nodejs';
const PDF_FILE_MAX_BYTES = 32 * 1024 * 1024;
const PDF_BODY_MAX_BYTES = PDF_FILE_MAX_BYTES + (2 * 1024 * 1024);

async function handlePost(req: NextRequest) {
  const timer = createRequestTimer();

  if (!isFeatureEnabled('DRAWING_PARSER')) {
    return NextResponse.json({ error: '이 배포에서는 PDF 도면 파싱이 꺼져 있습니다. 관리자에게 DRAWING_PARSER 기능 플래그 활성화를 요청하세요.' }, { status: 403 });
  }

  try {
    if (!isRequestOriginAllowed(req.headers.get('origin'), req.url, undefined, req.headers.get('host'), req.headers.get('x-forwarded-proto'))) {
      return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
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
        { error: '요청 본문을 읽지 못했습니다 — multipart/form-data(file 필드에 .pdf)인지, 파일이 32MB 이하인지 확인하세요.' },
        { status: 400 },
      );
    }
    const pdfPart = getFormFile(formData, 'file');
    if (!pdfPart.ok) {
      return NextResponse.json({ error: pdfPart.message }, { status: 400 });
    }
    const pdfFile = pdfPart.file;

    if (!pdfFile) {
      return NextResponse.json({ error: 'PDF 파일이 없습니다. file 필드에 .pdf 파일을 첨부하세요.' }, { status: 400 });
    }

    if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: '.pdf 파일만 업로드할 수 있습니다.' }, { status: 400 });
    }

    if (pdfFile.size > PDF_FILE_MAX_BYTES) {
      return NextResponse.json({ error: '파일이 너무 큽니다 (최대 32MB).' }, { status: 413 });
    }

    const pagePart = formData.get('page');
    const pageNumber = pagePart == null || pagePart === '' ? 1 : Number(pagePart);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 10_000) {
      return NextResponse.json({ error: '페이지 번호는 1 이상 10000 이하의 정수여야 합니다.' }, { status: 400 });
    }
    const pdfBytes = await pdfFile.arrayBuffer();

    const analysis = await parsePdfToSLD(pdfBytes, {
      pageNumber,
      signal: req.signal,
      deadlineMs: 30_000,
    });

    // DXF 라우트와 동일 계약 — 파싱 실패는 success:true가 아니라 400이다.
    if (analysis.confidence === 0 && analysis.components.length === 0) {
      apiLog({
        level: 'warn', event: 'pdf-drawing-parse', route: '/api/pdf-drawing',
        error: analysis.rawDescription, durationMs: timer.elapsed(),
      });
      // 실측(2026-07-26): 실교보재 5건 중 2건이 1페이지가 스캔 이미지라 여기로
      // 떨어졌다. 거부 자체는 옳다(선분 0개로 결선을 지어내면 안 된다). 다만
      // 무엇을 하라는 말이 없어 사용자는 막다른 길에 선다 — 같은 파일을 이미지
      // AI 탭에 넣으면 판독되는 경우가 대부분이다.
      const scanned = /기하\(선분\) 0/.test(analysis.rawDescription ?? '');
      return NextResponse.json(
        {
          error: scanned
            ? '이 페이지에는 벡터 정보가 없습니다(스캔·이미지 도면). 결선을 지어내지 않기 위해 벡터 판독을 중단했습니다. 같은 파일을 "이미지 AI 분석" 탭에 넣으면 판독할 수 있습니다 — BYOK 키가 필요합니다.'
            : 'PDF를 읽을 수 없습니다. 파일이 손상됐거나 해당 페이지가 없습니다. 여러 장이라면 도면이 있는 페이지 번호를 지정해 보세요.',
          detail: analysis.rawDescription,
          nextStep: scanned ? 'image-ai' : 'check-page',
        },
        { status: 400 },
      );
    }

    const topology = buildTopologyFromSLD(analysis);
    const validation = topology.validate();
    const calcChain = generateCalcChainFromSLD(analysis);
    // 초급 하이브리드 검토(계산+기준+결론) — 구조 신뢰가 성립한 추출(0.85)에만.
    // 표 문서·격자 의심(0.55 이하)의 추출로 결선 기반 부합 판정을 내면 false-PASS 위험.
    // 단, 표 문서면 결선을 못 믿을 뿐 표 행 데이터(텍스트 0.99)는 판정 가능하므로
    // scheduleTables가 있으면 표 경로로 판정한다(H7: UNKNOWN 잔존 해소).
    const review = analysis.scheduleTables && analysis.scheduleTables.length > 0
      ? reviewScheduleTables(analysis.scheduleTables)
      : analysis.confidence >= 0.85
        ? reviewAnalysis(analysis)
        : { skipped: true as const, reason: `confidence ${analysis.confidence} — 구조 신뢰 미달(표 문서/스캔/격자 의심)로 부합 판정 생략` };

    apiLog({
      level: 'info', event: 'pdf-drawing-parse', route: '/api/pdf-drawing',
      durationMs: timer.elapsed(),
      meta: { components: analysis.components.length, connections: analysis.connections.length, valid: validation.valid },
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

export const POST = withApiHandler(
  { rateLimit: null, checkOrigin: false, maxBodySize: PDF_BODY_MAX_BYTES },
  handlePost,
);
