import {
  _setChatGPTLocalServiceFactoryForTests,
  ChatGPTLocalService,
  getChatGPTLocalStatus,
  maskChatGPTEmail,
  type ChatGPTLocalRpc,
} from '@/lib/chatgpt-local';

class FakeRpc implements ChatGPTLocalRpc {
  readonly calls: Array<{ method: string; params: unknown; options?: { timeoutMs?: number } }> = [];
  private readonly responses: Record<string, unknown>;

  constructor(responses: Record<string, unknown>) {
    this.responses = responses;
  }

  async request<T>(method: string, params: unknown, options?: { timeoutMs?: number }): Promise<T> {
    this.calls.push({ method, params, options });
    if (!(method in this.responses)) throw new Error(`missing fake response: ${method}`);
    return this.responses[method] as T;
  }

  runTurn(): never {
    throw new Error('not used in account tests');
  }
}

function initializedResponses(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    initialize: {
      codexHome: 'C:\\redacted',
      platformFamily: 'windows',
      platformOs: 'windows',
      userAgent: 'codex-test',
    },
    ...extra,
  };
}

describe('ChatGPT local account service', () => {
  afterEach(() => {
    _setChatGPTLocalServiceFactoryForTests(null);
  });
  it.each([
    ['gildong@example.com', 'g***@example.com'],
    ['a@example.com', 'a***@example.com'],
    [null, null],
    ['invalid-address', null],
  ])('masks an account email without exposing its local part', (email, expected) => {
    expect(maskChatGPTEmail(email)).toBe(expected);
  });

  it('returns a redacted account and only safe text-capable visible models', async () => {
    const rpc = new FakeRpc(initializedResponses({
      'account/read': {
        account: { type: 'chatgpt', email: 'gildong@example.com', planType: 'pro' },
        requiresOpenaiAuth: true,
      },
      'model/list': {
        data: [
          {
            id: 'gpt-5.6-terra',
            displayName: 'GPT-5.6 Terra',
            hidden: false,
            inputModalities: ['text', 'image'],
          },
          {
            id: 'image-only',
            displayName: 'Image only',
            hidden: false,
            inputModalities: ['image'],
          },
          {
            id: '../unsafe',
            displayName: 'Unsafe',
            hidden: false,
            inputModalities: ['text'],
          },
          {
            id: 'hidden-model',
            displayName: 'Hidden',
            hidden: true,
            inputModalities: ['text'],
          },
        ],
        nextCursor: null,
      },
    }));
    const service = new ChatGPTLocalService(rpc);

    await expect(service.getStatus()).resolves.toEqual({
      available: true,
      connected: true,
      account: { email: 'g***@example.com', planType: 'pro' },
      models: [
        {
          id: 'gpt-5.6-terra',
          name: 'GPT-5.6 Terra',
          inputModalities: ['text', 'image'],
        },
      ],
    });
    expect(JSON.stringify(await service.getStatus())).not.toContain('gildong');
    expect(rpc.calls.filter((call) => call.method !== 'initialize'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ method: 'account/read', options: { timeoutMs: 10_000 } }),
        expect.objectContaining({ method: 'model/list', options: { timeoutMs: 10_000 } }),
      ]));
  });

  it('reports an installed but signed-out app-server without asking for models', async () => {
    const rpc = new FakeRpc(initializedResponses({
      'account/read': { account: null, requiresOpenaiAuth: true },
    }));
    const service = new ChatGPTLocalService(rpc);

    await expect(service.getStatus()).resolves.toEqual({
      available: true,
      connected: false,
      models: [],
      reason: 'NOT_LOGGED_IN',
    });
    expect(rpc.calls.map((call) => call.method)).toEqual(['initialize', 'account/read']);
  });

  it('starts and cancels only the login id returned by app-server', async () => {
    const rpc = new FakeRpc(initializedResponses({
      'account/login/start': {
        type: 'chatgpt',
        authUrl: 'https://auth.openai.com/authorize?client=codex',
        loginId: 'login-1',
      },
      'account/login/cancel': {},
    }));
    const service = new ChatGPTLocalService(rpc);

    await expect(service.startLogin()).resolves.toEqual({
      authUrl: 'https://auth.openai.com/authorize?client=codex',
      loginId: 'login-1',
    });
    await expect(service.cancelLogin('login-other')).rejects.toThrow('LOCAL_CODEX_LOGIN_MISMATCH');
    await expect(service.cancelLogin('login-1')).resolves.toBeUndefined();
  });

  it('replaces an unresponsive shared app-server once and returns the recovered status', async () => {
    let closed = false;
    const brokenRpc: ChatGPTLocalRpc & { close(): void } = {
      request: jest.fn(async (method: string) => {
        if (method === 'initialize') return {};
        throw new Error('LOCAL_CODEX_TIMEOUT');
      }) as ChatGPTLocalRpc['request'],
      runTurn: jest.fn() as ChatGPTLocalRpc['runTurn'],
      close: () => { closed = true; },
    };
    const healthyRpc = new FakeRpc(initializedResponses({
      'account/read': {
        account: { type: 'chatgpt', email: 'recovered@example.com', planType: 'pro' },
        requiresOpenaiAuth: true,
      },
      'model/list': { data: [] },
    }));
    const services = [new ChatGPTLocalService(brokenRpc), new ChatGPTLocalService(healthyRpc)];
    _setChatGPTLocalServiceFactoryForTests(() => services.shift()!);

    await expect(getChatGPTLocalStatus()).resolves.toMatchObject({
      available: true,
      connected: true,
      account: { email: 'r***@example.com' },
    });
    expect(closed).toBe(true);
  });
});
