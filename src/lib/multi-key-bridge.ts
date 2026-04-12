/**
 * ESVA Multi-Key Bridge
 * ─────────────────────
 * Routes sandbox roles (kr-electrical, us-electrical, global-ai, etc.)
 * to API key slots. Supports slot-aware streaming with usage tracking.
 *
 * PART 1: Types & Slot Configuration
 * PART 2: Slot-aware Streaming
 * PART 3: Utility Exports
 */

import type { SandboxId, Genre } from '@agent/types';
import type { ChatMessage } from '@/lib/ai-providers';
import { PROVIDERS } from '@/lib/ai-providers';

// ─── PART 1: Types & Slot Configuration ──────────────────────────

export interface KeySlot {
  id: string;
  label: string;
  provider: string;
  model: string;
  apiKey: string;
  enabled: boolean;
  /** Sandbox roles this slot serves */
  assignedRoles: SandboxId[];
  /** Usage tracking */
  usage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    requestCount: number;
    lastUsed: string | null;
  };
}

export interface MultiKeyConfig {
  slots: KeySlot[];
  /** Max parallel requests for cross-validation */
  maxParallel: number;
}

const STORAGE_KEY = 'esa-multi-key-config';

const DEFAULT_CONFIG: MultiKeyConfig = {
  slots: [],
  maxParallel: 3,
};

/** Load multi-key config from localStorage */
export function loadMultiKeyConfig(): MultiKeyConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return JSON.parse(raw) as MultiKeyConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Save multi-key config to localStorage */
export function saveMultiKeyConfig(config: MultiKeyConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** Count active (enabled + key present) slots */
export function getActiveSlotCount(config: MultiKeyConfig): number {
  return config.slots.filter((s) => s.enabled && s.apiKey).length;
}

/**
 * Genre-based priority mapping for sandbox roles.
 * Electrical queries prefer specialized slots; AI queries prefer general-purpose.
 */
const GENRE_PRIORITY: Record<Genre, string[]> = {
  electrical: ['gemini', 'openai', 'claude'],
  ai: ['claude', 'openai', 'gemini'],
  standard: ['gemini', 'openai', 'claude'],
  certification: ['openai', 'gemini', 'claude'],
};

/** Find best matching slot for a sandbox role */
export function getSlotForRole(
  config: MultiKeyConfig,
  sandboxId: SandboxId,
): KeySlot | null {
  const activeSlots = config.slots.filter((s) => s.enabled && s.apiKey);
  if (activeSlots.length === 0) return null;

  // 1. Exact role match
  const exactMatch = activeSlots.find((s) =>
    s.assignedRoles.includes(sandboxId),
  );
  if (exactMatch) return exactMatch;

  // 2. Genre-based match: extract genre from sandboxId (e.g., 'kr-electrical' → 'electrical')
  const genre = sandboxId.split('-').slice(1).join('-') as Genre;
  const preferredProviders = GENRE_PRIORITY[genre] ?? ['gemini', 'openai', 'claude'];

  for (const prov of preferredProviders) {
    const match = activeSlots.find((s) => s.provider === prov);
    if (match) return match;
  }

  // 3. Any active slot
  return activeSlots[0] ?? null;
}

/** Track token usage for a slot */
export function trackSlotUsage(
  config: MultiKeyConfig,
  slotId: string,
  inputTokens: number,
  outputTokens: number,
): MultiKeyConfig {
  return {
    ...config,
    slots: config.slots.map((s) =>
      s.id === slotId
        ? {
            ...s,
            usage: {
              totalInputTokens: s.usage.totalInputTokens + inputTokens,
              totalOutputTokens: s.usage.totalOutputTokens + outputTokens,
              requestCount: s.usage.requestCount + 1,
              lastUsed: new Date().toISOString(),
            },
          }
        : s,
    ),
  };
}

// ─── PART 2: Slot-aware Streaming ────────────────────────────────

export interface MultiKeyStreamOptions {
  sandboxId: SandboxId;
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
  /** Force a specific slot (bypass role matching) */
  forceSlotId?: string;
}

export interface MultiKeyStreamResult {
  text: string;
  slotId: string | null;
  provider: string;
  model: string;
}

/**
 * Stream with multi-key slot routing.
 * 1. Active slot found → use role-appropriate key
 * 2. No slot → throw (BYOK-first: caller handles fallback via server-ai)
 * 3. Usage tracked automatically
 */
export async function streamWithMultiKey(
  opts: MultiKeyStreamOptions,
  /** Chat function injected by caller (avoids circular dep with ai-providers) */
  chatFn: (options: {
    provider: string;
    model: string;
    apiKey: string;
    messages: ChatMessage[];
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    onChunk?: (chunk: string) => void;
  }) => Promise<string>,
): Promise<MultiKeyStreamResult> {
  const config = loadMultiKeyConfig();
  const activeCount = getActiveSlotCount(config);

  if (activeCount === 0) {
    throw new Error('ESVA-6001: No active multi-key slots configured');
  }

  // Resolve slot
  let slot: KeySlot | null = null;

  if (opts.forceSlotId) {
    slot =
      config.slots.find(
        (s) => s.id === opts.forceSlotId && s.enabled && s.apiKey,
      ) ?? null;
  }
  if (!slot) {
    slot = getSlotForRole(config, opts.sandboxId);
  }

  if (!slot) {
    throw new Error(
      `ESA-6002: No slot available for sandbox "${opts.sandboxId}"`,
    );
  }

  // Validate provider exists
  if (!PROVIDERS[slot.provider]) {
    throw new Error(
      `ESA-6003: Unknown provider "${slot.provider}" in slot "${slot.id}"`,
    );
  }

  let _accumulated = '';
  const text = await chatFn({
    provider: slot.provider,
    model: slot.model,
    apiKey: slot.apiKey,
    messages: opts.messages,
    systemPrompt: opts.systemPrompt,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    signal: opts.signal,
    onChunk: (chunk) => {
      _accumulated += chunk;
      opts.onChunk(chunk);
    },
  });

  // Track usage (~4 chars ≈ 1 token rough estimate)
  const inputTokens = Math.ceil(
    opts.messages.reduce((acc, m) => acc + m.content.length, 0) / 4,
  );
  const outputTokens = Math.ceil(text.length / 4);
  const updatedConfig = trackSlotUsage(config, slot.id, inputTokens, outputTokens);
  saveMultiKeyConfig(updatedConfig);

  return {
    text,
    slotId: slot.id,
    provider: slot.provider,
    model: slot.model,
  };
}

// ─── PART 3: Utility Exports ─────────────────────────────────────

/** Check if multi-key routing is active */
export function isMultiKeyActive(): boolean {
  const config = loadMultiKeyConfig();
  return getActiveSlotCount(config) > 0;
}

/** Get slot info for a sandbox role (UI display) */
export function getSlotInfoForRole(sandboxId: SandboxId): {
  available: boolean;
  provider?: string;
  model?: string;
  label?: string;
} {
  const config = loadMultiKeyConfig();
  const slot = getSlotForRole(config, sandboxId);
  if (!slot) return { available: false };
  return {
    available: true,
    provider: slot.provider,
    model: slot.model,
    label: slot.label,
  };
}

/** All active slots with their role assignments (UI display) */
export function getActiveRoleMap(): Array<{
  slotId: string;
  provider: string;
  model: string;
  roles: SandboxId[];
  label: string;
}> {
  const config = loadMultiKeyConfig();
  return config.slots
    .filter((s) => s.enabled && s.apiKey)
    .map((s) => ({
      slotId: s.id,
      provider: s.provider,
      model: s.model,
      roles: s.assignedRoles,
      label: s.label,
    }));
}
