import { decryptKey, encryptKey } from '@/lib/ai-providers';

export type OnPremiseApiType = 'ollama' | 'vllm' | 'localai' | 'openai-compat';

export interface OnPremiseClientConfig {
  serverUrl: string;
  apiType: OnPremiseApiType;
  modelName: string;
  apiKey: string;
  contextLength: number;
  timeout: number;
  enabled: boolean;
}

type Encrypt = (raw: string) => Promise<string>;
type Decrypt = (ciphertext: string) => Promise<string>;

const API_TYPES = new Set<OnPremiseApiType>(['ollama', 'vllm', 'localai', 'openai-compat']);

interface StoredOnPremiseConfig extends Omit<OnPremiseClientConfig, 'apiKey'> {
  schemaVersion: 1;
  encryptedApiKey?: string;
}

function assertStoredConfig(value: unknown): asserts value is StoredOnPremiseConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('저장된 On-Premise 설정 형식이 올바르지 않습니다.');
  }

  const config = value as Record<string, unknown>;
  const serverUrl = typeof config.serverUrl === 'string' ? config.serverUrl.trim() : '';
  let validUrl = serverUrl.length === 0 && config.enabled === false;
  if (serverUrl) {
    try {
      validUrl = ['http:', 'https:'].includes(new URL(serverUrl).protocol);
    } catch {
      validUrl = false;
    }
  }

  if (
    config.schemaVersion !== 1
    || typeof config.serverUrl !== 'string'
    || !validUrl
    || typeof config.apiType !== 'string'
    || !API_TYPES.has(config.apiType as OnPremiseApiType)
    || typeof config.modelName !== 'string'
    || (config.enabled === true && config.modelName.trim().length === 0)
    || config.modelName.length > 200
    || !Number.isInteger(config.contextLength)
    || Number(config.contextLength) < 2048
    || Number(config.contextLength) > 128000
    || !Number.isInteger(config.timeout)
    || Number(config.timeout) < 10
    || Number(config.timeout) > 300
    || typeof config.enabled !== 'boolean'
    || (config.encryptedApiKey !== undefined && typeof config.encryptedApiKey !== 'string')
  ) {
    throw new Error('저장된 On-Premise 설정 형식이 올바르지 않습니다.');
  }
}

export async function encodeOnPremiseConfig(
  config: OnPremiseClientConfig,
  encrypt: Encrypt = encryptKey,
): Promise<string> {
  const stored: StoredOnPremiseConfig = {
    schemaVersion: 1,
    serverUrl: config.serverUrl,
    apiType: config.apiType,
    modelName: config.modelName,
    contextLength: config.contextLength,
    timeout: config.timeout,
    enabled: config.enabled,
  };

  if (config.apiKey.trim()) {
    stored.encryptedApiKey = await encrypt(config.apiKey);
  }

  assertStoredConfig(stored);
  return JSON.stringify(stored);
}

export async function decodeOnPremiseConfig(
  raw: string,
  decrypt: Decrypt = decryptKey,
): Promise<OnPremiseClientConfig> {
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    throw new Error('저장된 On-Premise 설정 형식이 올바르지 않습니다.');
  }

  assertStoredConfig(stored);
  return {
    serverUrl: stored.serverUrl,
    apiType: stored.apiType,
    modelName: stored.modelName,
    apiKey: stored.encryptedApiKey ? await decrypt(stored.encryptedApiKey) : '',
    contextLength: stored.contextLength,
    timeout: stored.timeout,
    enabled: stored.enabled,
  };
}
