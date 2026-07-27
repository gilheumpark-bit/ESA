/**
 * `src/` 어디서든 KEC 조항 번호를 인용하면 그 번호가 실재해야 한다.
 *
 * 이 게이트가 필요한 이유는 앞선 게이트들이 **형태로** 대상을 골랐기 때문이다.
 * `buildArticle('KEC-…')` / `kec('…')` / `articleId:` 를 찾는 정규식은 그
 * 형태가 아닌 데이터를 통째로 지나쳤고, 그래서 다음이 오래 틀린 채 살아 있었다:
 *
 *   규격 브라우저 카탈로그   12 건 중 10 건 (410 을 "옥내배선" 으로 — 제4편 전기철도다)
 *   검색 자동완성            13 건 중 12 건 (232 를 "고압·특고압 전선로" 로)
 *   점검 체크리스트 legalBasis  9 건 전부 (접지저항 142.3 ↔ 접지선 142.2 뒤바뀜)
 *   지식 그래프 노드          7 건 전부 (140·210·220·230·310·520 은 없는 번호)
 *   자격증 과목 relatedArticles 9 건
 *
 * 그래서 여기서는 형태를 보지 않고 **`KEC` 뒤에 오는 조항 번호를 전부** 잡는다.
 * 새 파일이 새 모양으로 인용해도 걸린다.
 *
 * 번호가 실재하는지만 본다. "그 번호에 그 내용이 맞는가" 는 옆 파일
 * `clause-titles-match` 소관이다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..', '..');

const OFFICIAL = new Set(
  readFileSync(join(REPO, 'fixtures', 'kec', 'clause-numbers.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')),
);

/**
 * `KEC-232.5.2` · `KEC 232.5.2` · `KEC 142조` 를 잡는다.
 *
 * 안 잡는 것:
 *   `KEC 2021`   연도 (뒤에 숫자가 더 붙는다)
 *   `KEC 100m`   길이 (뒤에 단위가 붙는다 — 실측 오탐이었다)
 */
const CITATION = /KEC[\s-]*(\d{3}(?:\.\d+)*)(?!\d)(?!\s?(?:m|km|mm|cm|kV|V|A|kA|W|kW|VA|Ω|%|°C)\b)/g;

/**
 * 인용이 아니라 **인용이 틀렸음을 적는 줄**은 통과시킨다. 이 리포는 정정
 * 이력을 주석으로 남기는데, 그 줄에 옛 번호가 들어간다.
 */
const EXPLANATORY = /없는 번호|없다|아니다|아님|폐지|→|구 판단기준|구 내선규정|해소|재번호|정정|이었다|였다|틀렸|달고 있었|참조용|대응|뺐다|옮겼|합쳤|구 \d/;

/**
 * 아직 정정하지 못한 인용. **줄이는 것이 목표이고 늘리면 안 된다.**
 * 표제로는 여러 조항에 걸리는데 본문 없이 못 가른 것들이다.
 */
const DECLARED = new Set([
  // 360.1 전력구·관로 (환기·소화·배수·조명). 334 지중전선로의 하위
  // (334.1 시설 · 334.2 지중함 · 334.3 가압장치 …)에 그 항목이 없다.
  // 한전 전력구 설계기준일 가능성이 크다 — 확인 없이 334 로 옮기면 틀린
  // 번호를 다른 틀린 번호로 바꾸는 것이라 그대로 둔다.
  //
  // 313.1 → 351.7 배전반의 시설 (모선은 배전반 구성요소) · 320.1 → 342.1
  // 고압 옥내배선 등의 시설 · 350.1 → 351.4 특고압용 변압기의 보호장치
  // 는 2026-07-27 에 해소했다.
  '360.1',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe('KEC 조항 인용 — 리포 전역', () => {
  const files = walk(join(REPO, 'src'));

  it('파일을 실제로 훑는다 — 0 개를 훑고 통과하면 검사가 아니다', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('정규식이 실제로 인용을 잡는다', () => {
    const hit = [...'KEC-232.5.2 와 KEC 142조'.matchAll(CITATION)].map((m) => m[1]);
    expect(hit).toEqual(['232.5.2', '142']);
    // 연도도 길이도 조항이 아니다
    expect([...'KEC 2021 개정'.matchAll(CITATION)].length).toBe(0);
    expect([...'KEC 100m 가산'.matchAll(CITATION)].length).toBe(0);
  });

  it('인용한 KEC 번호가 전부 실재한다', () => {
    const violations: string[] = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      for (const [i, line] of lines.entries()) {
        if (EXPLANATORY.test(line)) continue;
        for (const m of line.matchAll(CITATION)) {
          const clause = m[1];
          if (OFFICIAL.has(clause) || DECLARED.has(clause)) continue;
          violations.push(`${relative(REPO, f)}:${i + 1}  KEC ${clause}  —  ${line.trim().slice(0, 60)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
