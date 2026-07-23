import { NextRequest } from 'next/server';
import { POST as postDxf } from '@/app/api/dxf/route';
import { POST as postPdfDrawing } from '@/app/api/pdf-drawing/route';
import { POST as postOcr } from '@/app/api/ocr/route';
import { POST as postSld } from '@/app/api/sld/route';
import { parseDxfToSLD } from '@/engine/topology/dxf-parser';
import { parsePdfToSLD } from '@/engine/topology/pdf-vector-parser';
import { analyzeSLD } from '@/lib/sld-recognition';

jest.mock('@/lib/rate-limit', () => ({
  applyRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
  checkRateLimit: jest.fn(() => ({ allowed: true, remaining: 1 })),
}));
jest.mock('@/engine/topology/dxf-parser', () => ({ parseDxfToSLD: jest.fn() }));
jest.mock('@/engine/topology/pdf-vector-parser', () => ({ parsePdfToSLD: jest.fn() }));
jest.mock('@/lib/ocr-nameplate', () => ({
  recognizeNameplate: jest.fn(),
  suggestCalculators: jest.fn(() => []),
}));
jest.mock('@/lib/sld-recognition', () => ({
  analyzeSLD: jest.fn(),
  generateCalcChainFromSLD: jest.fn(() => []),
}));

const SECRET = 'super-secret-provider-diagnostic:/internal/path';
const requestKey = ['test', 'provider', 'key'].join('-');

function multipartRequest(path: string, field: string, file: File, extras: Record<string, string> = {}): NextRequest {
  const formData = new FormData();
  formData.set(field, file);
  for (const [key, value] of Object.entries(extras)) formData.set(key, value);
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { Origin: 'http://localhost:3000' },
    body: formData,
  });
}

describe('public drawing API error redaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('DXF parser diagnostics stay server-side', async () => {
    jest.mocked(parseDxfToSLD).mockImplementation(() => { throw new Error(SECRET); });
    const request = multipartRequest('/api/dxf', 'file', new File(['0\nEOF'], 'test.dxf', { type: 'application/dxf' }));

    const response = await postDxf(request);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain(SECRET);
  });

  test('PDF parser diagnostics stay server-side', async () => {
    jest.mocked(parsePdfToSLD).mockRejectedValue(new Error(SECRET));
    const request = multipartRequest('/api/pdf-drawing', 'file', new File(['%PDF'], 'test.pdf', { type: 'application/pdf' }));

    const response = await postPdfDrawing(request);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain(SECRET);
  });

  test('OCR provider diagnostics stay server-side', async () => {
    const { recognizeNameplate: mockedOcr } = await import('@/lib/ocr-nameplate');
    jest.mocked(mockedOcr).mockRejectedValue(new Error(SECRET));
    const request = multipartRequest(
      '/api/ocr',
      'image',
      new File(['image'], 'plate.png', { type: 'image/png' }),
      { apiKey: requestKey, provider: 'openai' },
    );

    const response = await postOcr(request);
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toContain(SECRET);
  });

  test('SLD saga diagnostics stay server-side', async () => {
    jest.mocked(analyzeSLD).mockRejectedValue(new Error(SECRET));
    const request = multipartRequest(
      '/api/sld',
      'image',
      new File(['image'], 'diagram.png', { type: 'image/png' }),
      { apiKey: requestKey, provider: 'openai' },
    );

    const response = await postSld(request);
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toContain(SECRET);
  });
});
