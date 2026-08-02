import {
  loadChatGPTLocalSelection,
  resolveChatGPTLocalModel,
  saveChatGPTLocalSelection,
} from '@/lib/chatgpt-local-selection';

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

const models = [
  { id: 'gpt-5.6-terra', name: 'Terra', inputModalities: ['text', 'image'] as Array<'text' | 'image'> },
  { id: 'gpt-5.3-codex-spark', name: 'Spark', inputModalities: ['text'] as Array<'text' | 'image'> },
];

describe('ChatGPT local browser selection', () => {
  it('stores only the enabled flag and safe model id', () => {
    const storage = new MemoryStorage();

    saveChatGPTLocalSelection({ enabled: true, model: 'gpt-5.6-terra' }, storage);

    expect(loadChatGPTLocalSelection(storage)).toEqual({
      enabled: true,
      model: 'gpt-5.6-terra',
    });
  });

  it('disables a tampered model id instead of returning it to a request', () => {
    const storage = new MemoryStorage();
    storage.setItem('esa-chatgpt-local', JSON.stringify({
      enabled: true,
      model: '../unsafe',
      accessToken: 'must-not-be-consumed',
    }));

    expect(loadChatGPTLocalSelection(storage)).toEqual({
      enabled: false,
      model: '',
    });
  });

  it('uses the selected model only when it supports the requested modality', () => {
    expect(resolveChatGPTLocalModel(
      { enabled: true, model: 'gpt-5.3-codex-spark' },
      models,
      'image',
    )).toBe('gpt-5.6-terra');
    expect(resolveChatGPTLocalModel(
      { enabled: true, model: 'gpt-5.3-codex-spark' },
      models,
      'text',
    )).toBe('gpt-5.3-codex-spark');
  });

  it('returns null when the local account selection is disabled', () => {
    expect(resolveChatGPTLocalModel(
      { enabled: false, model: 'gpt-5.6-terra' },
      models,
      'text',
    )).toBeNull();
  });
});
