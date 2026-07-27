import { assertUrlAllowedForFetch } from '@/lib/fetch-url-guard';

/**
 * SSRF 방어가 실제로 막는지 본다.
 *
 * **이 가드는 현재 호출처가 0 이다**(2026-07-28 확인 — `security/index.ts`
 * 재-export 하나뿐이고 그 export 를 쓰는 코드도 없다). 타 저장소
 * (eh-universe-web)에서 옮겨오고 여기서는 배선되지 않았다.
 *
 * 그래도 잠근다. 사용자 URL 을 가져오는 경로가 생기면 이 함수를 쓸 것이고,
 * 그때 구멍이 있으면 늦다. 실제로 이번에 두 개가 열려 있었다:
 *   `http://[::ffff:127.0.0.1]/` — IPv4-매핑 IPv6 루프백 (통과했다)
 *   `http://localhost./`         — 끝점 FQDN 표기 (통과했다)
 *
 * 참고: 현재 사용자 지정 URL 을 실제로 가져오는 경로(온프레미스 LLM)는
 * 별도 가드(`validateOnpremiseTarget`·`validateLocalProviderUrl`)가 chat·
 * settings 라우트에 배선돼 있다. 그쪽은 이 함수와 무관하다.
 *
 * 한계: DNS 리바인딩은 정적 검사로 못 막는다. 헤더가 적은 대로
 * "네트워크 계층 egress 통제를 대신하지 않는다".
 */
describe('SSRF 가드 — 사설·로컬 대상 차단', () => {
  const blocked = [
    ['http://127.0.0.1/', '루프백'],
    ['http://localhost/', '이름'],
    ['http://LOCALHOST/', '대문자'],
    ['http://localhost./', '끝점 FQDN — DNS 는 같은 곳으로 해석한다'],
    ['http://10.0.0.1/', '사설 10/8'],
    ['http://172.16.0.1/', '사설 172.16/12'],
    ['http://192.168.1.1/', '사설 192.168/16'],
    ['http://169.254.169.254/', '링크로컬 — 클라우드 메타데이터'],
    ['http://metadata.google.internal/', '메타데이터 이름'],
    ['http://100.64.0.1/', 'CGNAT'],
    ['http://0.0.0.0/', '미지정'],
    ['http://2130706433/', '십진수 표기 — URL 파서가 정규화한다'],
    ['http://0x7f000001/', '16진수 표기'],
    ['http://127.1/', '축약 표기'],
    ['http://[::1]/', 'IPv6 루프백'],
    ['http://[::ffff:127.0.0.1]/', 'IPv4-매핑 IPv6 루프백'],
    ['http://[::ffff:10.0.0.1]/', 'IPv4-매핑 사설'],
    ['http://[fc00::1]/', 'unique-local'],
    ['http://[fe80::1]/', 'link-local'],
    ['file:///etc/passwd', 'file 스킴'],
    ['ftp://example.com/', 'ftp 스킴'],
    ['not a url', '형식 오류'],
  ] as const;

  it.each(blocked)('%s 를 막는다 — %s', (url) => {
    expect(assertUrlAllowedForFetch(url).ok).toBe(false);
  });

  const allowed = [
    'http://example.com/',
    'https://example.com/path?q=1',
    'https://api.openai.com/v1/models',
    'http://8.8.8.8/',
    'https://[2001:4860:4860::8888]/',
  ];

  it.each(allowed)('%s 는 통과시킨다 — 과잉 차단도 결함이다', (url) => {
    expect(assertUrlAllowedForFetch(url).ok).toBe(true);
  });

  it('통과 시 정규화된 href 를 돌려준다', () => {
    const r = assertUrlAllowedForFetch('https://Example.COM/a/../b');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.href).toBe('https://example.com/b');
  });
});
