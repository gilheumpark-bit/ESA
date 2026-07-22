import { decryptKey, encryptKey } from '@/lib/ai-providers';

export const BYOK_STORAGE_PREFIX = 'esa-byok-';

function storageKey(providerId: string): string {
  if (!/^[a-z0-9-]+$/.test(providerId)) {
    throw new Error('지원하지 않는 AI 공급자 식별자입니다.');
  }
  return `${BYOK_STORAGE_PREFIX}${providerId}`;
}

/** Load a provider key and migrate legacy ciphertext to browser-bound v5. */
export async function loadStoredProviderKey(providerId: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const key = storageKey(providerId);
  const stored = window.localStorage.getItem(key);
  if (!stored) return null;

  const raw = await decryptKey(stored);
  if (!stored.startsWith('v5:')) {
    const migrated = await encryptKey(raw);
    window.localStorage.setItem(key, migrated);
  }
  return raw;
}

export async function saveStoredProviderKey(providerId: string, raw: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const encrypted = await encryptKey(raw);
  window.localStorage.setItem(storageKey(providerId), encrypted);
}

export function deleteStoredProviderKey(providerId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey(providerId));
}

// ── Selected model per provider ──────────────────────────────────────────────
// The model id is not a secret (unlike the API key), so it is stored in
// plaintext. Consumers read it to pick which model to call; an unset value
// means "fall back to the provider's catalog default".

export const BYOK_MODEL_PREFIX = 'esa-byok-model-';

function modelStorageKey(providerId: string): string {
  if (!/^[a-z0-9-]+$/.test(providerId)) {
    throw new Error('지원하지 않는 AI 공급자 식별자입니다.');
  }
  return `${BYOK_MODEL_PREFIX}${providerId}`;
}

/** Load the user's selected model id for a provider, or null if unset. */
export function loadSelectedModel(providerId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(modelStorageKey(providerId));
  } catch {
    return null;
  }
}

export function saveSelectedModel(providerId: string, modelId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(modelStorageKey(providerId), modelId);
}
