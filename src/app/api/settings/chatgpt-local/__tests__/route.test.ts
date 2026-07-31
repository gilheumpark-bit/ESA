import { NextRequest } from 'next/server';

import {
  cancelChatGPTLocalLogin,
  getChatGPTLocalStatus,
  logoutChatGPTLocal,
  startChatGPTLocalLogin,
} from '@/lib/chatgpt-local';

import { GET, POST } from '../route';

jest.mock('@/lib/chatgpt-local', () => ({
  cancelChatGPTLocalLogin: jest.fn(),
  getChatGPTLocalStatus: jest.fn(),
  logoutChatGPTLocal: jest.fn(),
  startChatGPTLocalLogin: jest.fn(),
}));

const statusMock = getChatGPTLocalStatus as jest.MockedFunction<typeof getChatGPTLocalStatus>;
const loginMock = startChatGPTLocalLogin as jest.MockedFunction<typeof startChatGPTLocalLogin>;
const cancelMock = cancelChatGPTLocalLogin as jest.MockedFunction<typeof cancelChatGPTLocalLogin>;
const logoutMock = logoutChatGPTLocal as jest.MockedFunction<typeof logoutChatGPTLocal>;

function request(
  method: 'GET' | 'POST',
  body?: unknown,
  host = 'localhost:3000',
): NextRequest {
  return new NextRequest(`http://${host}/api/settings/chatgpt-local`, {
    method,
    headers: {
      Host: host,
      Origin: `http://${host}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/settings/chatgpt-local', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the redacted local account status without caching it', async () => {
    statusMock.mockResolvedValue({
      available: true,
      connected: true,
      account: { email: 'g***@example.com', planType: 'pro' },
      models: [{ id: 'gpt-5.6-terra', name: 'Terra', inputModalities: ['text', 'image'] }],
    });

    const response = await GET(request('GET'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      data: {
        connected: true,
        account: { email: 'g***@example.com', planType: 'pro' },
      },
    });
  });

  it('hides the account endpoint from non-loopback hosts', async () => {
    const response = await GET(request('GET', undefined, 'esa.example.com'));

    expect(response.status).toBe(404);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('starts the official ChatGPT login flow', async () => {
    loginMock.mockResolvedValue({
      authUrl: 'https://auth.openai.com/authorize?client=codex',
      loginId: 'login-1',
    });

    const response = await POST(request('POST', { action: 'login' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        authUrl: 'https://auth.openai.com/authorize?client=codex',
        loginId: 'login-1',
      },
    });
  });

  it('rejects cancellation for a login id not owned by the current service', async () => {
    cancelMock.mockRejectedValue(new Error('LOCAL_CODEX_LOGIN_MISMATCH'));

    const response = await POST(request('POST', {
      action: 'cancel-login',
      loginId: 'wrong-login',
    }));

    expect(response.status).toBe(400);
  });

  it('disconnects the current local account', async () => {
    logoutMock.mockResolvedValue();

    const response = await POST(request('POST', { action: 'logout' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { connected: false } });
  });
});
