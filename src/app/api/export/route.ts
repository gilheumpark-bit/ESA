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
import { NextRequest, NextResponse } from 'next/server';

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Per-route abuse limit.
    const blocked = applyRateLimit(req, 'default');
    if (blocked) {
      return NextResponse.json(
        { error: 'ESA-2001: Rate limit exceeded' },
        { status: 429, headers: blocked.headers },
      );
    }

    const body = (await req.json()) as Partial<ExportRequestBody>;

    // --- Validation ---
    if (!body.receiptId && !body.receipt) {
      return NextResponse.json(
        { error: 'ESVA-5010: receiptId or receipt object is required' },
        { status: 400 },
      );
    }

    if (!isValidFormat(body.format)) {
      return NextResponse.json(
        { error: 'ESVA-5011: format must be one of: pdf, excel, csv' },
        { status: 400 },
      );
    }

    const lang: ExportLang = isValidLang(body.lang) ? body.lang : 'ko';

    // --- Load receipt ---
    // If receipt object provided directly (client-side / anonymous), use it.
    // Otherwise load from Supabase by receiptId.
    let receipt: import('@/engine/receipt/types').Receipt;

    if (body.receipt) {
      // 클라이언트가 영수증 객체를 직접 제공 (익명·자기 소유) — 그대로 사용.
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
