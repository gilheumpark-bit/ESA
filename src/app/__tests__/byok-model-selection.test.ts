import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('BYOK provider model selection surface', () => {
  it('separates the local ChatGPT account from provider API-key connections', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/(with-nav)/settings/byok/page.tsx'), 'utf8');
    const accountCard = readFileSync(join(process.cwd(), 'src/components/ChatGPTLocalCard.tsx'), 'utf8');

    expect(page).toContain('aria-label="AI 연결 방식"');
    expect(page).toContain('id="chatgpt-account"');
    expect(page).toContain('id="provider-api-keys"');
    expect(page).toContain('ChatGPT 로그인 계정과 API 키는 서로 다른 연결 방식입니다.');
    expect(page).toContain('공급자 API 키 (BYOK)');
    expect(accountCard).toContain('같은 PC에 Codex 설치');
    expect(accountCard).toContain('API 키 아님');
  });

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
