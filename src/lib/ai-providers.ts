/**
 * ESVA Multi-Provider AI Abstraction
 * ----------------------------------
 * Provider/model catalog and browser-bound BYOK encryption.
 * Active chat transport lives in the authenticated /api/chat route.
 */

// ─── PART 1: Types ────────────────────────────────────────────

export type CostTier = 'free' | 'low' | 'medium' | 'high' | 'premium';

export interface ProviderCapabilities {
  streaming: boolean;
  structuredOutput: boolean;
  maxContextTokens: number;
  costTier: CostTier;
}

export interface AIModel {
  id: string;
  name: string;
  contextWindow: number;
  costTier: CostTier;
}

export interface AIProvider {
  id: string;
  name: string;
  defaultModel: string;
  models: AIModel[];
  capabilities: ProviderCapabilities;
  /** Base URL for local providers (Ollama, LM Studio) */
  baseUrl?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── PART 2: Provider Registry ────────────────────────────────

export const PROVIDERS: Record<string, AIProvider> = {
  gemini: {
    // 모델 라인업 2026-07-25 갱신 — 출처: ai.google.dev/gemini-api/docs/{pricing,models,deprecations}
    // 가격 페이지만 보면 안 된다. 거기엔 종료 예고된 모델도 단가가 그대로 실려 있어
    // "살아 있는 모델"과 구분되지 않는다. 수명주기는 deprecations 표가 정본이다.
    id: 'gemini',
    name: 'Google Gemini',
    // 3.6 Flash 로 올린다 — 더 새롭고(2026-07-21) 출력 단가도 더 싸다($7.50 vs $9.00).
    // 비용이 내려가는 방향이라 사용자에게 손해가 없다.
    defaultModel: 'gemini-3.6-flash',
    models: [
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)', contextWindow: 1_048_576, costTier: 'premium' },
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', contextWindow: 1_048_576, costTier: 'medium' },
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', contextWindow: 1_048_576, costTier: 'medium' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', contextWindow: 1_048_576, costTier: 'low' },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite (2027-05 종료 예정)', contextWindow: 1_048_576, costTier: 'low' },
      // gemini-2.5-flash 는 뺐다 — 2026-10-16 종료 예고이고 대체(gemini-3.6-flash)가
      // 이 목록에 있다. 3개월 뒤 죽는 모델을 고르게 두면 그 사용자는 예고 없이
      // 끊긴다. 가격표에는 남겨 둔다 — 이미 저장해 둔 사용자의 비용 계산은
      // 종료 전까지 계속 되어야 한다.
    ],
    capabilities: { streaming: true, structuredOutput: true, maxContextTokens: 1_048_576, costTier: 'low' },
  },
  'google-agent-platform': {
    id: 'google-agent-platform',
    name: 'Google Agent Platform (Cloud 크레딧)',
    defaultModel: 'gemini-3.6-flash',
    models: [
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)', contextWindow: 1_048_576, costTier: 'premium' },
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', contextWindow: 1_048_576, costTier: 'medium' },
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', contextWindow: 1_048_576, costTier: 'medium' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', contextWindow: 1_048_576, costTier: 'low' },
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite', contextWindow: 1_048_576, costTier: 'low' },
    ],
    capabilities: { streaming: true, structuredOutput: true, maxContextTokens: 1_048_576, costTier: 'low' },
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    // 2026-07-20 갱신 — 출처: developers.openai.com/api/docs/models (공식).
    defaultModel: 'gpt-5.6-luna',
    models: [
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol (Frontier)', contextWindow: 1_050_000, costTier: 'premium' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', contextWindow: 1_050_000, costTier: 'high' },
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', contextWindow: 1_050_000, costTier: 'low' },
    ],
    capabilities: { streaming: true, structuredOutput: true, maxContextTokens: 1_050_000, costTier: 'medium' },
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    // 2026-07-25 갱신 — 출처: Anthropic 공식 모델 카탈로그. Opus 5 가 현행 주력인데
    // 목록에 없어 사용자가 고를 수 없었다. 구 claude-*-4-20250514는 2026-06-15 폐기.
    //
    // 기본값은 Sonnet 5 로 둔다. Opus 5 가 상위 모델이지만 입력 $5/출력 $25 로 Sonnet 5
    // 의 $3/$15 보다 비싸고, BYOK 는 사용자 지갑이다 — 기본값을 올리면 비용을 말없이
    // 올리는 것이라 선택지로만 제공한다.
    defaultModel: 'claude-sonnet-5',
    models: [
      { id: 'claude-fable-5', name: 'Claude Fable 5 (최상위·30일 보존 필요)', contextWindow: 1_000_000, costTier: 'premium' },
      { id: 'claude-opus-5', name: 'Claude Opus 5', contextWindow: 1_000_000, costTier: 'premium' },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8 (구세대)', contextWindow: 1_000_000, costTier: 'premium' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', contextWindow: 1_000_000, costTier: 'high' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', contextWindow: 200_000, costTier: 'low' },
    ],
    capabilities: { streaming: true, structuredOutput: true, maxContextTokens: 1_000_000, costTier: 'high' },
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    // 2026-07-20: Llama 4 Scout는 2026-07-17 종료. Groq 공식 Production Models만 노출.
    defaultModel: 'openai/gpt-oss-20b',
    models: [
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', contextWindow: 131_072, costTier: 'low' },
      { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', contextWindow: 131_072, costTier: 'free' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', contextWindow: 131_072, costTier: 'low' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', contextWindow: 131_072, costTier: 'free' },
    ],
    capabilities: { streaming: true, structuredOutput: true, maxContextTokens: 131_072, costTier: 'low' },
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    defaultModel: 'mistral-small-latest',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', contextWindow: 128_000, costTier: 'high' },
      // Mistral Small 4(mistral-small-2603)로 갱신되며 컨텍스트가 256k가 됐다.
      { id: 'mistral-small-latest', name: 'Mistral Small', contextWindow: 256_000, costTier: 'low' },
      { id: 'codestral-latest', name: 'Codestral', contextWindow: 256_000, costTier: 'medium' },
    ],
    capabilities: { streaming: true, structuredOutput: true, maxContextTokens: 128_000, costTier: 'medium' },
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    defaultModel: 'llama4',
    baseUrl: 'http://localhost:11434',
    models: [
      { id: 'llama4', name: 'Llama 4 Scout', contextWindow: 128_000, costTier: 'free' },
      { id: 'gemma3', name: 'Gemma 3 27B', contextWindow: 128_000, costTier: 'free' },
      { id: 'qwen3', name: 'Qwen 3 32B', contextWindow: 128_000, costTier: 'free' },
      { id: 'mistral-small', name: 'Mistral Small 3.1', contextWindow: 128_000, costTier: 'free' },
    ],
    capabilities: { streaming: true, structuredOutput: false, maxContextTokens: 128_000, costTier: 'free' },
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio (Local)',
    defaultModel: 'local-model',
    baseUrl: 'http://localhost:1234',
    models: [
      { id: 'local-model', name: 'Local Model', contextWindow: 32_000, costTier: 'free' },
    ],
    capabilities: { streaming: true, structuredOutput: false, maxContextTokens: 32_000, costTier: 'free' },
  },
} as const;

// ─── PART 3: Browser-bound key encryption ────────────────────

const ENCRYPTION_VERSION = 5;
const DEVICE_KEY_DB = 'esa-secure-storage';
const DEVICE_KEY_STORE = 'crypto-keys';
const DEVICE_KEY_ID = 'byok-aes-gcm-v1';

// Read-only compatibility constants. New ciphertext never derives a key from
// public source code and never falls back to XOR/Base64.
const LEGACY_ESVA_SALT = 'esa-key-v4-2025';
let deviceKeyPromise: Promise<CryptoKey> | null = null;

function secureStorageError(): Error {
  return new Error('이 브라우저에서 보안 키 저장소를 사용할 수 없습니다. 최신 브라우저의 보안 컨텍스트(HTTPS)를 사용하세요.');
}

function assertSecureStorageSupport(): void {
  if (
    typeof globalThis.crypto?.subtle === 'undefined'
    || typeof globalThis.indexedDB === 'undefined'
  ) {
    throw secureStorageError();
  }
}

function openDeviceKeyDatabase(): Promise<IDBDatabase> {
  assertSecureStorageSupport();

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DEVICE_KEY_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEVICE_KEY_STORE)) {
        db.createObjectStore(DEVICE_KEY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? secureStorageError());
    request.onblocked = () => reject(new Error('보안 키 저장소 업그레이드가 차단되었습니다. 다른 ESA 탭을 닫고 다시 시도하세요.'));
  });
}

function readDeviceKey(db: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DEVICE_KEY_STORE, 'readonly');
    const request = transaction.objectStore(DEVICE_KEY_STORE).get(DEVICE_KEY_ID);
    request.onsuccess = () => resolve((request.result as CryptoKey | undefined) ?? null);
    request.onerror = () => reject(request.error ?? secureStorageError());
  });
}

function installDeviceKey(db: IDBDatabase, candidate: CryptoKey): Promise<CryptoKey> {
  // A read-write transaction is serialized across tabs. Re-checking inside it
  // prevents two tabs from encrypting with different first-run keys.
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DEVICE_KEY_STORE, 'readwrite');
    const store = transaction.objectStore(DEVICE_KEY_STORE);
    const request = store.get(DEVICE_KEY_ID);
    let selected = candidate;

    request.onsuccess = () => {
      const existing = request.result as CryptoKey | undefined;
      if (existing) {
        selected = existing;
      } else {
        store.add(candidate, DEVICE_KEY_ID);
      }
    };
    request.onerror = () => reject(request.error ?? secureStorageError());
    transaction.oncomplete = () => resolve(selected);
    transaction.onerror = () => reject(transaction.error ?? secureStorageError());
    transaction.onabort = () => reject(transaction.error ?? secureStorageError());
  });
}

async function loadOrCreateDeviceKey(): Promise<CryptoKey> {
  assertSecureStorageSupport();
  const db = await openDeviceKeyDatabase();
  try {
    const existing = await readDeviceKey(db);
    if (existing) return existing;

    const candidate = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    return await installDeviceKey(db, candidate);
  } finally {
    db.close();
  }
}

async function getDeviceKey(): Promise<CryptoKey> {
  if (!deviceKeyPromise) {
    deviceKeyPromise = loadOrCreateDeviceKey().catch((error: unknown) => {
      deviceKeyPromise = null;
      throw error;
    });
  }
  return deviceKeyPromise;
}

/** Derive the former v4 AES key only to migrate existing installations. */
async function deriveLegacyAesKey(): Promise<CryptoKey> {
  if (typeof globalThis.crypto?.subtle === 'undefined') throw secureStorageError();
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(LEGACY_ESVA_SALT), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('esa-static-salt'), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

function legacyXorDecipher(encoded: string, key: string): string {
  const decoded = atob(encoded);
  const result: number[] = [];
  for (let i = 0; i < decoded.length; i++) {
    result.push(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return String.fromCharCode(...result);
}

/**
 * Encrypt an API key with a non-exportable AES-256-GCM key held in IndexedDB.
 * The ciphertext can live in localStorage, but copying localStorage alone is
 * insufficient to recover the API key. Unsupported environments fail closed.
 */
export async function encryptKey(raw: string): Promise<string> {
  if (!raw) throw new Error('빈 API 키는 저장할 수 없습니다.');
  const aesKey = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(raw),
  );
  const payload = new Uint8Array(iv.length + ciphertext.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), iv.length);
  return `v${ENCRYPTION_VERSION}:${btoa(String.fromCharCode(...payload))}`;
}

/**
 * Decrypt a stored API key.
 * Detects version prefix and uses appropriate layer.
 */
export async function decryptKey(stored: string): Promise<string> {
  // v5: browser-bound AES-GCM
  if (stored.startsWith('v5:')) {
    const aesKey = await getDeviceKey();
    const raw = atob(stored.slice(3));
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    if (bytes.length <= 12) throw new Error('저장된 API 키 데이터가 손상되었습니다.');
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
    return new TextDecoder().decode(decrypted);
  }

  // v4: legacy static-derived AES-GCM (migration only)
  if (stored.startsWith('v4:')) {
    const aesKey = await deriveLegacyAesKey();
    const raw = atob(stored.slice(3));
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
    return new TextDecoder().decode(decrypted);
  }

  // v3: XOR
  if (stored.startsWith('v3:')) {
    return legacyXorDecipher(stored.slice(3), LEGACY_ESVA_SALT);
  }

  // v2 / v1: Base64
  if (stored.startsWith('v2:') || stored.startsWith('v1:')) {
    return atob(stored.slice(3));
  }

  // No prefix: assume raw or plain Base64
  try {
    return atob(stored);
  } catch {
    return stored;
  }
}

// ─── PART 5: Utility Exports ──────────────────────────────────

export function isLocalProvider(providerId: string): boolean {
  return providerId === 'ollama' || providerId === 'lmstudio';
}

export function getProvider(id: string): AIProvider | undefined {
  return PROVIDERS[id];
}

export function getModelList(providerId: string): AIModel[] {
  return PROVIDERS[providerId]?.models ?? [];
}

export function isCatalogModel(providerId: string, modelId: string): boolean {
  return getModelList(providerId).some((model) => model.id === modelId);
}

export function getDefaultModel(providerId: string): string {
  return PROVIDERS[providerId]?.defaultModel ?? '';
}

export function hasCapability(
  providerId: string,
  cap: keyof ProviderCapabilities,
): boolean {
  const p = PROVIDERS[providerId];
  if (!p) return false;
  return !!p.capabilities[cap];
}

export function getProviderIds(): string[] {
  return Object.keys(PROVIDERS);
}
