/**
 * 공급자 실패를 "사용자가 무엇을 해야 하는지" 로 번역한다.
 *
 * 실측 2026-07-27: Gemini 가 503(과부하)을 냈는데 화면 문구는 "API 키·모델·
 * 파일을 확인하세요" 였다. 그래서 멀쩡한 키를 직접 조회하고(모델 50 개 정상
 * 응답) 파일 크기를 대조하고 코드 변경을 의심하는 데 몇 분을 썼다. 원인이
 * 상대편에 있는데 이쪽을 뒤지게 만드는 문구는 아무 말도 안 하는 것보다 나쁠 수
 * 있다 — 틀린 방향으로 확신을 준다.
 *
 * 사가는 `failedStep`·`error` 를 갖고 있었는데 라우트가 버리고 있었다.
 */
import { classifyProviderFailure } from '@/app/api/sld/route';

describe('공급자 실패 분류', () => {
  it('503 과부하는 재시도 안내다 — 키·파일 탓으로 돌리지 않는다', () => {
    const r = classifyProviderFailure('[ESA-SLD] Gemini Vision error 503: overloaded');
    expect(r.status).toBe(503);
    expect(r.retryable).toBe(true);
    expect(r.message).toContain('잠시 후');
    expect(r.message).not.toContain('API 키를 확인');
  });

  it('429 한도는 한도라고 말한다', () => {
    const r = classifyProviderFailure('Gemini error 429: quota exceeded');
    expect(r.status).toBe(429);
    expect(r.retryable).toBe(true);
    expect(r.message).toContain('한도');
  });

  it('401/403 일 때만 키를 의심하게 한다', () => {
    for (const raw of ['error 401: unauthorized', 'error 403: permission denied', 'invalid api key']) {
      const r = classifyProviderFailure(raw);
      expect(r.code).toBe('ESA-6002');
      expect(r.retryable).toBe(false);
      expect(r.message).toContain('API 키');
    }
  });

  /**
   * 처음엔 단서를 주려고 원문을 잘라 넣었는데 기존 보안 테스트
   * (`SLD saga diagnostics stay server-side`)가 잡았다. 공급자 오류 문자열에는
   * 내부 경로·키 조각·모델명이 섞여 나올 수 있다. 도움을 주려다 유출을 만들 뻔했다.
   */
  it('분류가 안 돼도 원문을 클라이언트에 붙이지 않는다', () => {
    const secret = 'internal-path-/srv/keys/abc123-leaked';
    const r = classifyProviderFailure(`downstream failed: ${secret}`);
    expect(r.code).toBe('ESA-6001');
    expect(r.message).not.toContain(secret);
    expect(r.message).not.toContain('/srv/');
  });

  it('분류 불가여도 다음 행동은 알려준다', () => {
    const r = classifyProviderFailure('something unexpected');
    expect(r.message).toContain('다시 시도');
  });

  it('재시도로 풀리는 것과 설정을 고칠 것이 갈린다', () => {
    expect(classifyProviderFailure('error 503').retryable).toBe(true);
    expect(classifyProviderFailure('error 429').retryable).toBe(true);
    expect(classifyProviderFailure('error 401').retryable).toBe(false);
    expect(classifyProviderFailure('error 400 bad request').retryable).toBe(false);
  });
});
