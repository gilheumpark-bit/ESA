/**
 * 상호참조의 `note` 문구가 그 조항의 실제 표제와 맞는지 훑는다.
 *
 * **게이트가 아니라 감사 도구다.** 자동 판정에 쓰면 안 된다.
 *
 * 왜: note 는 표제를 되풀이하는 자리가 아니라 "이 참조가 무엇에 쓰이는지"
 * 를 적는 자리다. "온도 보정" · "밀집 보정" · "그룹 보정과 동시 적용 주의"
 * 같은 정당한 note 가 표제와 안 겹친다. 실측 45 건 중 15 건이 유사도
 * 0.3 미만인데 그중 대부분이 그런 경우다.
 *
 * 그래도 돌릴 값어치가 있다 — 2026-07-27 1 회 실행으로 진짜 2 건을 잡았다:
 *
 *   KEC-212.4  note "KEC 누전차단기"   212.4 는 과부하전류 보호다(→ 211.2.4)
 *   KEC-232.31 note "KEC 매설 깊이"    232.31 은 금속덕트공사다(→ 334.1)
 *
 * 둘 다 `cross-references-resolve` 게이트를 통과했다. **대상이 실재하기
 * 때문이다** — 그 게이트가 못 보는 "실재하는데 엉뚱한 조항" 이 이 모양이다.
 *
 * 사용: node scripts/audit-reference-notes.mjs
 *       유사도 낮은 순으로 나오니 사람이 위에서부터 읽고 판단한다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.cwd().split(String.fromCharCode(92)).join('/');

const OFFICIAL = new Map(
  readFileSync(join(REPO, 'fixtures/kec/.source/kec2026-full.tsv'), 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => {
      const i = l.indexOf('\t');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const norm = (t) => t.replace(/[·—\-()[\]{},./\s]/g, '');
const bigrams = (t) => {
  const s = norm(t); const o = new Set();
  for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2));
  return o;
};
const dice = (a, b) => {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let c = 0; for (const x of A) if (B.has(x)) c++;
  return (2 * c) / (A.size + B.size);
};

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === '__tests__') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const REF = /\{\s*articleId:\s*'KEC-([\d.]+)',\s*relation:\s*'\w+',\s*note:\s*'([^']*)'\s*\}/g;

/**
 * 문자열 상호참조. NER/ESA 는 `crossRef: ['KEC 232.33조']` 처럼 배열로
 * 가리킨다 — 위 REF 가 못 잡아서 오래 사각이었다.
 *
 * 괄호 안 설명이 있으면 그것을, 없으면 '조' 앞 숫자만 남긴다.
 */
const XREF = /'KEC\s*([0-9]+(?:\.[0-9]+)*)조?\s*(?:\(([^)]*)\))?[^']*'/g;

const rows = [];
for (const f of walk(join(REPO, 'src/engine/standards'))) {
  const rel = f.replace(REPO + '/', '').split('\\').join('/');
  for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
    if (/^\s*\/\//.test(line)) continue;
      for (const m of line.matchAll(XREF)) {
        const [, num, paren] = m;
        const off = OFFICIAL.get(num);
        if (!off) continue;
        const topic = (paren ?? '').replace(/KEC|[\d.]+/g, '').trim();
        if (topic.length < 2) continue;   // 설명이 없으면 대조할 것이 없다
        rows.push({ num, note: m[0], topic, off, d: dice(topic, off), where: `${rel}:${i + 1}` });
      }
    for (const m of line.matchAll(REF)) {
      const [, num, note] = m;
      const off = OFFICIAL.get(num);
      if (!off) continue;
      // note 에서 규격명·번호를 걷어내고 주제어만 남긴다
      const topic = note.replace(/KEC|NEC|IEC|JIS|[\d.]+/g, '').trim();
      if (topic.length < 2) continue;                 // "KEC 232.5" 처럼 주제어가 없으면 대조 불가
      rows.push({ num, note, topic, off, d: dice(topic, off), where: `${rel}:${i + 1}` });
    }
  }
}

rows.sort((a, b) => a.d - b.d);
console.log(`note 대조 가능 ${rows.length}건\n`);
console.log('── 유사도 낮은 순 15 ──');
for (const r of rows.slice(0, 15)) {
  console.log(`${r.d.toFixed(2)}  ${r.num.padEnd(9)} note "${r.topic}"`);
  console.log(`      현행 "${r.off}"   ${r.where}`);
}
const low = rows.filter((r) => r.d < 0.3);
console.log(`\n유사도 0.3 미만 = ${low.length}건 / ${rows.length}`);
