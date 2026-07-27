import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * IPFS 타임스탬프 등록은 **꺼진 기능**이다(`RECEIPT_NOTARIZE: false`).
 * 그런데 코드에는 켜는 순간 새는 구멍이 둘 남아 있다:
 *
 *  ① `/api/notarize` POST 가 `verifyUrl: /receipt/{id}?verify=true` 를
 *     돌려주고 화면이 "검증 페이지 열기" 링크를 그리는데, **그 쿼리를 읽는
 *     코드가 없다.** 누르면 같은 화면이 다시 뜬다(§2.8 스텁 어포던스).
 *  ② 증명 레지스트리 대조 `verifyProof`(IPFS CID·txHash 불일치 검출)가
 *     **호출처 0** 이다.
 *
 * 지금 배선하지 않는 이유는 로직이 틀려서가 아니다 — 대조 자체는 성립한다
 * (영수증 행 `metadata.ipfsCid` 와 proofs 표는 서로 다른 시점에 쓰인 별개
 * 저장소라 자기 대조가 아니다). **꺼진 기능에 UI 를 더 짓지 않기 위해서**다.
 *
 * 그래서 이 검사는 "지금 이대로가 맞다" 를 잠그지 않는다. **플래그를 켜는
 * 순간 깨지도록** 잠근다 — 켜는 사람이 대장을 읽고 두 구멍을 함께 닫게
 * 하는 것이 목적이다.
 */
const REPO = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

describe('IPFS 타임스탬프 — 휴면 선언', () => {
  it('플래그가 꺼져 있다 — 켜려면 대장의 ①② 를 먼저 닫아라', () => {
    const flags = read('src/lib/feature-flags.ts');
    expect(flags).toMatch(/RECEIPT_NOTARIZE:\s*false/);
  });

  it('대장이 두 구멍을 이름으로 적고 있다', () => {
    const manifest = read('docs/DORMANT_MANIFEST.md');
    expect(manifest).toContain('verifyUrl');
    expect(manifest).toContain('verifyProof');
    expect(manifest).toContain('RECEIPT_NOTARIZE=true');
  });

  /**
   * 구멍 ① — 아직 열려 있음을 명시한다. 누군가 `?verify=true` 를 읽도록
   * 고치면 이 검사가 깨지고, 그때 대장에서 ① 을 지우면 된다.
   */
  it('① `?verify=true` 는 아직 아무도 읽지 않는다', () => {
    const page = read('src/app/(with-nav)/receipt/[id]/page.tsx');
    expect(page).not.toContain('useSearchParams');
    expect(page).not.toMatch(/searchParams.*verify/);
  });

  /** 구멍 ② — 증명 대조는 아직 호출처가 없다. */
  it('② `verifyProof` 는 아직 호출처가 없다', () => {
    const hits = execSync(
      'git grep -l "verifyProof" -- src/app src/components src/lib || true',
      { cwd: REPO, encoding: 'utf8' },
    )
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((f) => !f.includes('lib/blockchain.ts') && !f.includes('__tests__'));
    expect(hits).toEqual([]);
  });

  /**
   * 켜기 전이라도 이건 지금 지켜야 한다 — 등록 버튼이 플래그 밖으로 새면
   * 사용자가 죽은 "검증 페이지 열기" 에 도달한다.
   */
  it('등록 버튼은 플래그 뒤에 있다', () => {
    const page = read('src/app/(with-nav)/receipt/[id]/page.tsx');
    expect(page).toMatch(/isFeatureEnabled\('RECEIPT_NOTARIZE'\)\s*&&\s*<TimestampRegistrationButton/);
  });
});
