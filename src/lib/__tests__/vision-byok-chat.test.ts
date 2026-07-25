import { buildVisionChatRequest } from '@/lib/vision-byok';
import { getDefaultModel } from '@/lib/ai-providers';

describe('buildVisionChatRequest', () => {
  test('passes the stored Gemini key and catalog default model to chat', () => {
    // 기본 모델 ID 를 하드코딩하지 않는다 — 이 테스트가 보는 것은 "미선택이면
    // 카탈로그 기본값이 실려 나간다"는 배선이지 그 값이 무엇이냐가 아니다.
    // 값을 박아 두면 모델 세대가 바뀔 때마다 배선과 무관하게 red 가 된다
    // (실제로 gemini 기본값을 3.6 Flash 로 올릴 때 그렇게 걸렸다).
    expect(buildVisionChatRequest({
      provider: 'gemini',
      key: 'test-google-key',
      model: '',
    })).toEqual({
      provider: 'gemini',
      model: getDefaultModel('gemini'),
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
