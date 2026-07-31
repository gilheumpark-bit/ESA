/**
 * `fixtures/kec/clause-titles.tsv` 를 만든다 — 조항 표제 정합 게이트의 오라클.
 *
 * 왜 스크립트인가: 이 리포는 KEC 조항 번호를 규정 근거로 화면에 띄운다.
 * 번호가 실재하는지는 `clause-numbers.txt` 로 보는데, 그것만으로는 실재하는
 * 두 번호를 맞바꿔 달아도 통과한다(실측: 142.2 접지도체 ↔ 142.3 접지저항).
 * 표제가 있어야 "그 번호에 그 내용이 맞는가"를 볼 수 있다.
 *
 * 왜 전체를 커밋하지 않는가: 원문 전체 색인(1,834 항)은 국가표준 문서의
 * 상당 부분이다. 이 리포가 실제로 인용하는 번호의 표제만 뽑아 커밋한다 —
 * 규정 준수 도구가 자기가 인용하는 조항을 명시하는 만큼이다. 전체 색인은
 * `fixtures/kec/.source/` 에 두고 gitignore 한다.
 *
 * 사용:
 *   node scripts/build-kec-title-fixture.mjs [소스TSV경로]
 *
 * 소스 TSV 형식은 `번호\t표제` 한 줄씩이고, 현행 KEC 전문(한국전기설비규정,
 * 산업통상자원부 공고 / 시행 2026.1.5)에서 뽑는다. 원문은 .hwp 로만 배포되며
 * 추출 경로는 docs 에 남긴다.
 *
 * **인용 번호가 늘면 다시 돌려야 한다.** 게이트가 "인용했는데 표제 픽스처에
 * 없다"를 실패로 잡으니 잊어도 빨개진다.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.argv[2] ?? join(REPO, 'fixtures', 'kec', '.source', 'kec2026-full.tsv');
const OUT = join(REPO, 'fixtures', 'kec', 'clause-titles.tsv');

if (!existsSync(SOURCE)) {
  console.error(`원문 색인 없음: ${SOURCE}`);
  console.error('현행 KEC 전문에서 `번호\\t표제` TSV 를 만들어 그 경로에 두고 다시 돌려라.');
  process.exit(2);
}

const official = new Map(
  readFileSync(SOURCE, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => {
    const i = l.indexOf('\t');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

// **형태를 열거하지 않는다.** `createSource` 가 빠져 있어서 계산기 영수증의
// 인용이 표제 대조 대상에서 통째로 빠졌고, 픽스처에 표제가 없으니 게이트도
// 조용히 건너뛰었다 — 그 사이에 「용어의 정의」를 태양광 근거로 다는 오인용이
// 살아 있었다(2026-07-31 실측). 형태를 하나씩 보태는 한 다음 형태를 또 놓친다.
//
// 그래서 형태 무관 정규식을 주로 쓰고, 형태 목록은 그것이 못 잡는 꼴
// (`buildArticle('KEC-232.3.9-MAIN'` 처럼 번호 뒤 접미사)만 보탠다.
// 이 둘은 `standards/kec/__tests__/clause-titles-match.test.ts` 와 같아야 한다.
const CITE_BY_FORM = /(?:buildArticle\('KEC-|kec\('|articleId:\s*'KEC-|createSource\('KEC',\s*')([\d.]+)'/g;
const CITE_ANY = /KEC['"]?[\s,-]*['"]?(\d{3}(?:\.\d+)*)(?!\d)(?!\s?(?:m|km|mm|cm|kV|V|A|kA|W|kW|VA)\b)(?!\s?(?:%|Ω|°C|℃))/g;
const cited = new Set();
for (const f of walk(join(REPO, 'src'))) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(CITE_BY_FORM)) cited.add(m[1]);
  for (const m of text.matchAll(CITE_ANY)) cited.add(m[1]);
}

// 규격 브라우저 카탈로그의 KEC 항목. `KEC_ARTICLES` 와 별도 데이터라 위
// 정규식이 못 잡는다 — 그래서 오래 사각이었고 12 건 중 10 건이 틀려 있었다.
const REFS = join(REPO, 'src', 'data', 'standards', 'standard-refs.ts');
const refsSrc = readFileSync(REFS, 'utf8');
const kecBlock = refsSrc.slice(
  refsSrc.indexOf('const KEC_REFS: StandardRef[] = ['),
  refsSrc.indexOf('\n];', refsSrc.indexOf('const KEC_REFS: StandardRef[] = [')),
);
for (const m of kecBlock.matchAll(/clause:\s*'([\d.]+)'/g)) cited.add(m[1]);

// 심사 팀이 판정 행에 **손으로 써 넣는** 조항. 조항 정의를 안 거치므로 위
// 정규식 밖인데, 정작 사용자가 화면에서 읽는 자리다. `311.1` 을 "변압기 용량"
// 으로, `232.3` 을 "허용전류 산정" 으로 내보내고 있었다(2026-07-28) — 둘 다
// 픽스처에 없어서 표제 게이트가 건너뛰고 있었다.
// `standard: 'KEC'` 로 묶인 것만 받는다. NEC·IEC 조항 번호가 KEC 번호와
// 우연히 겹치면 엉뚱한 표제가 섞인다.
for (const f of walk(join(REPO, 'src'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/standard:\s*'KEC',\s*clause:\s*'([\d.]+)'/g)) cited.add(m[1]);
  for (const m of src.matchAll(/standardRef:\s*'KEC[\s-]*([\d.]+)'/g)) cited.add(m[1]);
}

// 검색 자동완성이 띄우는 조항 제안. 사용자가 그대로 외우고 인용하는 자리인데
// 13 건 중 12 건이 틀린 채로 있었다 — 이것도 게이트 사각이었다.
const AUTOCOMPLETE = join(REPO, 'src', 'search', 'autocomplete.ts');
for (const m of readFileSync(AUTOCOMPLETE, 'utf8').matchAll(/text:\s*'KEC (\d+(?:\.\d+)*)'/g)) {
  cited.add(m[1]);
}

const rows = [...cited].sort().filter((c) => official.has(c));
const missing = [...cited].sort().filter((c) => !official.has(c));

writeFileSync(OUT, [
  '# KEC 현행 전문(시행 2026.1.5)에서 **이 리포가 인용하는 번호만** 뽑은 조항 표제.',
  '#',
  '# 번호 실재만 보는 게이트는 실재하는 두 번호를 맞바꿔 달아도 통과한다',
  '# (실측: 142.2 접지도체 ↔ 142.3 접지저항). 그래서 표제를 대조한다.',
  '# 대조 전용이며 본문·수치·표는 담지 않는다.',
  '#',
  '# 만드는 법: node scripts/build-kec-title-fixture.mjs',
  '',
  ...rows.map((c) => `${c}\t${official.get(c)}`),
  '',
].join('\n'));

console.log(`인용 ${cited.size}건 · 현행 실재 ${rows.length}건 → ${OUT.replace(REPO, '.')}`);
console.log(`현행에 없는 인용 ${missing.length}건 (번호 실재 게이트 소관): ${missing.slice(0, 10).join(' ')}`);
