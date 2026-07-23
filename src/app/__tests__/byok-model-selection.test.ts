import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('BYOK provider model selection surface', () => {
  it('loads provider-reported models and exposes them in the saved-key selector', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/(with-nav)/settings/byok/page.tsx'), 'utf8');

    expect(page).toContain('availableModels: ProviderModelOption[]');
    expect(page).toContain('body.data?.models');
    expect(page).toContain('키 확인·모델 불러오기');
    expect(page).toContain('API에서 조회한 모델');
    expect(page).toContain('models={state.availableModels}');
  });

  it('labels the Gemini probe as basic call compatibility, not drawing quality', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/(with-nav)/settings/byok/page.tsx'), 'utf8');

    expect(page).toContain('기본 호출 호환성 검사');
    expect(page).toContain("action: 'probe-model'");
    expect(page).toContain('텍스트');
    expect(page).toContain('이미지 입력');
    expect(page).toContain('도면 판독 품질을 보증하지 않습니다');
    expect(page).not.toContain('전체 모델 호환성 검사');
  });
});
