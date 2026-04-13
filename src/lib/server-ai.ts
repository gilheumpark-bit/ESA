/**
 * ESVA Server-Side AI Key Resolution
 * -----------------------------------
 * BYOK first -> env fallback -> error.
 * SSRF prevention for local providers.
 */

// ─── PART 1: Types ────────────────────────────────────────────

export interface ResolvedKey {
  key: string;
  source: 'user' | 'env';
}

export interface ProviderAvailability {
  id: string;
  name: string;
  available: boolean;
  source: 'env' | 'none';
}

// ─── PART 2: Environment Key Map ──────────────────────────────

/**
 * Mapping of provider IDs to their environment variable names.
 */
const ENV_KEY_MAP: Record<string, string> = {
  gemini: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openai: 'OPENAI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  ollama: 'OLLAMA_BASE_URL',     // Not a key, but presence indicates availability
  lmstudio: 'LMSTUDIO_BASE_URL', // Same
};

/** Provider display names */
const PROVIDER_NAMES: Record<string, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  claude: 'Anthropic Claude',
  groq: 'Groq',
  mistral: 'Mistral AI',
  ollama: 'Ollama (Local)',
  lmstudio: 'LM Studio (Local)',
};

/** Local providers that don't use API keys */
const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio']);

// ─── PART 3: SSRF Prevention ─────────────────────────────────

/**
 * Blocked IP ranges for SSRF prevention.
 * Prevents local providers from being used to scan internal networks.
 */
const BLOCKED_IP_PATTERNS = [
  /^10\./,                    // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./,              // 192.168.0.0/16
  /^127\./,                   // Loopback (but we allow localhost explicitly)
  /^169\.254\./,              // Link-local
  /^0\./,                     // Current network
  /^fc00:/i,                  // IPv6 ULA
  /^fe80:/i,                  // IPv6 link-local
  /^::1$/,                    // IPv6 loopback
];

/** Hosts explicitly allowed for local providers */
const ALLOWED_LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
]);

/**
 * Validate that a local provider URL is safe (not SSRF).
 * Only allows localhost connections for Ollama/LM Studio.
 */
export function validateLocalProviderUrl(url: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(url);

    // Must be http (local providers don't use https typically)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Invalid protocol. Only http and https are allowed.' };
    }

    // Check if hostname is in the explicit allow list
    if (ALLOWED_LOCAL_HOSTS.has(parsed.hostname)) {
      return { valid: true };
    }

    // Block all other hosts to prevent SSRF
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(parsed.hostname)) {
        return { valid: false, reason: `Blocked IP range: ${parsed.hostname}` };
      }
    }

    // If it's not localhost and not a blocked IP, still deny for local providers
    // (we only want true localhost connections)
    return {
      valid: false,
      reason: `Local providers can only connect to localhost. Got: ${parsed.hostname}`,
    };
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }
}

// ─── PART 4: Key Resolution ──────────────────────────────────

/**
 * Resolve the API key for a provider.
 * Priority: user-provided key -> environment variable -> error.
 *
 * @param providerId - The provider identifier (e.g., 'openai', 'gemini')
 * @param userKey - Optional user-provided API key (BYOK)
 * @returns Resolved key with its source
 * @throws Error if no key is available
 */
export function resolveProviderKey(
  providerId: string,
  userKey?: string | null,
): ResolvedKey {
  // Local providers don't need API keys
  if (LOCAL_PROVIDERS.has(providerId)) {
    const baseUrl = getLocalProviderUrl(providerId);
    const validation = validateLocalProviderUrl(baseUrl);
    if (!validation.valid) {
      throw new Error(`[ESVA] SSRF blocked for ${providerId}: ${validation.reason}`);
    }
    return { key: '', source: 'env' };
  }

  // BYOK: user key takes priority
  if (userKey && userKey.trim().length > 0) {
    return { key: userKey.trim(), source: 'user' };
  }

  // Environment fallback
  const envVar = ENV_KEY_MAP[providerId];
  if (envVar) {
    const envKey = process.env[envVar];
    if (envKey && envKey.trim().length > 0) {
      return { key: envKey.trim(), source: 'env' };
    }
  }

  throw new Error(
    `[ESVA] No API key available for ${PROVIDER_NAMES[providerId] ?? providerId}. ` +
    `Provide your own key (BYOK) or configure ${ENV_KEY_MAP[providerId] ?? 'the environment variable'}.`,
  );
}

/**
 * Get the base URL for a local provider.
 */
export function getLocalProviderUrl(providerId: string): string {
  const defaults: Record<string, string> = {
    ollama: 'http://localhost:11434',
    lmstudio: 'http://localhost:1234',
  };

  const envVar = ENV_KEY_MAP[providerId];
  const envUrl = envVar ? process.env[envVar] : undefined;

  return envUrl || defaults[providerId] || '';
}

// ─── PART 5: Provider Availability ────────────────────────────

/**
 * Check which providers have keys configured (via env vars).
 * Does not check user-provided keys (those are per-request).
 */
export function getAvailableProviders(): ProviderAvailability[] {
  return Object.entries(ENV_KEY_MAP).map(([id, envVar]) => {
    const name = PROVIDER_NAMES[id] ?? id;

    if (LOCAL_PROVIDERS.has(id)) {
      const url = getLocalProviderUrl(id);
      const validation = validateLocalProviderUrl(url);
      return {
        id,
        name,
        available: validation.valid,
        source: 'env' as const,
      };
    }

    const envKey = process.env[envVar];
    const available = !!envKey && envKey.trim().length > 0;

    return {
      id,
      name,
      available,
      source: available ? ('env' as const) : ('none' as const),
    };
  });
}

/**
 * Get only the providers that have keys configured.
 */
export function getConfiguredProviderIds(): string[] {
  return getAvailableProviders()
    .filter(p => p.available)
    .map(p => p.id);
}

/**
 * Check if a specific provider is available.
 */
export function isProviderAvailable(providerId: string): boolean {
  const providers = getAvailableProviders();
  return providers.find(p => p.id === providerId)?.available ?? false;
}

// ─── PART 6: Utilities ────────────────────────────────────────

/**
 * Mask an API key for safe logging/display.
 * Shows first 4 and last 4 characters.
 */
export function maskApiKey(key: string): string {
  if (key.length <= 12) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Validate that an API key looks plausible for the provider.
 * Basic format checks only (not authentication).
 */
export function validateKeyFormat(providerId: string, key: string): boolean {
  if (!key || key.trim().length === 0) return false;

  switch (providerId) {
    case 'openai':
      return key.startsWith('sk-') && key.length > 20;
    case 'claude':
      return key.startsWith('sk-ant-') && key.length > 20;
    case 'gemini':
      return key.startsWith('AI') && key.length > 20;
    case 'groq':
      return key.startsWith('gsk_') && key.length > 20;
    case 'mistral':
      return key.length > 20;
    default:
      return key.length > 0;
  }
}

// ─── PART 7: Timeout-Wrapped Resolution ─────────────────────

/**
 * resolveProviderKey with timeout guard.
 * 환경변수 조회가 지연되거나 BYOK 복호화가 느릴 때 타임아웃.
 *
 * @param providerId - 프로바이더 ID
 * @param userKey - BYOK 키 (선택)
 * @param timeoutMs - 최대 대기 시간 (기본 5000ms)
 */
export async function resolveProviderKeyWithTimeout(
  providerId: string,
  userKey?: string | null,
  timeoutMs: number = 5000,
): Promise<ResolvedKey> {
  return Promise.race([
    Promise.resolve(resolveProviderKey(providerId, userKey)),
    new Promise<ResolvedKey>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[ESVA] Provider key resolution timeout after ${timeoutMs}ms for ${PROVIDER_NAMES[providerId] ?? providerId}`)),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * 여러 프로바이더 중 가장 먼저 사용 가능한 키를 반환.
 * ARI Circuit Breaker 패턴의 경량 버전.
 *
 * @param providerIds - 우선순위 순서의 프로바이더 ID 목록
 * @param userKeys - 프로바이더별 BYOK 키 (선택)
 */
export function resolveFirstAvailable(
  providerIds: string[],
  userKeys?: Record<string, string>,
): ResolvedKey & { providerId: string } {
  for (const id of providerIds) {
    try {
      const key = resolveProviderKey(id, userKeys?.[id]);
      return { ...key, providerId: id };
    } catch {
      // 다음 프로바이더 시도
      continue;
    }
  }
  throw new Error(
    `[ESVA] No available provider found. Tried: ${providerIds.join(', ')}. ` +
    'BYOK 키를 등록하거나 환경변수를 설정하세요.',
  );
}
