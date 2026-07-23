import { buildVisionChatRequest } from '@/lib/vision-byok';

describe('buildVisionChatRequest', () => {
  test('passes the stored Gemini key and catalog default model to chat', () => {
    expect(buildVisionChatRequest({
      provider: 'gemini',
      key: 'test-google-key',
      model: '',
    })).toEqual({
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      apiKey: 'test-google-key',
    });
  });

  test('preserves an explicitly selected Gemini model', () => {
    expect(buildVisionChatRequest({
      provider: 'gemini',
      key: 'test-google-key',
      model: 'gemini-2.5-flash',
    })).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      apiKey: 'test-google-key',
    });
  });

  test('returns null when no browser BYOK key is available', () => {
    expect(buildVisionChatRequest(null)).toBeNull();
  });
});
