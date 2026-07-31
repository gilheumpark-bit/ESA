import { resolveBrowserChatTransport } from '@/lib/electrical-chat-client';
import { getFirstAvailableVisionKey } from '@/lib/vision-byok';

jest.mock('@/lib/onpremise-storage', () => ({
  decodeOnPremiseConfig: jest.fn(async () => ({ enabled: false })),
}));

jest.mock('@/lib/vision-byok', () => ({
  buildVisionChatRequest: jest.fn(() => ({
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    apiKey: 'browser-byok-key',
  })),
  getFirstAvailableVisionKey: jest.fn(async () => ({
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    key: 'browser-byok-key',
  })),
}));

const byokMock = getFirstAvailableVisionKey as jest.MockedFunction<typeof getFirstAvailableVisionKey>;

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('electrical chat local account selection', () => {
  const originalFetch = global.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalSessionStorage = (globalThis as { sessionStorage?: unknown }).sessionStorage;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
    if (originalSessionStorage === undefined) {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    } else {
      (globalThis as { sessionStorage?: unknown }).sessionStorage = originalSessionStorage;
    }
    jest.clearAllMocks();
  });

  it('prefers the enabled ChatGPT account over BYOK and sends no API key', async () => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    localStorage.setItem('esa-chatgpt-local', JSON.stringify({
      enabled: true,
      model: 'gpt-5.6-terra',
    }));
    (globalThis as { window?: unknown }).window = { localStorage };
    (globalThis as { sessionStorage?: unknown }).sessionStorage = sessionStorage;
    global.fetch = jest.fn(async () => new Response(JSON.stringify({
      data: {
        available: true,
        connected: true,
        models: [{
          id: 'gpt-5.6-terra',
          name: 'GPT-5.6 Terra',
          inputModalities: ['text', 'image'],
        }],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

    const transport = await resolveBrowserChatTransport();

    expect(transport.providerBody).toEqual({
      provider: 'chatgpt-local',
      model: 'gpt-5.6-terra',
    });
    expect(transport.providerBody).not.toHaveProperty('apiKey');
    expect(byokMock).not.toHaveBeenCalled();
  });

  it('stops before chat when the selected local account is disconnected', async () => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    localStorage.setItem('esa-chatgpt-local', JSON.stringify({
      enabled: true,
      model: 'gpt-5.6-terra',
    }));
    (globalThis as { window?: unknown }).window = { localStorage };
    (globalThis as { sessionStorage?: unknown }).sessionStorage = sessionStorage;
    global.fetch = jest.fn(async () => new Response(JSON.stringify({
      data: {
        available: true,
        connected: false,
        models: [],
        reason: 'NOT_LOGGED_IN',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

    await expect(resolveBrowserChatTransport()).rejects.toThrow(
      'ChatGPT 계정 연결이 끊겼습니다',
    );
    expect(byokMock).not.toHaveBeenCalled();
  });
});
