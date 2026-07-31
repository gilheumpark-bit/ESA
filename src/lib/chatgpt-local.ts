import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CodexAppServerClient,
  type LocalTurnParams,
  type LocalTurnResult,
} from '@/lib/chatgpt-local-protocol';
import type {
  ChatGPTLocalModel,
  ChatGPTLocalStatus,
} from '@/lib/chatgpt-local-contract';

export type {
  ChatGPTLocalModel,
  ChatGPTLocalStatus,
} from '@/lib/chatgpt-local-contract';

const SAFE_MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;
const RUNTIME_CWD = join(tmpdir(), 'esa-chatgpt-local-runtime');

export interface ChatGPTLocalRpc {
  request<T>(method: string, params: unknown, options?: { timeoutMs?: number }): Promise<T>;
  runTurn(params: LocalTurnParams): Promise<LocalTurnResult>;
}

interface AccountReadResponse {
  account: null | {
    type: string;
    email?: string | null;
    planType?: string;
  };
  requiresOpenaiAuth: boolean;
}

interface ModelListResponse {
  data: Array<{
    id: string;
    displayName: string;
    hidden: boolean;
    inputModalities?: string[];
  }>;
}

export function maskChatGPTEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  return `${email[0]}***${email.slice(at)}`;
}

function normalizeModels(models: ModelListResponse['data']): ChatGPTLocalModel[] {
  return models.flatMap((model) => {
    const modalities = (model.inputModalities ?? [])
      .filter((item): item is 'text' | 'image' => item === 'text' || item === 'image');
    if (
      model.hidden
      || !SAFE_MODEL_ID.test(model.id)
      || model.id.includes('..')
      || model.id.includes('//')
      || !modalities.includes('text')
    ) {
      return [];
    }
    return [{
      id: model.id,
      name: model.displayName || model.id,
      inputModalities: modalities,
    }];
  });
}

export class ChatGPTLocalService {
  private initializePromise: Promise<void> | null = null;
  private activeLoginId: string | null = null;

  constructor(private readonly rpc: ChatGPTLocalRpc) {}

  async getStatus(): Promise<ChatGPTLocalStatus> {
    try {
      await this.initialize();
      const account = await this.rpc.request<AccountReadResponse>('account/read', {
        refreshToken: false,
      });
      if (!account.account || account.account.type !== 'chatgpt') {
        return {
          available: true,
          connected: false,
          models: [],
          reason: 'NOT_LOGGED_IN',
        };
      }
      const catalog = await this.rpc.request<ModelListResponse>('model/list', {
        includeHidden: false,
        limit: 100,
      });
      return {
        available: true,
        connected: true,
        account: {
          email: maskChatGPTEmail(account.account.email),
          planType: account.account.planType || 'unknown',
        },
        models: normalizeModels(catalog.data),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return {
        available: false,
        connected: false,
        models: [],
        reason: /ENOENT|not found|LOCAL_CODEX_EXITED/i.test(message)
          ? 'CODEX_NOT_FOUND'
          : 'PROTOCOL_ERROR',
      };
    }
  }

  async startLogin(): Promise<{ authUrl: string; loginId: string }> {
    await this.initialize();
    const response = await this.rpc.request<{
      type: string;
      authUrl?: string;
      loginId?: string;
    }>('account/login/start', {
      type: 'chatgpt',
      appBrand: 'codex',
      codexStreamlinedLogin: true,
      useHostedLoginSuccessPage: true,
    });
    if (response.type !== 'chatgpt' || !response.authUrl || !response.loginId) {
      throw new Error('LOCAL_CODEX_LOGIN_INVALID');
    }
    const url = new URL(response.authUrl);
    if (url.protocol !== 'https:' || !(
      url.hostname === 'openai.com'
      || url.hostname.endsWith('.openai.com')
      || url.hostname === 'chatgpt.com'
      || url.hostname.endsWith('.chatgpt.com')
    )) {
      throw new Error('LOCAL_CODEX_LOGIN_URL_BLOCKED');
    }
    this.activeLoginId = response.loginId;
    return { authUrl: response.authUrl, loginId: response.loginId };
  }

  async cancelLogin(loginId: string): Promise<void> {
    if (!this.activeLoginId || loginId !== this.activeLoginId) {
      throw new Error('LOCAL_CODEX_LOGIN_MISMATCH');
    }
    await this.rpc.request('account/login/cancel', { loginId });
    this.activeLoginId = null;
  }

  async logout(): Promise<void> {
    await this.initialize();
    await this.rpc.request('account/logout', {});
    this.activeLoginId = null;
  }

  async runTurn(params: Omit<LocalTurnParams, 'cwd'>): Promise<LocalTurnResult> {
    await this.initialize();
    await mkdir(RUNTIME_CWD, { recursive: true });
    return this.rpc.runTurn({ ...params, cwd: RUNTIME_CWD });
  }

  private initialize(): Promise<void> {
    if (!this.initializePromise) {
      this.initializePromise = this.rpc.request('initialize', {
        clientInfo: {
          name: 'esa',
          title: 'ESA',
          version: '0.2.0',
        },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false,
        },
      }).then(() => undefined).catch((error: unknown) => {
        this.initializePromise = null;
        throw error;
      });
    }
    return this.initializePromise;
  }
}

let sharedService: ChatGPTLocalService | null = null;

export function getSharedChatGPTLocalService(): ChatGPTLocalService {
  if (!sharedService) {
    sharedService = new ChatGPTLocalService(new CodexAppServerClient({
      defaultTimeoutMs: 120_000,
    }));
  }
  return sharedService;
}

export async function getChatGPTLocalStatus(): Promise<ChatGPTLocalStatus> {
  return getSharedChatGPTLocalService().getStatus();
}

export async function startChatGPTLocalLogin(): Promise<{ authUrl: string; loginId: string }> {
  return getSharedChatGPTLocalService().startLogin();
}

export async function cancelChatGPTLocalLogin(loginId: string): Promise<void> {
  return getSharedChatGPTLocalService().cancelLogin(loginId);
}

export async function logoutChatGPTLocal(): Promise<void> {
  return getSharedChatGPTLocalService().logout();
}

export async function runChatGPTLocalTurn(
  params: Omit<LocalTurnParams, 'cwd'>,
): Promise<LocalTurnResult> {
  return getSharedChatGPTLocalService().runTurn(params);
}
