import { NextRequest } from 'next/server';

import { getChatGPTLocalStatus } from '@/lib/chatgpt-local';
import { analyzeSLD } from '@/lib/sld-recognition';

import { POST } from '../route';

jest.mock('@/lib/rate-limit', () => ({
  applyRateLimit: jest.fn(() => null),
}));
jest.mock('@/lib/chatgpt-local', () => ({
  getChatGPTLocalStatus: jest.fn(),
}));
jest.mock('@/lib/drawing-text-quality', () => ({
  measureTextQuality: jest.fn(async () => ({
    score: 1,
    warning: null,
  })),
}));
jest.mock('@/lib/sld-recognition', () => ({
  analyzeSLD: jest.fn(),
  generateCalcChainFromSLD: jest.fn(() => []),
}));

const statusMock = getChatGPTLocalStatus as jest.MockedFunction<typeof getChatGPTLocalStatus>;
const analyzeMock = analyzeSLD as jest.MockedFunction<typeof analyzeSLD>;

function request(host = 'localhost:3000'): NextRequest {
  const form = new FormData();
  form.set('provider', 'chatgpt-local');
  form.set('model', 'gpt-5.6-terra');
  form.set('image', new File([
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
  ], 'drawing.png', { type: 'image/png' }));
  return new NextRequest(`http://${host}/api/sld`, {
    method: 'POST',
    headers: { Host: host, Origin: `http://${host}` },
    body: form,
  });
}

describe('POST /api/sld ChatGPT local provider', () => {
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
    analyzeMock.mockResolvedValue({
      components: [],
      connections: [],
      systemVoltage: '',
      systemType: '',
      confidence: 0,
      rawDescription: '',
      suggestedCalculations: [],
    });
  });

  it('passes a keyless local request to the existing SLD analysis pipeline', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(analyzeMock).toHaveBeenCalledWith(expect.any(Blob), {
      provider: 'chatgpt-local',
      model: 'gpt-5.6-terra',
      apiKey: '',
    });
  });

  it('does not expose the local account path on a non-loopback host', async () => {
    const response = await POST(request('esa.example.com'));

    expect(response.status).toBe(404);
    expect(statusMock).not.toHaveBeenCalled();
    expect(analyzeMock).not.toHaveBeenCalled();
  });
});
