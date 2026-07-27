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
 * 화면에서 읽힌다. 그래서 **핵심 명사가 하나라도 겹치는가**만 본다. 느슨한
 * 기준인데도 78 건 중 43 건이 걸렸다.
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
const DECLARED_MISMATCHES = new Map([
  // 접지·피뢰 — 현행 142 는 접지시스템, 143 은 등전위본딩, 피뢰는 151~153
  ['142.1', '접지극 — 종류 및 시공'],
  ['142.4', '등전위 본딩'],
  ['143.1', '피뢰 시스템'],

  // 배선 공사방법을 211.x 로 쓰고 있다. 현행 211 = 감전에 대한 보호.
  // 갈 자리: 232.11 합성수지관공사 · 232.12 금속관공사 · 232.13 금속제 가요전선관공사
  ['211.1', '배선 방법 — 애자 사용 배선 / 합성수지관 배선 — 관 굵기'],
  ['211.2', '금속관 배선 / 금속관 배선 — 관 굵기'],
  ['211.3', '합성수지관 배선 / 케이블 트레이 — 충전율'],
  ['211.4', '케이블 배선 / 전선관 굴곡 — 최대 굴곡 수'],
  ['211.5', '버스 덕트 배선'],

  // 현행 212.1 = 일반사항, 212.2 = 회로의 특성에 따른 요구사항.
  // 과부하는 212.4, 단락은 212.5 다.
  ['212.1', '과부하 보호 — 과부하 차단기'],
  ['212.2', '단락 보호 — 단락 차단기'],

  // 현행 231.1 = 공통사항, 232.1 = 적용범위. 허용전류는 232.5 계열.
  ['231.1', '전선의 최소 굵기'],
  ['232.1', '허용전류 — 일반 원칙 / 전선 허용전류 — 설계전류 이상'],
  ['232.2', '허용전류 — 주위온도 보정'],
  ['232.3', '허용전류 — 전선 묶음 보정 / 전선 그룹 보정 — 3회로 이하'],
  ['232.4', '특수 장소 허용전류 / 중성선 전류 고조파 — 33% 이하'],

  // 현행 234.1 = 등기구의 시설, 234.2 = 코드의 사용, 234.3 = 전구선 및 이동전선
  ['234.1', '조명 설비 — 조도 기준 / 조명 분기회로 — 최대 부하'],
  ['234.2', '비상 조명 — 비상등 / 비상조명 — 최저 조도'],
  ['234.3', '비상조명 — 유지 시간'],

  // 현행 311.x = 절연수준·기본보호·고장보호. 수전설비 이격거리와 무관하다.
  ['311.1', '변전소 — 시설 기준 / 수전설비 — 최소 이격거리'],
  ['311.2', '변압기 — 설치 기준 / 수전설비 — 조작통로 폭'],
  ['311.3', '수전설비 — 점검통로 폭'],

  ['321.1', '가공 전선로 — 시설 기준'],
  ['322.1', '지중 전선로 — 매설 기준'],
  ['341.1', '전동기 — 분기회로 전선'],
  ['341.2', '전동기 — 과부하 보호'],

  // 현행 351.1 = 발전소 등의 울타리·담, 351.2 = 특고압전로 상 표시,
  // 351.3 = 발전기 등의 보호장치. 수변전실 치수 조항이 아니다.
  ['351.1', '수배전반 — 시설 기준 / 수변전실 — 최소 바닥 면적'],
  ['351.2', '수변전실 — 최소 천장 높이'],
  ['351.3', '수변전실 — 환기량'],

  // 현행 501 = 분산형전원 일반사항. 태양광은 521 일반사항 / 522 태양광설비의 시설.
  ['501.1', '태양광 발전 — 모듈 시설'],
  ['501.2', '태양광 발전 — DC 배선'],
  ['501.3', '태양광 발전 — 인버터'],
]);

/** 비교에 쓸 명사만 남긴다. 조사·기호·수식어는 버린다. */
function keywords(title: string): string[] {
  return [...new Set(
    title
      .replace(/[·—\-()[\]{},./]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/(의|및|등|에|를|을|은|는|와|과|로|으로|따른|시설)$/, ''))
      .filter((w) => w.length >= 2 && /[가-힣A-Za-z]/.test(w)),
  )];
}

function sameTopic(mine: string, official: string): boolean {
  const a = keywords(mine);
  const b = keywords(official);
  return a.some((w) => b.some((t) => w.includes(t) || t.includes(w)));
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

/** 조항을 **인용**하는 자리 전부 — 정의뿐 아니라 상호참조·시험데이터도 센다. */
const CITATION = /(?:buildArticle\('KEC-|kec\('|articleId:\s*'KEC-)([\d.]+)'/g;

describe('KEC 조항 표제 정합', () => {
  const files = collectFiles(join(REPO, 'src'));

  it('픽스처가 제대로 읽힌다 — 빈 목록으로 통과하면 검사가 무의미하다', () => {
    expect(OFFICIAL.size).toBeGreaterThan(50);
    // 이 둘이 이 게이트를 만든 이유다 — 리포는 정확히 반대로 달고 있었다.
    expect(OFFICIAL.get('142.2')).toBe('접지극의 시설 및 접지저항');
    expect(OFFICIAL.get('142.3')).toBe('접지도체·보호도체');
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
      for (const m of readFileSync(f, 'utf8').matchAll(CITATION)) cited.add(m[1]);
    }
    const uncovered = [...cited].filter((c) => realNumbers.has(c) && !OFFICIAL.has(c)).sort();
    expect(uncovered).toEqual([]);
  });

  it('겹침 판정기가 실제로 판별한다 — 항상 참이면 게이트가 아니다', () => {
    expect(sameTopic('접지 도체 — 재질 및 규격', '접지도체·보호도체')).toBe(true);
    expect(sameTopic('금속관 배선', '전원의 자동차단에 의한 보호대책')).toBe(false);
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
