import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { applyRateLimit } from '@/lib/rate-limit';
import { loadReport } from '@/lib/report-store';

const REPORT_ID = /^RPT-[A-Z0-9-]{8,64}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = applyRateLimit(request, 'default');
  if (blocked) return blocked;

  const userId = await extractVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!REPORT_ID.test(id)) {
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-4020', message: 'Invalid report ID' } },
      { status: 400 },
    );
  }

  const report = await loadReport(id, userId);
  if (!report) {
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-4021', message: 'Report not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { success: true, data: report },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
