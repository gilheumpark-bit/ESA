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

/**
 * 비전 라우트는 선언된 MIME 이 아니라 바이트로 형식을 판정한다. 그래서 이
 * 픽스처는 진짜 PNG 머리(89 50 4E 47 0D 0A 1A 0A)여야 한다 — 텍스트에
 * `image/png` 만 달면 공급자 호출 전에 400 으로 막혀 이 테스트가 검증하려는
 * "공급자 오류가 새지 않는가" 경로에 도달하지 못한다.
 */
const pngFile = (name: string) =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], name, {
    type: 'image/png',
  });
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
      pngFile('plate.png'),
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
      pngFile('diagram.png'),
      { apiKey: requestKey, provider: 'openai' },
    );

    const response = await postSld(request);
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toContain(SECRET);
  });
});
