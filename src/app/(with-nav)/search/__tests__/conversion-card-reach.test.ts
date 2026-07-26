/**
 * 단위 변환 카드의 도달 경로.
 *
 * 카드·정규식·/api/convert 가 전부 멀쩡한데 한 번도 화면에 나온 적이 없었다.
 * 렌더 자리가 `result ?` 분기 **안**이었고, 변환 질의는 문서가 0건이라 항상
 * 그 앞의 EmptyState 로 빠졌기 때문이다(실측 2026-07-26: 8개 변환 패턴 전부
 * documents:0 · featuredCalculator:X · knowledgePanel:X → 카드 0/8).
 *
 * 등록돼 있다는 것과 발화한다는 것은 다르다. 여기서 잠그는 것은 "카드가
 * 조건 분기보다 먼저 그려지는가" — 결과 유무와 무관한 자리에 있는가다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PAGE = join(process.cwd(), 'src/app/(with-nav)/search/page.tsx');
const source = readFileSync(PAGE, 'utf-8');

describe('단위 변환 카드 도달 경로', () => {
  it('결과 유무 분기보다 먼저 렌더된다', () => {
    const card = source.indexOf('<UnitConversionCard');
    const branch = source.indexOf('{isLoading ? (');
    expect(card).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(-1);
    expect(card).toBeLessThan(branch);
  });

  it('렌더 자리가 하나뿐이다 — 분기 안에 사본이 남으면 중복 표시된다', () => {
    expect(source.match(/<UnitConversionCard/g)).toHaveLength(1);
  });

  it('빈 결과 분기가 변환 질의를 EmptyState 로 덮지 않는다', () => {
    expect(source).toContain('const hasQueryAnswer');
    expect(source.match(/const hasQueryAnswer[\s\S]{0,200}/)?.[0]).toContain('UNIT_CONVERT_REGEX.test');
  });
});

/**
 * 같은 부류의 형제 결함. 인라인 계산기도 질의에서 바로 답이 나오는데
 * "문서 0건" 만 보고 EmptyState 로 덮였다 — 실측 2026-07-26:
 * "조도 계산 사무실 가로 10m 세로 8m 높이 2.7m" 는 illuminance 를 확신도
 * 0.95 로 찾아놓고 화면엔 검색 팁만 나왔다(서버 featuredCalculator 는 X).
 */
describe('인라인 계산기 도달 경로', () => {
  it('EmptyState 조건이 calcIntent 를 고려한다', () => {
    const cond = source.match(/const hasQueryAnswer[\s\S]{0,300}?;/)?.[0] ?? '';
    expect(cond).toContain('calcIntent');
    expect(cond).toContain('calculatorId');
  });

  it('EmptyState 는 nothingToShow 하나로만 갈린다 — 조건이 흩어지면 또 어긋난다', () => {
    expect(source.match(/<EmptyState query=\{query\} \/>/g)).toHaveLength(1);
    const empty = source.indexOf('<EmptyState query={query} />');
    expect(source.slice(Math.max(0, empty - 120), empty)).toContain('nothingToShow');
  });

  it('nothingToShow 가 질의 기반 답을 배제한다', () => {
    const decl = source.match(/const nothingToShow[\s\S]{0,300}?;/)?.[0] ?? '';
    expect(decl).toContain('!hasQueryAnswer');
    expect(decl).toContain('documents.length === 0');
  });
});

describe('변환 질의 패턴', () => {
  /** page.tsx 의 정본을 그대로 읽어 온다 — 사본을 만들면 또 어긋난다. */
  const literal = source.match(/const UNIT_CONVERT_REGEX = (\/.+\/i);/)?.[1];
  const regex = new RegExp(literal!.slice(1, -2), 'i');

  it('정규식을 소스에서 찾을 수 있다', () => {
    expect(literal).toBeTruthy();
  });

  it('굵은 규격 표기를 받는다', () => {
    for (const q of ['4/0 AWG to mm2', '0000 AWG to mm2', '000 AWG to mm2', '1/0 AWG to mm2']) {
      expect(regex.test(q)).toBe(true);
    }
  });

  it('굵은 규격을 숫자로 뭉개지 않고 원문으로 잡는다', () => {
    expect('4/0 AWG to mm2'.match(regex)?.[1]).toBe('4/0');
    expect('0000 AWG to mm2'.match(regex)?.[1]).toBe('0000');
  });

  it('기존 수치 패턴도 그대로 통한다', () => {
    for (const q of ['12 AWG to mm2', '50 mm2 to AWG', '100 kW to HP', '25 C to F', '0.5 mm2 to AWG']) {
      expect(regex.test(q)).toBe(true);
    }
  });

  it('변환 질의가 아닌 것은 잡지 않는다', () => {
    for (const q of ['KEC 140', '전압강하 계산', 'AWG 표', '12 AWG', 'to mm2']) {
      expect(regex.test(q)).toBe(false);
    }
  });
});

/**
 * 제목을 런타임에 덮어쓰지 않는다.
 *
 * layout.tsx 의 metadata 로 27쪽 제목을 갈랐는데, /receipt 는 마운트 시
 * `document.title = '계산 이력 | ESA'` 로 다시 썼다. SSR 제목만 보면 새 제목이
 * 나오고 화면을 띄운 뒤 탭을 봐야 옛 표기가 드러난다(실측 2026-07-26) —
 * 폐기한 브랜드 표기가 그 경로로 되살아났다.
 */
describe('제목 런타임 덮어쓰기', () => {
  const pages = readdirSync(join(process.cwd(), 'src/app'), { recursive: true, encoding: 'utf-8' })
    .filter((p) => p.endsWith('page.tsx'))
    .map((p) => join(process.cwd(), 'src/app', p));

  it('page.tsx 가 document.title 을 쓰지 않는다', () => {
    const offenders = pages.filter((p) => /document\.title\s*=/.test(readFileSync(p, 'utf-8')));
    expect(offenders.map((p) => p.replace(process.cwd(), ''))).toEqual([]);
  });
});
