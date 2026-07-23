/**
 * getFirstAvailableVisionKey / resolveSelectedModel 의 모델 배선 회귀 방어.
 *
 * BYOK 설정에서 고른 모델이 Vision(도면·OCR·검토) 호출까지 흘러가는지, 그리고
 * 미선택/구모델일 때 빈 문자열로 떨어져 서버 vision 폴백을 보존하는지 검증한다.
 * (chat 기본 모델을 여기서 강제하면 OpenAI vision이 저티어로 강등되는 실측 회귀.)
 * §2.2(wired 착시) — "reader가 writer가 쓴 것을 실제로 읽는가"의 실행 가능한 봉인.
 * node 환경이라 window 전역만 정의하고 저장소는 mock 한다. getModelList 는 실제
 * 카탈로그를 쓰므로(mock 안 함) 카탈로그 존재 검증이 진짜로 돈다.
 */
import { getFirstAvailableVisionKey, isVisionProvider, resolveSelectedModel } from '../vision-byok';
import * as storage from '../byok-storage';

jest.mock('../byok-storage', () => ({
  loadStoredProviderKey: jest.fn(),
  loadSelectedModel: jest.fn(),
}));

const mockStorage = storage as jest.Mocked<typeof storage>;

describe('vision-byok — 모델 배선', () => {
  beforeAll(() => {
    // getFirstAvailableVisionKey 는 typeof window === 'undefined' 면 null 로 조기 반환한다.
    (globalThis as { window?: unknown }).window ??= {};
  });
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('키가 있는 공급자에 대해 카탈로그에 존재하는 선택 모델을 그대로 반환한다', async () => {
    mockStorage.loadStoredProviderKey.mockImplementation(async (id) =>
      id === 'gemini' ? 'AIza-fake-key' : null,
    );
    mockStorage.loadSelectedModel.mockImplementation((id) =>
      id === 'gemini' ? 'gemini-3.1-pro-preview' : null,
    );

    expect(await getFirstAvailableVisionKey()).toEqual({
      provider: 'gemini',
      key: 'AIza-fake-key',
      model: 'gemini-3.1-pro-preview',
    });
  });

  it('모델 미선택 시 빈 문자열을 반환한다(서버 vision 폴백 보존 · chat 기본 강제 금지)', async () => {
    mockStorage.loadStoredProviderKey.mockImplementation(async (id) =>
      id === 'gemini' ? 'AIza-fake-key' : null,
    );
    mockStorage.loadSelectedModel.mockReturnValue(null);

    const result = await getFirstAvailableVisionKey();
    expect(result?.model).toBe('');
  });

  it('공급자 API에서 선택한 안전한 모델은 정적 카탈로그에 없어도 전달한다', async () => {
    mockStorage.loadStoredProviderKey.mockImplementation(async (id) =>
      id === 'gemini' ? 'AIza-fake-key' : null,
    );
    mockStorage.loadSelectedModel.mockReturnValue('gemini-account-model-2026');

    const result = await getFirstAvailableVisionKey();
    expect(result?.model).toBe('gemini-account-model-2026');
  });

  it('어느 Vision 공급자도 키가 없으면 null 을 반환한다', async () => {
    mockStorage.loadStoredProviderKey.mockResolvedValue(null);
    mockStorage.loadSelectedModel.mockReturnValue(null);

    expect(await getFirstAvailableVisionKey()).toBeNull();
  });

  it('임베딩 공급자만 요청하면 Claude 키를 건너뛰고 Gemini 키를 찾는다', async () => {
    mockStorage.loadStoredProviderKey.mockImplementation(async (id) => {
      if (id === 'claude') return 'claude-test-key';
      if (id === 'gemini') return 'gemini-test-key';
      return null;
    });
    mockStorage.loadSelectedModel.mockReturnValue(null);

    expect(await getFirstAvailableVisionKey(['openai', 'gemini'])).toMatchObject({
      provider: 'gemini',
      key: 'gemini-test-key',
    });
  });

  it('resolveSelectedModel: 안전한 공급자 모델은 통과시키고 위험한 id 는 거부한다', () => {
    mockStorage.loadSelectedModel.mockReturnValue('gemini-3.5-flash'); // 카탈로그 존재
    expect(resolveSelectedModel('gemini')).toBe('gemini-3.5-flash');

    mockStorage.loadSelectedModel.mockReturnValue('provider-only-model-2026');
    expect(resolveSelectedModel('gemini')).toBe('provider-only-model-2026');

    mockStorage.loadSelectedModel.mockReturnValue('../unsafe?model');
    expect(resolveSelectedModel('gemini')).toBe('');
  });

  it('Vision 모델 선택 UI를 실제 OCR/도면 분석 공급자에만 허용한다', () => {
    expect(isVisionProvider('openai')).toBe(true);
    expect(isVisionProvider('claude')).toBe(true);
    expect(isVisionProvider('gemini')).toBe(true);
    expect(isVisionProvider('groq')).toBe(false);
    expect(isVisionProvider('mistral')).toBe(false);
  });
});
