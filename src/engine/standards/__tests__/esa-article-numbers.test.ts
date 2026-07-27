/**
 * 전기안전관리법으로 인용한 조문 번호가 실재하는지 본다.
 *
 * 이 데이터는 사용자에게 **과태료·징역형과 함께** 조문 번호로 표시된다.
 * 없는 번호나 구법 번호를 대면 감리·검사에서 근거를 댈 수 없다.
 *
 * 실측 2026-07-27: 전기안전관리법(2020 제정 / 2021.4.1 시행)이 전기사업법의
 * 안전 조항을 이관해 갔는데 이 파일은 구 번호를 그대로 이고 있었다 —
 * 사용전검사를 제63조(현행 제9조), 정기검사를 제62조(제11조), 전기안전관리자
 * 선임을 제73조(제22조), 과태료를 제101조(제52조)로 대고 있었다.
 *
 * KEC 와 같은 구조인데 다른 점이 하나 있다. KEC 는 현행 전문 1,834 항을
 * 픽스처로 갖고 있어 전수 대조가 됐고, 여기는 오라클이 없어서 오래 몰랐다.
 * 그래서 조문 목록을 먼저 확보하고(fixtures/esa/…tsv) 이 검사를 붙였다.
 *
 * ## 이 검사가 못 보는 것
 *
 * 오라클이 **번호와 제목만** 담아서 과태료 액수·징역 연수는 대조하지 못한다.
 * "1000만 원 이하 과태료" 가 맞는지는 본문이 있어야 안다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..');
const FIXTURE = join(REPO, 'fixtures', 'esa', 'electrical-safety-act-articles.tsv');

const OFFICIAL = new Map(
  readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('\t');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string];
    }),
);

/** `전기안전관리법 제9조` 처럼 이 법을 근거로 댄 자리. */
const CITATION = /전기안전관리법\s*(제\d+조(?:의\d+)?)/g;

function collect(src: string): string[] {
  return [...src.matchAll(CITATION)].map((m) => m[1]);
}

describe('전기안전관리법 조문 인용', () => {
  const ESA = readFileSync(join(REPO, 'src/engine/standards/esa/esa-articles.ts'), 'utf8');

  it('픽스처가 제대로 읽힌다 — 빈 목록으로 통과하면 검사가 아니다', () => {
    expect(OFFICIAL.size).toBeGreaterThan(40);
    expect(OFFICIAL.get('제9조')).toBe('사용전검사');
    expect(OFFICIAL.get('제11조')).toBe('정기검사');
    expect(OFFICIAL.get('제22조')).toBe('전기안전관리자의 선임 등');
    expect(OFFICIAL.get('제52조')).toBe('과태료');
  });

  it('인용을 실제로 잡는다 — 0 건을 잡고 통과하면 검사가 아니다', () => {
    expect(collect(ESA).length).toBeGreaterThan(5);
  });

  it('인용한 조문이 전부 실재한다', () => {
    const missing = [...new Set(collect(ESA))].filter((a) => !OFFICIAL.has(a)).sort();
    expect(missing).toEqual([]);
  });

  /**
   * 규격 브라우저 카탈로그(`data/standards/standard-refs.ts`)의 ESA 항목.
   *
   * 조문 파일과 **별도 데이터**인데 화면에 뜨는 건 이쪽이다. 조문 파일만
   * 고치고 카탈로그를 빠뜨려서, 정정한 뒤에도 화면에는 구 전기사업법
   * 번호(61/62/63/64)가 그대로 보이고 있었다 — KEC 카탈로그에서 이미 한 번
   * 겪은 일을 되풀이했다.
   */
  it('카탈로그의 ESA 조문도 전기안전관리법에 실재한다', () => {
    const src = readFileSync(join(REPO, 'src/data/standards/standard-refs.ts'), 'utf8');
    const block = src.slice(
      src.indexOf('const ESA_REFS: StandardRef[] = ['),
      src.indexOf('\n];', src.indexOf('const ESA_REFS: StandardRef[] = [')),
    );
    const clauses = [...block.matchAll(/clause:\s*'(\d+)'/g)].map((m) => `제${m[1]}조`);

    // 정규식이 죽으면 빈 목록으로 통과한다 — 그게 사각을 만드는 방식이다.
    expect(clauses.length).toBeGreaterThan(4);

    // 제99조는 전기공사업법 소관이라 이 법에 없다(조문 파일에도 그렇게 적었다).
    const missing = clauses.filter((c) => c !== '제99조' && !OFFICIAL.has(c)).sort();
    expect(missing).toEqual([]);
  });

  it('구 전기사업법 번호가 되살아나지 않는다', () => {
    // 이관 전 번호들. 주석에서 "구 제63조" 처럼 설명하는 것은 허용한다.
    const RETIRED = ['제62조', '제63조', '제73조', '제101조'];
    const offenders: string[] = [];
    for (const [i, line] of ESA.split('\n').entries()) {
      if (/^\s*(\/\/|\*)/.test(line)) continue;          // 주석
      if (/구 제|이관|전기안전관리법/.test(line)) continue; // 정정 이력·현행 인용
      for (const r of RETIRED) {
        if (line.includes(r)) offenders.push(`${i + 1}: ${line.trim().slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
