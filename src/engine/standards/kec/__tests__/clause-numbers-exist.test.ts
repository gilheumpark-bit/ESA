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
  // 자리를 확정하지 못한 것만 남았다. 표제로는 여러 조항에 걸리는데 어느
  // 것인지 본문 없이 못 가른다 — 지어내면 틀린 번호를 다른 틀린 번호로
  // 바꾸는 것이라 그대로 둔다.
  //
  //   313.1 모선 부스바      이격·지지·접속·상 표시가 351.2/351.7 에 흩어진다
  //   320.1 고압 케이블      포설·접속·종단·시험. 제3편 어디인지 불명
  //   350.1 보호 계전 방식   351.3 발전기 / 351.4 변압기 / 351.5 조상설비로 갈린다
  //   360.1 전력구·관로      환기·소화·배수·조명. 334 지중전선로엔 그 항목이 없다
  //                          (한전 전력구 설계기준일 가능성)
  //
  // 재검토 조건: 해당 조항 본문을 확보하면 옮기고 여기서 뺀다. KEC 소관이
  // 아니라고 확인되면 인용 자체를 걷어낸다.
  '313.1', '320.1', '350.1', '360.1',
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

/**
 * 픽스처에 그 번호가 있어야 실재로 본다.
 *
 * 처음엔 "상위 조항이 있으면 실재"로 느슨하게 뒀다. 픽스처가 말단까지 다
 * 담고 있으니 그 규칙이 도울 일은 없고, **없는 하위 번호만 통과시켰다** —
 * 502.1~502.4 태양광이 그렇게 빠져나갔다(현행 502 는 용어의 정의이고
 * 502.1 부터는 없다). 실측 11 건이 이 구멍으로만 통과하고 있었다.
 */
function exists(clause: string): boolean {
  return OFFICIAL.has(clause);
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
 * kec-full.ts 와 kec-extended.ts 는 둘 다 `KEC_ARTICLES` 로 등록된다. 등록부는
 * `if (!KEC_ARTICLES.has(article.id))` 로 막아 두어서, 같은 번호를 두 곳에서
 * 정의하면 **먼저 등록되는 kec-full 이 이기고 kec-extended 쪽은 통째로 버려진다.**
 * 조건도 상호참조도 로드되지 않는데 아무도 모른다 — 목록으로 보면 "둘 다 있음"
 * 이고, 파일을 읽어도 그 정의가 죽어 있다는 표시가 없다.
 *
 * 실측 2026-07-27 (레지스트리 조회):
 *   KEC-232.1 → "전선 허용전류 — 설계전류 이상"  (kec-full 판이 살아남음)
 *   KEC-220.1 → "주거용 부하 — 기본 부하밀도"    (kec-full 판)
 * kec-extended 의 같은 번호 정의는 등록 총계 118 에 들어가지 않는다.
 *
 * 19 건이 이 상태였다. 조항 번호를 정정하다가 이미 쓰이는 번호로 바꿔 2 건을
 * 더 만들 뻔했고(되돌림), 그때 이 검사를 붙였다.
 */
describe('조항 번호 중복 정의', () => {
  const SOURCES = [
    'kec-full.ts', 'kec-extended.ts', 'kec-232.ts', 'kec-212.ts', 'kec-142.ts',
  ].map((f) => join(REPO, 'src', 'engine', 'standards', 'kec', f));

  /**
   * 이미 중복인 채로 굳어 있는 것. **줄이는 것이 목표이고 늘리면 안 된다.**
   * 해소하려면 두 정의의 조건·상호참조를 합쳐 한쪽으로 모아야 한다.
   */
  const DECLARED_DUPLICATES = new Set<string>([
    // **비어 있다.** 19 건이던 중복을 2026-07-27 에 전부 해소했다 — 재번호하며
    // 두 파일의 조건을 한쪽(kec-full)으로 합쳤다. 늘어나면 그때가 회귀다.
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

/**
 * 중복일 때 어느 정의가 살아남는가.
 *
 * 등록부의 `if (!has)` 가드 하나에 달려 있다. 가드를 빼거나 등록 순서를 바꾸면
 * 사용자가 보는 조항 내용이 통째로 갈리는데, 어느 파일도 그걸 알려주지 않는다.
 * 그래서 여기에 못을 박는다 — 바뀌면 이 테스트가 먼저 빨개진다.
 */
describe('중복 정의 가드', () => {
  /**
   * 등록부는 `if (!KEC_ARTICLES.has(article.id))` 로 나중 등록을 버린다.
   * 중복이 0 이 된 지금은 그 가드가 아무것도 버리지 않아야 정상이다 —
   * 소스에 있는 조항 수와 등록된 조항 수가 같은지로 본다.
   *
   * 이 가드가 실제로 값을 갈랐던 실측이 있다(2026-07-27): 같은 항목을
   * kec-full 은 주위온도 40°C, kec-extended 는 30°C 로 갖고 있었고 **틀린
   * 40°C 가 살아남아** 허용전류를 과대평가하고 있었다. 병합하며 30°C 로
   * 바로잡았고, 그 값을 아래에서 잠근다.
   */
  it('버려지는 정의가 없다 — 중복 0 이면 소스와 등록 수가 같다', async () => {
    const { KEC_ARTICLES } = await import('@/engine/standards/kec');
    const ids = new Set<string>();
    for (const f of ['kec-full.ts', 'kec-extended.ts', 'kec-232.ts', 'kec-212.ts', 'kec-142.ts']) {
      let src: string;
      try { src = readFileSync(join(REPO, 'src', 'engine', 'standards', 'kec', f), 'utf8'); } catch { continue; }
      for (const m of src.matchAll(/(?:buildArticle\('KEC-|kec\(')([\d.]+)'/g)) ids.add(`KEC-${m[1]}`);
    }
    const dropped = [...ids].filter((id) => !KEC_ARTICLES.has(id));
    expect(dropped).toEqual([]);
  });

  it('병합한 값이 살아 있다 — 40°C 가 아니라 30°C 다', async () => {
    const { KEC_ARTICLES } = await import('@/engine/standards/kec');
    expect(KEC_ARTICLES.get('KEC-232.5.2')?.conditions
      .find((c) => c.param === 'ambientTemp')?.value).toBe(30);
    // 접지극 조항은 두 파일의 조건 넷을 합친 것이다. 하나라도 빠지면 병합 실패다.
    const params = KEC_ARTICLES.get('KEC-142.2')?.conditions.map((c) => c.param) ?? [];
    for (const p of ['burialDepth', 'rodLength', 'earthElectrodeInstalled', 'earthResistance_ohm']) {
      expect(params).toContain(p);
    }
  });
});
