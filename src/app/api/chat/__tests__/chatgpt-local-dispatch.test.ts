import { NextRequest } from 'next/server';

import {
  getChatGPTLocalStatus,
  runChatGPTLocalTurn,
} from '@/lib/chatgpt-local';
import { resolveProviderKey } from '@/lib/server-ai';

import { POST } from '../route';

jest.mock('@/lib/chatgpt-local', () => ({
  getChatGPTLocalStatus: jest.fn(),
  runChatGPTLocalTurn: jest.fn(),
}));

jest.mock('@/lib/server-ai', () => ({
  ...jest.requireActual('@/lib/server-ai'),
  resolveProviderKey: jest.fn(),
}));

jest.mock('@/lib/auth-helpers', () => ({
  extractVerifiedUserId: jest.fn(),
}));

const statusMock = getChatGPTLocalStatus as jest.MockedFunction<typeof getChatGPTLocalStatus>;
const runTurnMock = runChatGPTLocalTurn as jest.MockedFunction<typeof runChatGPTLocalTurn>;
const resolveProviderKeyMock = resolveProviderKey as jest.MockedFunction<typeof resolveProviderKey>;

function request(
  message = 'VCB의 역할을 설명해줘',
  host = 'localhost:3000',
): NextRequest {
  return new NextRequest(`http://${host}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: host,
      Origin: `http://${host}`,
      'X-Forwarded-For': '198.51.100.241',
    },
    body: JSON.stringify({
      provider: 'chatgpt-local',
      model: 'gpt-5.6-terra',
      messages: [{ role: 'user', content: message }],
      language: 'ko',
    }),
  });
}

describe('POST /api/chat ChatGPT local dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    statusMock.mockResolvedValue({
      available: true,
      connected: true,
      account: { email: 'g***@example.com', planType: 'pro' },
      models: [{
        id: 'gpt-5.6-terra',
        name: 'GPT-5.6 Terra',
        inputModalities: ['text', 'image'],
      }],
    });
    runTurnMock.mockResolvedValue({
      text: 'VCB는 진공 차단기입니다.',
      model: 'gpt-5.6-terra',
      durationMs: 20,
    });
  });

  it('uses the local account without resolving or receiving an API key', async () => {
    const response = await POST(request());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(resolveProviderKeyMock).not.toHaveBeenCalled();
    expect(runTurnMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.6-terra',
      developerInstructions: expect.stringContaining('ESVA 전기 직무 보조 AI'),
      input: [{
        type: 'text',
        text: expect.stringContaining('VCB의 역할을 설명해줘'),
      }],
    }));
    expect(body).toContain('VCB는 진공 차단기입니다.');
    expect(body).toContain('data: [DONE]');
  });

  it('keeps the deterministic calculator receipt ahead of the local model answer', async () => {
    const response = await POST(request(
      '전압강하 계산: 3상 380V 100A 50m 35mm2 Cu 역률 0.9',
    ));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body.indexOf('"calculation"')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('"calculatorId":"voltage-drop"')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('"calculation"')).toBeLessThan(body.indexOf('"text"'));
    expect(runTurnMock.mock.calls[0]?.[0].developerInstructions).toContain(
      '[SOURCE: ESA_CALCULATOR:voltage-drop]',
    );
  });

  it('hides the local account provider from non-loopback hosts', async () => {
    const response = await POST(request('VCB란?', 'esa.example.com'));

    expect(response.status).toBe(404);
    expect(statusMock).not.toHaveBeenCalled();
    expect(runTurnMock).not.toHaveBeenCalled();
  });

  it('returns 401 when the local Codex account is not logged in', async () => {
    statusMock.mockResolvedValue({
      available: true,
      connected: false,
      models: [],
      reason: 'NOT_LOGGED_IN',
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(runTurnMock).not.toHaveBeenCalled();
  });

  it('returns 429 when the ChatGPT account reports a usage limit', async () => {
    runTurnMock.mockRejectedValue(new Error('usage limit reached'));

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(resolveProviderKeyMock).not.toHaveBeenCalled();
  });
});
