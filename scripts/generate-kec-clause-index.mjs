/**
 * KEC 조항 번호 색인의 **TS 사본**을 정본 목록에서 생성한다.
 *
 * 정본은 `fixtures/kec/clause-numbers.txt` 다(기후에너지환경부 공고 제2025-227호
 * 전문에서 뽑은 번호 목록, 커밋돼 있다). 게이트는 그 파일을 직접 읽지만,
 * `agent/drawing/rule-basis.ts` 는 **브라우저에서 돈다** — 런타임에 파일을 읽을
 * 수 없으므로 번들에 들어갈 TS 모듈이 따로 필요하다.
 *
 * 두 벌이 되는 순간 어긋날 수 있으므로, 어긋나면
 * `standards/kec/__tests__/clause-citations-repo-wide.test.ts` 가 빨개진다.
 *
 *   node scripts/generate-kec-clause-index.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = 'fixtures/kec/clause-numbers.txt';
const OUT = 'src/engine/standards/kec/clause-index.ts';

if (!fs.existsSync(SOURCE)) {
  console.error(`정본 목록이 없다: ${SOURCE}`);
  process.exit(2);
}

const numbers = [
  ...new Set(
    fs
      .readFileSync(SOURCE, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .filter((line) => /^[0-9]+(\.[0-9]+)*$/.test(line)),
  ),
];

numbers.sort((a, b) => {
  const A = a.split('.').map(Number);
  const B = b.split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i += 1) {
    const d = (A[i] ?? -1) - (B[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
});

const header = `/**
 * KEC 조항 번호 색인 — **브라우저용 사본.**
 *
 * 정본은 \`fixtures/kec/clause-numbers.txt\` 다. 리포 전역 인용 게이트는 그
 * 파일을 직접 읽는다. 이 모듈이 따로 있는 이유는 하나뿐이다 —
 * \`agent/drawing/rule-basis.ts\` 가 브라우저에서 돌아 파일을 읽을 수 없다.
 *
 * 두 벌이 어긋나면 게이트가 빨개진다
 * (\`standards/kec/__tests__/clause-citations-repo-wide.test.ts\`).
 *
 * 하는 일은 «그 번호가 실재하는가» 하나다. 번호가 실재한다는 것이 **그 조항이
 * 그 내용을 규정한다**는 뜻은 아니다 — 232.51(케이블공사)은 실재하지만
 * 전압강하 조항이 아니다(전압강하는 232.3.9). 내용 정합은 사람이 원문으로
 * 본다(§2.10 도메인 진실).
 *
 * 이 파일은 생성물이다. 손으로 고치지 말고
 * \`node scripts/generate-kec-clause-index.mjs\` 로 다시 만든다.
 */

/** 공표 KEC 전문에 실재하는 조항 번호 ${numbers.length} 개. */
export const KEC_CLAUSE_INDEX: ReadonlySet<string> = new Set([
`;

const rows = [];
for (let i = 0; i < numbers.length; i += 10) {
  rows.push(`  ${numbers.slice(i, i + 10).map((n) => `'${n}'`).join(', ')},`);
}

const footer = `]);

/** 이 번호가 공표 KEC 전문에 실재하는가. */
export function isRealKecClause(clause: string): boolean {
  return KEC_CLAUSE_INDEX.has(clause);
}
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, header + rows.join('\n') + '\n' + footer);
console.log(`${OUT} 생성 — 조항 ${numbers.length} 개 (정본: ${SOURCE})`);
