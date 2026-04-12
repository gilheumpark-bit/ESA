/**
 * ESVA Token Estimation & Context Window Management
 * ──────────────────────────────────────────────────
 * PART 1: Token estimation
 * PART 2: Context limits per provider/model
 * PART 3: Truncation & output budget
 */

import type { ChatMessage } from '@/lib/ai-providers';

// ─── PART 1: Token Estimation ────────────────────────────────────

/**
 * Estimate token count using CJK density heuristic.
 * Korean/CJK: ~1.5 tokens per char, Latin: ~0.25 tokens per char (4 chars/token).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkChars = (text.match(/[\u3000-\u9fff\uac00-\ud7af]/g) || []).length;
  const otherChars = text.length - cjkChars;
  return Math.ceil(cjkChars * 1.5 + otherChars / 4);
}

// ─── PART 2: Context Limits ──────────────────────────────────────

/**
 * Context window limits aligned with ESA's ai-providers registry.
 * Keep in sync with PROVIDERS in ai-providers.ts.
 */
const CONTEXT_LIMITS: Record<string, number> = {
  // Gemini
  'gemini-2.5-pro': 1_048_576,
  'gemini-2.5-flash': 1_048_576,
  'gemini-2.5-flash-lite': 1_048_576,
  // OpenAI
  'gpt-4.1': 1_047_576,
  'gpt-4.1-mini': 1_047_576,
  'gpt-4.1-nano': 1_047_576,
  'o4-mini': 200_000,
  // Claude
  'claude-opus-4-20250514': 200_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  // Groq (Llama 4 + legacy)
  'meta-llama/llama-4-maverick-17b-128e-instruct': 128_000,
  'meta-llama/llama-4-scout-17b-16e-instruct': 128_000,
  'llama-3.3-70b-versatile': 128_000,
  'mixtral-8x7b-32768': 32_768,
  // Mistral
  'mistral-large-latest': 128_000,
  'mistral-small-latest': 128_000,
  'codestral-latest': 256_000,
  // DeepSeek
  'deepseek-chat': 128_000,
  'deepseek-reasoner': 128_000,
};

const DEFAULT_LIMIT = 128_000;

/** Context window token limit for the given model, or 128k default */
export function getContextLimit(model: string): number {
  return CONTEXT_LIMITS[model] ?? DEFAULT_LIMIT;
}

// ─── PART 3: Truncation & Output Budget ──────────────────────────

const OUTPUT_RESERVE_RATIO = 0.15;
const MIN_OUTPUT_RESERVE = 4096;
const MAX_OUTPUT_RESERVE = 16384;

/**
 * Calculate max output tokens based on remaining context budget.
 * Clamped between MIN_OUTPUT_RESERVE and MAX_OUTPUT_RESERVE.
 */
export function calculateMaxOutputTokens(
  model: string,
  inputTokens: number,
): number {
  const limit = getContextLimit(model);
  const available = limit - inputTokens;

  const reserved = Math.min(
    Math.max(Math.floor(limit * OUTPUT_RESERVE_RATIO), MIN_OUTPUT_RESERVE),
    MAX_OUTPUT_RESERVE,
  );

  return Math.max(MIN_OUTPUT_RESERVE, Math.min(reserved, available));
}

/**
 * Truncate message history to fit within context window.
 * Keeps the most recent messages; drops oldest first.
 * Always preserves the last user message.
 */
export function truncateToTokenLimit(
  messages: ChatMessage[],
  model: string,
  systemPrompt?: string,
): {
  messages: ChatMessage[];
  truncated: boolean;
  systemTokens: number;
  messageTokens: number;
} {
  const limit = getContextLimit(model);
  const systemTokens = estimateTokens(systemPrompt ?? '');

  const outputReserve = Math.max(
    Math.floor(limit * OUTPUT_RESERVE_RATIO),
    MIN_OUTPUT_RESERVE,
  );
  const messageBudget = limit - systemTokens - outputReserve;

  if (messageBudget <= 0) {
    const last = messages.slice(-1);
    return {
      messages: last,
      truncated: messages.length > 1,
      systemTokens,
      messageTokens: estimateTokens(last[0]?.content ?? ''),
    };
  }

  // Count from newest to oldest
  let totalTokens = 0;
  let cutIndex = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content);
    if (totalTokens + msgTokens > messageBudget) {
      cutIndex = i + 1;
      break;
    }
    totalTokens += msgTokens;
    if (i === 0) cutIndex = 0;
  }

  const trimmed = messages.slice(cutIndex);
  return {
    messages: trimmed.length > 0 ? trimmed : messages.slice(-1),
    truncated: cutIndex > 0,
    systemTokens,
    messageTokens: totalTokens,
  };
}

/** Unified history limits for ESVA */
export const HISTORY_LIMITS = {
  /** Max messages stored in localStorage */
  STORAGE: 50,
  /** Max messages sent to API for search queries */
  SEARCH_API: 10,
  /** Max messages sent to API for chat assistants */
  CHAT_API: 15,
} as const;
