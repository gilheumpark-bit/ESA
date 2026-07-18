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

async function loadReceipt(receiptId: string) {
  // Dynamic import to avoid bundling Supabase on edge when not needed
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('ESVA-5001: Supabase configuration missing');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('calculation_receipts')
    .select('*')
    .eq('id', receiptId)
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
    // Rate limiting — export profile (10 req/min)
    const blocked = applyRateLimit(req, 'export');
    if (blocked) return blocked as NextResponse;

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
      receipt = body.receipt;
    } else {
      let receiptData: Awaited<ReturnType<typeof loadReceipt>>;
      try {
        receiptData = await loadReceipt(body.receiptId!);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json(
          { error: message },
          { status: 404 },
        );
      }

      // 소유권 검증(IDOR 방지): user_id가 있는 영수증은 본인만 export 가능.
      // /api/calculate/[id] 와 동일한 정책 — 인증 없이 타인 영수증 다운로드 차단.
      const ownerId = (receiptData as { user_id?: string | null }).user_id;
      if (ownerId) {
        const userId = await extractVerifiedUserId(req);
        if (!userId) {
          return NextResponse.json(
            { error: 'ESA-1001: Authentication required' },
            { status: 401 },
          );
        }
        if (userId !== ownerId) {
          return NextResponse.json(
            { error: 'ESA-1002: Not authorized to export this receipt' },
            { status: 403 },
          );
        }
      }

      receipt = receiptData as import('@/engine/receipt/types').Receipt;
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
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { error: `ESA-5099: ${message}` },
      { status: 500 },
    );
  }
}
