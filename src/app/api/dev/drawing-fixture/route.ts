import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { getDrawingCalibrationFixture } from '@/lib/drawing-calibration-fixtures';

export async function GET(request: NextRequest): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }

  const fixture = getDrawingCalibrationFixture(request.nextUrl.searchParams.get('id') ?? '');
  if (!fixture) return new Response('Unknown fixture', { status: 404 });

  try {
    const bytes = await readFile(fixture.path);
    return new Response(bytes, {
      headers: {
        'Content-Type': fixture.mimeType,
        'Content-Disposition': `inline; filename="${fixture.fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Fixture unavailable', { status: 404 });
  }
}
