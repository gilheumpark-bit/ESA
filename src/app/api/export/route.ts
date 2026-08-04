/**
 * Export API Endpoint
 *
 * POST /api/export
 * Body: { receiptId: string, format: 'pdf' | 'excel' | 'csv', lang?: string }
 *
 * Loads receipt from Supabase, generates file, returns as downloadable blob.
 *
 * PART 1: Types & validation
 * PART 2: Receipt loader
 * PART 3: Route handler
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { validateClientReceiptForExport } from '@/lib/calculation-execution';
import { ENGINE_VERSION } from '@engine/receipt';
import { isRequestOriginAllowed } from '@/lib/request-origin';
import { NextRequest, NextResponse } from 'next/server';
import { withRequestLog } from '@/lib/api/with-request-log';

// ---------------------------------------------------------------------------
// PART 1 -- Types & validation
// ---------------------------------------------------------------------------

type ExportFormat = 'pdf' | 'excel' | 'csv';
type ExportLang = 'ko' | 'en' | 'ja' | 'zh';

interface ExportRequestBody {
  receiptId?: string;
  receipt?: import('@/engine/receipt/types').Receipt;
  format: ExportFormat;
  lang?: ExportLang;
}

function isValidFormat(f: unknown): f is ExportFormat {
  return f === 'pdf' || f === 'excel' || f === 'csv';
}

function isValidLang(l: unknown): l is ExportLang {
  return l === 'ko' || l === 'en' || l === 'ja' || l === 'zh';
}

// ---------------------------------------------------------------------------
// PART 2 -- Receipt loader (Supabase)
// ---------------------------------------------------------------------------

async function loadReceipt(receiptId: string, requesterId: string) {
  // Dynamic import to avoid bundling Supabase on edge when not needed
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('ESVA-5001: Supabase configuration missing');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('calculation_receipts')
    .select('*')
    .eq('id', receiptId)
    .eq('user_id', requesterId)
    .single();

  if (error || !data) {
    throw new Error(`ESA-5002: Receipt not found: ${receiptId}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// PART 3 -- Route handler
// ---------------------------------------------------------------------------

/** RFC 5987 — 한글 파일명을 안전하게 싣는다. */
function fileResponse(body: string, contentType: string, filename: string, asciiName: string): NextResponse {
  const bytes = new TextEncoder().encode(body);
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * 검토 보고서 반출물. 진짜 PDF 바이너리를 만들지 않으므로 `pdf` 요청도
 * 인쇄용 HTML로 내보내고 파일명도 그렇게 적는다 — "PDF 다운로드"라고
 * 표기하면서 HTML을 주던 이전 동작이 사용자를 오도했다.
 */
async function reviewReportResponse(
  report: import('@/agent/teams/types').ESVAVerifiedReport,
  format: ExportFormat,
): Promise<NextResponse> {
  const mod = await import('@/lib/export-review-report');
  const id = String(report.reportId ?? 'report').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'report';
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'pdf') {
    return fileResponse(
      mod.reviewReportPrintableHtml(report),
      'text/html;charset=utf-8',
      `ESA_검토보고서_${id}_${stamp}.html`,
      `ESA_Review_${id}_${stamp}.html`,
    );
  }
  // excel 요청도 CSV 로 내보낸다. xlsx 생성기는 계산 영수증 스키마 전용이라
  // 보고서를 넣으면 빈 표가 나온다 — 확장자만 맞춘 빈 파일을 주지 않는다.
  return fileResponse(
    mod.reviewReportCsv(report),
    'text/csv;charset=utf-8',
    `ESA_검토보고서_${id}_${stamp}.csv`,
    `ESA_Review_${id}_${stamp}.csv`,
  );
}

async function POST__impl(req: NextRequest): Promise<NextResponse> {
  try {
    if (!isRequestOriginAllowed(
      req.headers.get('origin'),
      req.url,
      undefined,
      req.headers.get('host'),
      req.headers.get('x-forwarded-proto'),
    )) {
      return NextResponse.json(
        { error: 'ESVA-9001: Invalid origin' },
        { status: 403 },
      );
    }

    // Per-route abuse limit.
    const blocked = applyRateLimit(req, 'default');
    if (blocked) {
      return NextResponse.json(
        { error: 'ESA-2001: Rate limit exceeded' },
        { status: 429, headers: blocked.headers },
      );
    }

    const raw = await req.json().catch(() => null);
    // 깨진 JSON·빈 본문은 호출자 잘못이다. 아래 필드 검증은 이미 400 을
    // 내는데, 파싱 실패만 바깥 catch 로 새어 500 이 되고 있었다.
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json(
        { error: 'ESVA-5011: Request body must be valid JSON' },
        { status: 400 },
      );
    }
    const body = raw as Partial<ExportRequestBody> & { reviewReport?: unknown };

    if (!isValidFormat(body.format)) {
      return NextResponse.json(
        { error: 'ESVA-5011: format must be one of: pdf, excel, csv' },
        { status: 400 },
      );
    }

    // --- 팀 검토 보고서 반출 ---
    // 계산 영수증과 계약이 다르다. 영수증은 계산기를 재실행해 값을 대조하지만
    // 검토 보고서는 재실행 대상이 아니라 판정·근거의 기록이다. 이전 화면은
    // 보고서를 가짜 계산 영수증(`calculatorId: 'team-review'`)으로 감싸 보내
    // 검증기가 요구하는 calcId·체크섬·재실행이 없어 422로 실패했다(2026-08-02).
    // 대신 보고서 자신의 SHA-256 무결성으로 위조본 반출을 막는다.
    if (body.reviewReport !== undefined) {
      const { verifyReportIntegrity } = await import('@/lib/report-integrity');
      const candidate = body.reviewReport as import('@/agent/teams/types').ESVAVerifiedReport;
      const intact = candidate && typeof candidate === 'object'
        ? await verifyReportIntegrity(candidate).catch(() => false)
        : false;
      if (!intact) {
        return NextResponse.json(
          { error: 'ESA-5014: 보고서 무결성 검증에 실패해 반출할 수 없습니다.' },
          { status: 422 },
        );
      }
      return reviewReportResponse(candidate, body.format);
    }

    // --- Validation ---
    if (!body.receiptId && !body.receipt) {
      return NextResponse.json(
        { error: 'ESVA-5010: receiptId, receipt, or reviewReport is required' },
        { status: 400 },
      );
    }

    const lang: ExportLang = isValidLang(body.lang) ? body.lang : 'ko';

    // --- Load receipt ---
    // If receipt object provided directly (client-side / anonymous), use it.
    // Otherwise load from Supabase by receiptId.
    let receipt: import('@/engine/receipt/types').Receipt;

    if (body.receipt) {
      // 키 없는 체크섬만 믿지 않고 서버 계산기로 입력을 재실행해 전체 claim을 대조한다.
      const validation = await validateClientReceiptForExport(body.receipt);
      if (!validation.valid) {
        // 엔진 판이 바뀌어 재실행이 안 되는 것은 **사용자 잘못이 아니다.**
        // 같은 422 로 나가더라도 문장이 달라야 한다 — 앞서 전부
        // "Receipt verification failed" 였고, 사용자는 자기 영수증이
        // 의심받는다고 읽었다(2026-07-28 독립 심사 백엔드 좌석).
        const message = validation.reason === 'ENGINE_VERSION_DRIFT'
          ? 'ESVA-5013: 이 영수증은 이전 계산 엔진(판 ' + body.receipt.engineVersion
            + ')으로 발급됐습니다. 현재 엔진(' + ENGINE_VERSION + ')은 일부 값을'
            + ' 다르게 계산하므로 재확인할 수 없습니다. 같은 입력으로 다시'
            + ' 계산하면 현재 판의 영수증을 받을 수 있습니다.'
          : `ESVA-5012: Receipt verification failed (${validation.reason})`;
        return NextResponse.json({ error: message }, { status: 422 });
      }
      receipt = body.receipt;
    } else {
      // receiptId로 DB 조회 시에는 소유권 검증 필수 — 미검증이면 SERVICE_ROLE_KEY로
      // 타인 영수증을 임의 조회하는 IDOR이 된다. 서명 검증된 요청자와 소유자 대조.
      const requesterId = await extractVerifiedUserId(req);
      if (!requesterId) {
        return NextResponse.json(
          { error: 'ESVA-4010: Authentication required to export a stored receipt' },
          { status: 401 },
        );
      }
      try {
        const receiptData = await loadReceipt(body.receiptId!, requesterId) as
          import('@/engine/receipt/types').Receipt & { user_id: string };
        receipt = receiptData;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[Export API] Stored receipt load failed:', err);
        return NextResponse.json(
          {
            error: message.startsWith('ESVA-5001')
              ? 'Receipt storage is unavailable'
              : 'Receipt not found',
          },
          { status: message.startsWith('ESVA-5001') ? 503 : 404 },
        );
      }
    }

    // --- Generate export ---
    const receiptId = receipt.id ?? body.receiptId ?? 'unknown';

    let blob: Blob;
    let contentType: string;
    let filename: string;
    const timestamp = new Date().toISOString().slice(0, 10);

    switch (body.format) {
      case 'pdf': {
        const { generateReceiptPDF } = await import('@/lib/export-pdf');
        blob = await generateReceiptPDF(receipt, lang);
        // HTML-based printable receipt — served as text/html for browser print-to-PDF
        contentType = 'text/html;charset=utf-8';
        filename = `ESVA_계산서_${receiptId}_${timestamp}.html`;
        break;
      }

      case 'excel': {
        const { generateReceiptExcel } = await import('@/lib/export-excel');
        blob = await generateReceiptExcel(receipt, { liveFormulas: true });
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `ESVA_계산서_${receiptId}_${timestamp}.xlsx`;
        break;
      }

      case 'csv': {
        const { generateReceiptCSVBlob } = await import('@/lib/export-excel');
        blob = await generateReceiptCSVBlob(receipt, { liveFormulas: true });
        contentType = 'text/csv;charset=utf-8';
        filename = `ESVA_계산서_${receiptId}_${timestamp}.csv`;
        break;
      }
    }

    // --- Return file ---
    const arrayBuffer = await blob.arrayBuffer();

    // RFC 5987: encode filename for Korean-safe Content-Disposition
    const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape);

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="ESVA_Receipt_${receiptId}_${timestamp}.${body.format === 'pdf' ? 'html' : body.format === 'excel' ? 'xlsx' : 'csv'}"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': String(arrayBuffer.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[Export API] Unhandled error:', err);
    return NextResponse.json(
      { error: 'ESA-5099: Export could not be generated' },
      { status: 500 },
    );
  }
}

export const POST = withRequestLog(POST__impl);
