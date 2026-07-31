import { NextRequest } from 'next/server';

import { POST } from '../route';
import { recognizeNameplate } from '@/lib/ocr-nameplate';

jest.mock('@/lib/ocr-nameplate', () => ({
  recognizeNameplate: jest.fn(),
  suggestCalculators: jest.fn(() => []),
}));

const mockRecognizeNameplate = jest.mocked(recognizeNameplate);

describe('POST /api/ocr Google Agent Platform', () => {
  it('accepts the separate Agent Platform vision provider', async () => {
    mockRecognizeNameplate.mockResolvedValue({
      rawText: '',
      confidence: 0.9,
      language: 'ko',
    });
    const form = new FormData();
    form.set('provider', 'google-agent-platform');
    form.set('model', 'gemini-3.6-flash');
    form.set('apiKey', ['agent', 'platform', 'request', 'key'].join('-'));
    form.set('image', new File([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ], 'nameplate.png', { type: 'image/png' }));

    const response = await POST(new NextRequest('http://localhost/api/ocr', {
      method: 'POST',
      body: form,
    }));

    expect(response.status).toBe(200);
    expect(mockRecognizeNameplate).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({
      provider: 'google-agent-platform',
      model: 'gemini-3.6-flash',
    }));
  });
});
