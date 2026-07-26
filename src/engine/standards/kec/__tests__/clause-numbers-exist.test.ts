/**
 * KEC 조항 번호가 실재하는지 본다.
 *
 * 리포는 KEC 에 없는 번호를 규정으로 제시하고 있었다 — `140.1`, `220.1`,
 * `240.1`, `520.1` 같은 것들이다. KEC 는 셋째 자리를 쓴다(141/142/143,
 * 221/222/223, 241/242/243, 521/522). 그 자리에는 조항이 없다.
 *
 * 이 데이터는 `KEC_ARTICLES` 로 등록돼 /standards 화면에서 **사용자에게 KEC
 * 규정으로 표시된다.** 전기 규정 준수 도구가 없는 조항을 제시하면 감리·검사에서
 * 문제가 되고, 시험 데이터 쪽은 수험생이 그대로 외우면 틀린다.
 *
 * tsc·lint·1,900+ 테스트가 전부 초록인 상태에서 이 문제가 살아 있었다.
 * 소프트웨어 게이트는 "번호가 실재하는가"를 볼 수 없다 — 원문이 있어야 한다.
 * 그래서 현행 전문(시행 2026.1.5)에서 번호만 뽑아 픽스처로 두고 여기서 대조한다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..', '..');
const FIXTURE = join(REPO, 'fixtures', 'kec', 'clause-numbers.txt');

const OFFICIAL = new Set(
  readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')),
);

/**
 * 아직 정정하지 못한 인용. **줄이는 것이 목표이고 늘리면 안 된다.**
 *
 * 현행 전문에서 대응 조항을 찾지 못했거나, 애초에 KEC 소관이 아닌 것들이다
 * (부하 산정은 NEC 220 개념이고 KEC 에 대응 조항이 없다). 틀린 번호를 다른
 * 틀린 번호로 바꾸면 더 나빠지므로 지어내지 않고 여기 남겼다.
 *
 * 재검토 조건: 조항별로 현행 전문에서 대응을 확인하면 그때 정정하고 이 목록에서
 * 뺀다. 대응이 없다고 확인되면 KEC 인용 자체를 걷어내야 한다.
 */
const DECLARED_RESIDUALS = new Set([
  // KEC 에 대응 개념이 없다고 보이는 것 — 확인되면 KEC 인용 자체를 걷어내야 한다
  '220.1', '220.2', '220.3', '220.4',      // 부하 산정 — NEC 220 개념
  '250.1', '250.2', '250.3', '250.4',      // 욕실·수영장·사우나·옥외 — 현행 색인에 표제 없음

  // 대응 조항은 보이나 **이미 다른 항목이 그 번호를 쓰고 있어** 병합이 필요한 것.
  // 그냥 바꾸면 레지스트리(ID 기준 Map)에서 앞엣것이 덮여 조항이 조용히 사라진다.
  '210.2', '210.3', '230.1',               // → 231.3.1 (이미 사용 중)
  '230.4', '410.2',                        // → 142.3 (이미 사용 중)
  '410.1', '410.4', '410.5',               // → 142.2 (이미 사용 중)
  '240.2', '240.3',                        // → 211.2.4 (둘이 같은 조항, 조건 병합 필요)
  '130.1', '130.2', '130.3', '130.4',      // → 112 (이미 사용 중)

  // 현행 전문에서 대응을 아직 못 찾은 것
  '310.1', '310.2', '312.1', '313.1', '320.1', '350.1', '360.1',
  '520.1', '520.2', '520.3', '520.4', '520.5',
]);

const CITE_PATTERNS = [
  /buildArticle\(\s*'KEC-([\d.]+)'/g,
  /\bkec\(\s*'([\d.]+)'\s*,\s*'[\d.]+'/g,
  /articleId:\s*'KEC-([\d.]+)'/g,
];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectFiles(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** 상위 조항이 있으면 실재로 본다 — 232.5.1 은 232.5 의 하위다. */
function exists(clause: string): boolean {
  if (OFFICIAL.has(clause)) return true;
  const parts = clause.split('.');
  while (parts.length > 1) {
    parts.pop();
    if (OFFICIAL.has(parts.join('.'))) return true;
  }
  return false;
}

describe('KEC 조항 번호 실재 확인', () => {
  const files = collectFiles(join(REPO, 'src'));

  it('픽스처가 제대로 읽힌다 — 빈 목록으로 통과하면 검사가 무의미하다', () => {
    expect(OFFICIAL.size).toBeGreaterThan(1500);
    // 독립 근거(원문 조회)로 확인해 둔 것들
    for (const c of ['142', '211', '212', '232.5', '232.31', '241.17', '511.2', '522']) {
      expect(OFFICIAL.has(c)).toBe(true);
    }
    // KEC 가 쓰지 않는 자리
    for (const c of ['140', '220', '240', '520']) {
      expect(OFFICIAL.has(c)).toBe(false);
    }
  });

  it('선언한 잔여 외에는 실재하지 않는 KEC 번호를 인용하지 않는다', () => {
    const violations: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const re of CITE_PATTERNS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          const clause = m[1];
          if (exists(clause) || DECLARED_RESIDUALS.has(clause)) continue;
          const line = src.slice(0, m.index).split('\n').length;
          violations.push(`${clause}  ${relative(REPO, f)}:${line}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('잔여 목록이 실제로 남아 있는 것만 담는다 — 고친 뒤 지우지 않으면 썩는다', () => {
    const cited = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const re of CITE_PATTERNS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) cited.add(m[1]);
      }
    }
    const stale = [...DECLARED_RESIDUALS].filter((c) => !cited.has(c));
    expect(stale).toEqual([]);
  });
});

/**
 * 같은 조항 번호를 두 파일이 각자 정의하는 것.
 *
 * kec-full.ts 와 kec-extended.ts 는 둘 다 `KEC_ARTICLES` 로 등록된다. 그 맵은
 * 조항 번호가 키라서, 같은 번호를 두 곳에서 정의하면 **나중에 등록된 쪽이
 * 앞엣것을 덮는다.** 덮인 조항은 조건도 상호참조도 통째로 사라지는데 아무도
 * 모른다 — 목록으로 보면 "둘 다 있음"이고, 등록 수를 세도 맞아 보인다.
 *
 * 실측 2026-07-27: 19 건이 이 상태였다. 조항 번호를 정정하다가 이미 쓰이는
 * 번호로 바꿔 2 건을 더 만들 뻔했고(되돌림), 그때 이 검사를 붙였다.
 */
describe('조항 번호 중복 정의', () => {
  const SOURCES = [
    'kec-full.ts', 'kec-extended.ts', 'kec-232.ts', 'kec-212.ts', 'kec-142.ts',
  ].map((f) => join(REPO, 'src', 'engine', 'standards', 'kec', f));

  /**
   * 이미 중복인 채로 굳어 있는 것. **줄이는 것이 목표이고 늘리면 안 된다.**
   * 해소하려면 두 정의의 조건·상호참조를 합쳐 한쪽으로 모아야 한다.
   */
  const DECLARED_DUPLICATES = new Set([
    '211.1', '211.2', '211.3', '211.4',
    '220.1', '220.2', '220.3',
    '232.1', '232.2', '232.3', '232.4',
    '234.1', '234.2',
    '311.1', '311.2',
    '341.1', '341.2',
    '351.1', '502.1',
  ]);

  it('선언한 것 외에는 같은 조항 번호를 두 번 정의하지 않는다', () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const path of SOURCES) {
      let src: string;
      try { src = readFileSync(path, 'utf8'); } catch { continue; }
      const file = path.split(/[\/]/).pop()!;
      for (const m of src.matchAll(/(?:buildArticle\('KEC-|kec\(')([\d.]+)'/g)) {
        const id = m[1];
        if (seen.has(id)) {
          if (!DECLARED_DUPLICATES.has(id)) collisions.push(`${id} (${seen.get(id)} ↔ ${file})`);
        } else seen.set(id, file);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('중복 선언 목록이 실제 중복만 담는다 — 해소한 뒤 지우지 않으면 썩는다', () => {
    const counts = new Map<string, number>();
    for (const path of SOURCES) {
      let src: string;
      try { src = readFileSync(path, 'utf8'); } catch { continue; }
      for (const m of src.matchAll(/(?:buildArticle\('KEC-|kec\(')([\d.]+)'/g)) {
        counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
      }
    }
    const stale = [...DECLARED_DUPLICATES].filter((id) => (counts.get(id) ?? 0) < 2);
    expect(stale).toEqual([]);
  });
});
