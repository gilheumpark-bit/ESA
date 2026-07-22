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
import { getFirstAvailableVisionKey, resolveSelectedModel } from '../vision-byok';
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

  it('저장된 모델이 현재 카탈로그에 없으면(구 모델 제거) 빈 문자열로 폴백한다', async () => {
    mockStorage.loadStoredProviderKey.mockImplementation(async (id) =>
      id === 'gemini' ? 'AIza-fake-key' : null,
    );
    mockStorage.loadSelectedModel.mockReturnValue('gemini-1.0-ancient-removed');

    const result = await getFirstAvailableVisionKey();
    expect(result?.model).toBe('');
  });

  it('어느 Vision 공급자도 키가 없으면 null 을 반환한다', async () => {
    mockStorage.loadStoredProviderKey.mockResolvedValue(null);
    mockStorage.loadSelectedModel.mockReturnValue(null);

    expect(await getFirstAvailableVisionKey()).toBeNull();
  });

  it('resolveSelectedModel: 유효 선택만 통과시키고 미등록 id 는 빈 문자열', () => {
    mockStorage.loadSelectedModel.mockReturnValue('gemini-3.5-flash'); // 카탈로그 존재
    expect(resolveSelectedModel('gemini')).toBe('gemini-3.5-flash');

    mockStorage.loadSelectedModel.mockReturnValue('nonexistent-model'); // 카탈로그 부재
    expect(resolveSelectedModel('gemini')).toBe('');
  });
});
