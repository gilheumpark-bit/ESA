/**
 * KEC 조항 번호 색인을 공표 전문에서 다시 생성한다.
 *
 * 원문(`fixtures/kec/.source/kec2026-full.tsv`)은 저작권상 커밋하지 않으므로,
 * 저장소에는 **번호만** 남긴다. KEC 개정 시 원문을 새 판으로 바꾸고 이것을
 * 다시 돌린다.
 *
 *   node scripts/generate-kec-clause-index.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = 'fixtures/kec/.source/kec2026-full.tsv';
const OUT = 'src/engine/standards/kec/clause-index.ts';

if (!fs.existsSync(SOURCE)) {
  console.error(`원문이 없다: ${SOURCE}`);
  console.error('이 스크립트는 원문을 가진 로컬에서만 돈다. 생성물은 커밋돼 있다.');
  process.exit(2);
}

const numbers = [
  ...new Set(
    fs
      .readFileSync(SOURCE, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.split('\t')[0])
      .filter((n) => /^[0-9]+(\.[0-9]+)*$/.test(n)),
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
 * KEC 조항 번호 색인 — **판정이 아니라 존재 확인용.**
 *
 * 왜 필요한가 — 실측 2026-07-31: 어느 브랜치가 전압강하 인용을 12+ 파일에 걸쳐
 * \`232.51\` → \`232.52\` 로 «정본화» 했다. **232.52 는 KEC 에 없는 번호다.** 그
 * 브랜치의 자체 인용 검사도 232.52 를 허용 목록에 넣고 «저장소 안에서는 232.52
 * 가 정본이다» 로 정당화했다 — 리포 합의를 원문 대조로 착각한 것이고, 정확히
 * §2.3 닫힌 순환이다. 저장소가 스스로를 근거로 삼으면 무엇을 인용하든 통과한다.
 *
 * 그래서 이 목록의 출처는 저장소가 아니라 **공표된 KEC 전문의 조항 번호**다
 * (산업통상자원부 공고. 원문은 \`fixtures/kec/.source/\` 에 두고 커밋하지 않는다).
 * 번호만 담는다 — 본문도 표도 없다. 이 게이트가 하는 일은 «그 번호가 실재하는가»
 * 하나뿐이고, 그것이 232.52 를 잡는 데 필요한 전부다.
 *
 * 한계를 분명히 한다. 번호가 실재한다는 것이 **그 조항이 그 내용을 규정한다**는
 * 뜻은 아니다. 232.51(케이블공사)은 실재하지만 전압강하 조항이 아니다 — 전압강하는
 * 232.3.9 다. 조항의 내용 정합은 사람이 원문으로 봐야 한다(§2.10 도메인 진실).
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
console.log(`${OUT} 생성 — 조항 ${numbers.length} 개`);
