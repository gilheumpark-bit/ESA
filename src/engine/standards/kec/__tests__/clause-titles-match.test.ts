/**
 * 조항 **번호에 그 번호의 내용이 들어 있는지** 본다.
 *
 * 옆 파일 `clause-numbers-exist.test.ts` 는 번호가 실재하는지만 본다. 그래서
 * 실재하는 두 번호를 서로 맞바꿔 달면 통과한다. 실제로 그랬다 —
 *
 *   리포 142.2 "접지 도체"        현행 142.2 = 접지극의 시설 및 접지저항
 *   리포 142.3 "접지 저항"        현행 142.3 = 접지도체·보호도체
 *
 * 정확히 뒤바뀌어 있었고 번호 게이트는 둘 다 실재하니 초록이었다. 이게 없는
 * 번호보다 나쁘다. 없는 번호는 조회하면 안 나와서 들키지만, 바뀐 번호는
 * 그럴듯하게 조회되고 감리에서 "그 조항은 그 얘기가 아닙니다"로 끝난다.
 *
 * 더 큰 것도 나왔다. 배선 공사방법을 211.x 로 쓰고 있는데 현행 211 은 감전
 * 보호다(공사방법은 232.11 합성수지관 / 232.12 금속관). 태양광을 501.x 로
 * 쓰는데 현행 501 은 분산형전원 일반사항이다(태양광은 521/522). 한두 건
 * 오타가 아니라 번호 체계가 구간째로 어긋나 있었다.
 *
 * 표제 문구까지 같기를 요구할 수는 없다 — 리포 표제는 서술형이고 그래야
 * 화면에서 읽힌다. 그래서 **문자 bigram 유사도**로 잰다(Dice, 임계 0.3).
 *
 * 처음에는 "핵심 명사가 하나라도 겹치는가"로 만들었다. 그게 **이 파일을 만든
 * 바로 그 케이스를 못 잡았다** — `접지극`이 `접지`를 부분문자열로 포함해서
 * 142.2 스왑이 통과했다. 게이트를 붙였다고 그 결함이 잡히는 게 아니었고,
 * 위 설명은 한동안 사실이 아닌 것을 주장하고 있었다. bigram 으로 바꾸니
 * 0.12(다름) / 0.40~0.43(같음) 로 갈렸고, 명사 방식이 놓친 4 번호가 더 나왔다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..', '..');
const FIXTURE = join(REPO, 'fixtures', 'kec', 'clause-titles.tsv');

const OFFICIAL = new Map(
  readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('\t');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string];
    }),
);

/**
 * 아직 정정하지 못한 것. **줄이는 것이 목표이고 늘리면 안 된다.**
 *
 * 값은 리포가 그 번호에 달아 둔 표제다 — 무엇이 잘못 놓였는지 보이라고 남긴다.
 * 정정하려면 내용에 맞는 현행 번호로 옮겨야 하는데, 목표 번호가 이미 쓰이는
 * 경우가 많아 조건·상호참조 병합이 따라온다. 그래서 한 번에 못 끝낸다.
 *
 * 재검토 조건: 번호별로 현행 표제에 맞는 자리를 확인하면 옮기고 여기서 뺀다.
 */
const DECLARED_MISMATCHES = new Map<string, string>([
  // 해소분 (2026-07-27):
  //   142.1/142.2/142.3/142.4/143.1 접지·피뢰 → 142.2 접지극·접지저항 ·
  //     142.3.1 접지도체 · 143.1 보호등전위본딩 · 151.1 피뢰시스템 적용범위
  //   211.1~211.5 배선 공사방법 → 232.2/232.10/232.11/232.12/232.41/232.51/232.61
  //   232.1~232.4 허용전류 → 232.5 / 232.5.2 / 232.5.3
  //   212.1/212.2/212.4 보호 → 212.4 과부하 · 212.5 단락 · 211.2.4 누전차단기
  //   500.1/501.x/502.x 분산형전원 → 503 · 521.3 · 522.1/522.2/522.3 · 532 육상풍력
  //   112.1/131.x/132.1/133.1/134.1/141.1 → 112 · 113.2/113.3/113.4/113.6 · 142.7

  // 표제 불일치 전량 해소 2026-07-27.
  //
  //   231.1 전선 최소 굵기  → 231.3   저압 옥내배선의 사용전선 및 중성선의 굵기
  //   311.1 변전소 시설     → 351     발전소, 변전소, 개폐소 등의 전기설비
  //   311.2 변압기 설치     → 341.1   특고압용 변압기의 시설 장소
  //   321.1 가공 전선로     → 332     가공전선로
  //   322.1 지중 전선로     → 223.1   지중전선로의 시설
  //   341.1/341.2 전동기    → 212.6.3 저압전로 중의 전동기 보호용 과전류보호장치
  //
  // 아래는 KEC 조항 자체가 아니어서 걷어냈다(현행 전문에 대응 없음 확인):
  //   311.1~311.3 이격거리·통로 폭 · 341.1~341.3 변압기 효율·온도상승·임피던스
  //   351.1~351.3 수변전실 바닥면적·천장높이·환기량 · 234.1~234.3 조도·비상조명
  //
  // **비어 있는 게 정상 상태다.** 늘어나면 그때가 회귀다.
]);

/** 띄어쓰기·기호를 지운다. `접지 도체` 와 `접지도체` 는 같은 말이다. */
function normalize(title: string): string {
  return title.replace(/[·—\-()[\]{},./\s]/g, '');
}

function bigrams(title: string): Set<string> {
  const s = normalize(title);
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/**
 * Dice 계수. 임계 0.3 은 실측으로 골랐다 —
 *   0.12  접지 도체        vs 접지극의 시설 및 접지저항   (달라야 함)
 *   0.40  접지 저항        vs 접지극의 시설 및 접지저항   (같아야 함)
 *   0.43  접지 도체        vs 접지도체·보호도체           (같아야 함)
 * 0.25~0.35 구간에서 결과가 같아 경계에 민감하지 않다.
 */
function sameTopic(mine: string, official: string): boolean {
  const a = bigrams(mine);
  const b = bigrams(official);
  if (a.size === 0 || b.size === 0) return false;
  let common = 0;
  for (const g of a) if (b.has(g)) common++;
  return (2 * common) / (a.size + b.size) >= 0.3;
}

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectFiles(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** 조항을 **정의**하는 자리 — 번호·조문번호·표제가 붙어 있다. */
const DEFINITION = /(?:buildArticle\('KEC-|kec\(')([\d.]+)'\s*,\s*'[\d.]+'\s*,\s*'([^']*)'/g;

/**
 * 규격 브라우저 카탈로그(`data/standards/standard-refs.ts`)의 KEC 항목.
 *
 * `KEC_ARTICLES` 와 **별도 데이터**라 위 DEFINITION 정규식이 못 잡는다.
 * 그래서 조항 번호 게이트도 표제 게이트도 이 파일을 통째로 지나쳤고,
 * 12 건 중 10 건이 틀린 채로 살아 있었다 — 410 을 "전기 수용가설비 —
 * 옥내배선" 으로 띄우고 있었는데 KEC 410 편은 **전기철도**다.
 *
 * 게이트가 데이터 하나를 안 보면 그만큼이 통째로 사각이다(§2.2).
 */
const CATALOG_ENTRY = /clause:\s*'([\d.]+)',\s*\n\s*title_ko:\s*'([^']*)'/g;

/**
 * 검색 자동완성이 띄우는 조항 제안(`search/autocomplete.ts`).
 *
 * 사용자가 검색창에 타이핑하면 뜨는 목록이라 그대로 외우고 인용한다.
 * 13 건 중 12 건이 틀려 있었다 — 232 를 "고압·특고압 전선로"(실제 저압
 * 배선설비), 351 을 "분산형전원 태양광"(실제 발전소·변전소)으로 띄웠고
 * 140·210·310·352·353·354 는 아예 없는 번호였다.
 */
const SUGGESTION = /text:\s*'KEC (\d+(?:\.\d+)*)',\s*subtitle:\s*'([^']*)'/g;

/**
 * 조항을 **인용**하는 자리 전부 — 정의뿐 아니라 상호참조·시험데이터도 센다.
 *
 * `createSource('KEC', '…')` 를 포함한다. 이게 빠져 있어서 계산기 영수증의
 * 인용 26 건이 이 게이트를 통째로 지나갔고, 그 안에 **내용이 완전히 다른
 * 조항이 여럿** 있었다(2026-07-31 실측):
 *
 *   단락전류 계산      213 「과전압에 대한 보호」   ← 과전류가 아니라 과전압
 *   누전차단기 선정    212.4 「과부하전류에 대한 보호」
 *   태양광·ESS 5 건    502 「용어의 정의」          ← 용어집을 근거로 달았다
 *   비상발전기 용량    351 「발전소·변전소 …」      ← 244 비상용 예비전원설비다
 *
 * 번호는 전부 실재하므로 번호 게이트는 통과한다. 표제를 봐야 보인다.
 *
 * **형태를 하나씩 늘리는 방식은 여기서 끝낸다.** `standardRef`·`createJudgment`
 * 도 같은 이유로 빠져 있었고, 그래서 `createSource` 만 고친 수리가 옆 필드를
 * 낡은 번호로 남겨 뒀다(실측 6 곳). 형태를 열거하는 한 다음 형태를 또 놓친다.
 *
 * 그래서 `clause-citations-repo-wide` 와 같은 **형태 무관 정규식**을 합집합으로
 * 쓴다. 형태 목록은 그것이 못 잡는 꼴(`buildArticle('KEC-232.3.9-MAIN'` 처럼
 * 번호 뒤에 접미사가 붙는 정의부)만 보태는 역할로 남긴다.
 */
const CITATION_BY_FORM = /(?:buildArticle\('KEC-|kec\('|articleId:\s*'KEC-|createSource\('KEC',\s*')([\d.]+)'/g;

/** 형태를 보지 않고 `KEC` 뒤의 조항 번호를 잡는다. 단위·백분율·연도는 뺀다. */
const CITATION_ANY = /KEC['"]?[\s,-]*['"]?(\d{3}(?:\.\d+)*)(?!\d)(?!\s?(?:m|km|mm|cm|kV|V|A|kA|W|kW|VA)\b)(?!\s?(?:%|Ω|°C|℃))/g;

/** 한 파일에서 인용된 조항 번호 전부. */
function citedIn(text: string): string[] {
  return [
    ...[...text.matchAll(CITATION_BY_FORM)].map((m) => m[1]),
    ...[...text.matchAll(CITATION_ANY)].map((m) => m[1]),
  ];
}

describe('KEC 조항 표제 정합', () => {
  const files = collectFiles(join(REPO, 'src'));

  it('픽스처가 제대로 읽힌다 — 빈 목록으로 통과하면 검사가 무의미하다', () => {
    expect(OFFICIAL.size).toBeGreaterThan(50);
    // 이 게이트를 만든 이유 — 리포는 142.2 를 접지도체로, 142.3 을 접지저항으로
    // 정확히 반대로 달고 있었다. 지금은 142.2 접지극·접지저항 / 142.3.1 접지도체다.
    expect(OFFICIAL.get('142.2')).toBe('접지극의 시설 및 접지저항');
    expect(OFFICIAL.get('142.3.1')).toBe('접지도체');
  });

  /**
   * 표제 픽스처는 **인용하는 번호만** 담는다(원문 전체를 커밋하지 않으려고).
   * 그래서 내용을 아직 인용하지 않은 번호로 옮기면 대조할 표제가 없어
   * 검사가 조용히 건너뛴다 — 게이트가 등록만 되고 발화하지 않는 상태다.
   * 인용이 늘면 `scripts/build-kec-title-fixture.mjs` 를 다시 돌려야 하고,
   * 잊으면 여기서 빨개진다.
   */
  it('실재하는 번호를 인용하면 그 표제가 픽스처에 있다 — 없으면 검사가 건너뛴다', () => {
    const realNumbers = new Set(
      readFileSync(join(REPO, 'fixtures', 'kec', 'clause-numbers.txt'), 'utf8')
        .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')),
    );
    const cited = new Set<string>();
    for (const f of files) {
      for (const c of citedIn(readFileSync(f, 'utf8'))) cited.add(c);
    }
    const uncovered = [...cited].filter((c) => realNumbers.has(c) && !OFFICIAL.has(c)).sort();
    expect(uncovered).toEqual([]);
  });

  it('판정기가 실제로 판별한다 — 항상 참이면 게이트가 아니다', () => {
    // **이 파일을 만든 케이스.** 첫 판정기(명사 겹침)는 여기서 true 를 냈다 —
    // `접지극`이 `접지`를 부분문자열로 포함해서다. 게이트를 붙이고도 정작
    // 그 결함은 통과했다. 되돌아가면 여기서 먼저 빨개진다.
    expect(sameTopic('접지 도체 — 재질 및 규격', '접지극의 시설 및 접지저항')).toBe(false);

    expect(sameTopic('접지 도체 — 재질 및 규격', '접지도체·보호도체')).toBe(true);
    expect(sameTopic('접지 저항 — 기준값', '접지극의 시설 및 접지저항')).toBe(true);
    expect(sameTopic('누전차단기의 시설', '누전차단기의 시설')).toBe(true);
    expect(sameTopic('금속관 배선', '전원의 자동차단에 의한 보호대책')).toBe(false);
    expect(sameTopic('조명 분기회로 — 최대 부하', '등기구의 시설')).toBe(false);
  });

  it('선언한 것 외에는 번호와 다른 주제의 내용을 담지 않는다', () => {
    const violations: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      DEFINITION.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = DEFINITION.exec(src)) !== null) {
        const [, num, title] = m;
        const official = OFFICIAL.get(num);
        if (!official || sameTopic(title, official)) continue;
        if (DECLARED_MISMATCHES.has(num)) continue;
        const line = src.slice(0, m.index).split('\n').length;
        violations.push(`${num} "${title}" ≠ 현행 "${official}"  ${relative(REPO, f)}:${line}`);
      }
    }
    expect(violations).toEqual([]);
  });

  /**
   * 위 검사들은 전부 **소스를 읽는다.** 소스에 옳게 적혀 있어도 등록부의
   * `if (!KEC_ARTICLES.has(id))` 에 걸려 통째로 버려지면 사용자는 못 본다.
   * 재번호하며 목표 번호가 이미 쓰이는 경우가 많아 실제로 그럴 뻔했다.
   * 그래서 옮긴 것들이 등록부에 살아 있는지 여기서 직접 조회한다.
   */
  it('재번호한 조항이 등록부에 살아 있다 — 소스에 있어도 버려지면 안 보인다', async () => {
    const { KEC_ARTICLES } = await import('@/engine/standards/kec');
    const moved: Array<[string, string]> = [
      ['KEC-232.2', '공사의 종류'],      // ← 211.1
      ['KEC-232.10', '전선관시스템'],    // ← 211.4
      ['KEC-232.11', '합성수지관공사'],  // ← 211.1/211.3
      ['KEC-232.12', '금속관공사'],      // ← 211.2
      ['KEC-232.41', '케이블트레이공사'], // ← 211.3
      ['KEC-232.51', '케이블공사'],      // ← 211.4
      ['KEC-232.61', '버스덕트공사'],    // ← 211.5
      ['KEC-232.5', '허용전류'],         // ← 232.1
      ['KEC-232.5.2', '허용전류의 결정'], // ← 232.1/232.2
      ['KEC-232.5.3', '복수회로'],       // ← 232.3
      ['KEC-232.5.4', '통전도체'],       // ← 232.4
      ['KEC-231.3.1', '사용전선'],
    ];
    const dropped = moved.filter(([id, frag]) => !KEC_ARTICLES.get(id)?.title.includes(frag));
    expect(dropped).toEqual([]);
  });

  it('규격 브라우저 카탈로그의 KEC 항목도 번호와 표제가 맞다', () => {
    const src = readFileSync(join(REPO, 'src', 'data', 'standards', 'standard-refs.ts'), 'utf8');
    const kecBlock = src.slice(
      src.indexOf('const KEC_REFS: StandardRef[] = ['),
      src.indexOf('\n];', src.indexOf('const KEC_REFS: StandardRef[] = [')),
    );
    const entries = [...kecBlock.matchAll(CATALOG_ENTRY)];

    // 정규식이 아무것도 못 잡으면 빈 목록으로 통과한다 — 그게 이 파일이
    // 오래 사각이었던 이유다.
    expect(entries.length).toBeGreaterThan(10);

    const violations = entries
      .map(([, num, title]) => {
        const official = OFFICIAL.get(num);
        if (!official) return `${num} "${title}" — 현행에 없는 번호`;
        if (!sameTopic(title, official)) return `${num} "${title}" ≠ 현행 "${official}"`;
        return null;
      })
      .filter(Boolean);
    expect(violations).toEqual([]);
  });

  it('검색 자동완성이 띄우는 조항도 번호와 표제가 맞다', () => {
    const src = readFileSync(join(REPO, 'src', 'search', 'autocomplete.ts'), 'utf8');
    const entries = [...src.matchAll(SUGGESTION)];

    // 정규식이 죽으면 빈 목록으로 통과한다 — 사각을 만드는 방식이 그거다.
    expect(entries.length).toBeGreaterThan(10);

    const violations = entries
      .map(([, num, subtitle]) => {
        const official = OFFICIAL.get(num);
        if (!official) return `KEC ${num} "${subtitle}" — 현행에 없는 번호`;
        // 부제는 "저압전기설비 — 배선설비" 처럼 편 이름이 앞에 붙는다.
        // 대시 뒤쪽만 표제로 본다.
        const tail = subtitle.split('—').pop()!.trim();
        if (!sameTopic(tail, official)) return `KEC ${num} "${tail}" ≠ 현행 "${official}"`;
        return null;
      })
      .filter(Boolean);
    expect(violations).toEqual([]);
  });

  it('선언 목록이 실제로 남아 있는 것만 담는다 — 고친 뒤 지우지 않으면 썩는다', () => {
    const stillWrong = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      DEFINITION.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = DEFINITION.exec(src)) !== null) {
        const official = OFFICIAL.get(m[1]);
        if (official && !sameTopic(m[2], official)) stillWrong.add(m[1]);
      }
    }
    const stale = [...DECLARED_MISMATCHES.keys()].filter((n) => !stillWrong.has(n));
    expect(stale).toEqual([]);
  });
});
