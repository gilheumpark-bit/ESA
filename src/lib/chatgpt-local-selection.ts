'use client';

export const CHATGPT_LOCAL_SELECTION_KEY = 'esa-chatgpt-local';

const SAFE_MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;

export interface ChatGPTLocalSelection {
  enabled: boolean;
  model: string;
}

export interface ChatGPTLocalSelectableModel {
  id: string;
  inputModalities: Array<'text' | 'image'>;
}

interface SelectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): SelectionStorage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function isSafeModelId(model: string): boolean {
  return SAFE_MODEL_ID.test(model) && !model.includes('..') && !model.includes('//');
}

export function loadChatGPTLocalSelection(
  storage: SelectionStorage | null = defaultStorage(),
): ChatGPTLocalSelection {
  if (!storage) return { enabled: false, model: '' };
  try {
    const raw = storage.getItem(CHATGPT_LOCAL_SELECTION_KEY);
    if (!raw) return { enabled: false, model: '' };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const enabled = parsed.enabled === true;
    const model = typeof parsed.model === 'string' ? parsed.model : '';
    if (!enabled) return { enabled: false, model: '' };
    if (model && !isSafeModelId(model)) return { enabled: false, model: '' };
    return { enabled: true, model };
  } catch {
    return { enabled: false, model: '' };
  }
}

export function saveChatGPTLocalSelection(
  selection: ChatGPTLocalSelection,
  storage: SelectionStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  if (!selection.enabled) {
    storage.removeItem(CHATGPT_LOCAL_SELECTION_KEY);
    return;
  }
  if (selection.model && !isSafeModelId(selection.model)) {
    throw new Error('지원하지 않는 ChatGPT 모델 식별자입니다.');
  }
  storage.setItem(CHATGPT_LOCAL_SELECTION_KEY, JSON.stringify({
    enabled: true,
    model: selection.model,
  }));
}

export function resolveChatGPTLocalModel(
  selection: ChatGPTLocalSelection,
  models: ChatGPTLocalSelectableModel[],
  modality: 'text' | 'image',
): string | null {
  if (!selection.enabled) return null;
  const selected = models.find((model) => (
    model.id === selection.model && model.inputModalities.includes(modality)
  ));
  if (selected) return selected.id;
  return models.find((model) => model.inputModalities.includes(modality))?.id ?? null;
}
