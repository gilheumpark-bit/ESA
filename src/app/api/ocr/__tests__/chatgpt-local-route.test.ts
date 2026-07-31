import { NextRequest } from 'next/server';

import { getChatGPTLocalStatus } from '@/lib/chatgpt-local';
import { recognizeNameplate } from '@/lib/ocr-nameplate';

import { POST } from '../route';

jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/chatgpt-local', () => ({ getChatGPTLocalStatus: jest.fn() }));
jest.mock('@/lib/ocr-nameplate', () => ({
  recognizeNameplate: jest.fn(),
  suggestCalculators: jest.fn(() => []),
}));

const statusMock = getChatGPTLocalStatus as jest.MockedFunction<typeof getChatGPTLocalStatus>;
const recognizeMock = recognizeNameplate as jest.MockedFunction<typeof recognizeNameplate>;

describe('POST /api/ocr ChatGPT local provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    statusMock.mockResolvedValue({
      available: true,
      connected: true,
      models: [{
        id: 'gpt-5.6-terra',
        name: 'GPT-5.6 Terra',
        inputModalities: ['text', 'image'],
      }],
    });
    recognizeMock.mockResolvedValue({
      rawText: 'VCB',
      confidence: 0.9,
      language: 'en',
    });
  });

  it('passes a keyless local request to nameplate recognition', async () => {
    const form = new FormData();
    form.set('provider', 'chatgpt-local');
    form.set('model', 'gpt-5.6-terra');
    form.set('image', new File([
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ], 'nameplate.png', { type: 'image/png' }));
    const response = await POST(new NextRequest('http://localhost:3000/api/ocr', {
      method: 'POST',
      headers: { Host: 'localhost:3000', Origin: 'http://localhost:3000' },
      body: form,
    }));

    expect(response.status).toBe(200);
    expect(recognizeMock).toHaveBeenCalledWith(expect.any(Blob), {
      provider: 'chatgpt-local',
      model: 'gpt-5.6-terra',
      apiKey: '',
    });
  });
});
