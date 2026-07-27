/**
 * 규격 간 상호참조(`relatedClauses`)가 실재하는 조항을 가리키는지 본다.
 *
 * 조항끼리는 `articleId` 로 서로를 가리킨다 — JIS 701.1 이 "KEC 욕실 구역" 을,
 * NEC 310.16 이 "KEC 허용전류" 를 가리키는 식이다. 이 참조가 없는 조항을
 * 가리키면 **화면에서 그 링크가 조용히 사라진다.** 예외도 타입 에러도 없다.
 *
 * 실측 2026-07-27: JIS 701.1 이 `KEC-250.1`(욕실)을 동등 조항으로 가리키고
 * 있었는데 그 조항은 KEC 에 없다. NEC 는 `KEC-232.4`(중성선 고조파)를
 * "누전차단기 설치" 로 가리켰다 — 같은 번호를 리포·NEC·현행이 각자 다르게
 * 알고 있었다. 조항을 재번호할 때마다 이런 것이 생기는데 2,100 개 테스트가
 * 하나도 잡지 못했다.
 *
 * 소스가 아니라 **등록부를 조회한다** — 소스에 정의가 있어도 중복 가드에
 * 버려지면 링크는 죽는다.
 *
 * ## 이 게이트가 못 보는 것
 *
 * **대상이 실재하는데 엉뚱한 조항인 경우.** NEC 408.36(분전반 최대 42 회로)이
 * `KEC-242.1` 을 "KEC 분전반 회로수" 로 가리키고 있었는데 242.1 은 방전등
 * 공사의 시설 제한이다. 242.1 이 등록돼 있으면 이 검사는 통과한다.
 *
 * 정의 쪽은 `kec/__tests__/clause-titles-match` 가 번호와 표제를 대조해서
 * 잡지만, **참조의 note 문구는 대조할 상대가 없다.** 사람이 읽어야 한다.
 * 그래서 이 게이트를 "상호참조가 옳다" 의 근거로 쓰면 안 된다 —
 * "가리키는 곳이 존재한다" 까지다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..');
const ROOT = join(REPO, 'src', 'engine', 'standards');

/** `{ articleId: 'KEC-232.5.2', relation: … }` */
const REF = /articleId:\s*'([A-Z]+)-([^']+)'/g;

/**
 * 아직 정리하지 못한 참조. **줄이는 것이 목표이고 늘리면 안 된다.**
 *
 * NEC/IEC/JIS 는 이 리포가 조항을 일부만 싣고 있어서, 실재하는 조항을
 * 가리키는데도 등록부에 없을 수 있다. KEC 는 현행 색인 전체를 픽스처로
 * 갖고 있어 그런 변명이 없다.
 */
const DECLARED = new Set<string>([]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(p)) out.push(p);
  }
  return out;
}

describe('규격 간 상호참조', () => {
  const files = walk(ROOT);

  it('참조를 실제로 읽는다 — 0 개를 읽고 통과하면 검사가 아니다', () => {
    const n = files.reduce((acc, f) => acc + [...readFileSync(f, 'utf8').matchAll(REF)].length, 0);
    expect(n).toBeGreaterThan(50);
  });

  it('KEC 를 가리키는 참조가 전부 등록된 조항이다', async () => {
    const { KEC_ARTICLES } = await import('@/engine/standards/kec');
    const violations: string[] = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      for (const [i, line] of lines.entries()) {
        // 정정 이력을 적은 주석 줄은 옛 번호를 담는다.
        if (/^\s*\/\//.test(line)) continue;
        for (const m of line.matchAll(REF)) {
          if (m[1] !== 'KEC') continue;
          const id = `KEC-${m[2]}`;
          if (KEC_ARTICLES.has(id) || DECLARED.has(id)) continue;
          violations.push(`${relative(REPO, f)}:${i + 1}  ${id}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('IEC·JIS 를 가리키는 참조가 전부 등록된 조항이다', async () => {
    const [{ getIECArticle }, { getJISArticle }] = await Promise.all([
      import('@/engine/standards/iec/iec-articles'),
      import('@/engine/standards/jis/jis-articles'),
    ]);
    const violations: string[] = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      for (const [i, line] of lines.entries()) {
        if (/^\s*\/\//.test(line)) continue;
        for (const m of line.matchAll(REF)) {
          const [, std, num] = m;
          if (std !== 'IEC' && std !== 'JIS') continue;
          const id = `${std}-${num}`;
          const found = std === 'IEC' ? getIECArticle(id) : getJISArticle(id);
          if (found || DECLARED.has(id)) continue;
          violations.push(`${relative(REPO, f)}:${i + 1}  ${id}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
