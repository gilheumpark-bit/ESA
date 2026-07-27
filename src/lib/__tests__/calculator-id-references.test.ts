import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CALCULATOR_REGISTRY } from '@engine/calculators';

/**
 * 코드가 **계산기 id 로 참조하는 곳**이 실재하는 id 를 쓰는지 본다.
 *
 * 실측 2026-07-28: OCR 이 모터 명판(rpm·효율)을 읽으면 추천 목록에
 * `motor-load` 를 넣는데 **그런 계산기가 없다.** 화면은
 * `CALC_LABELS[id] ?? id` 로 원본 id 를 그대로 칩에 찍고, 링크는
 * `calculatorHref` 가 카테고리를 못 찾아 `/calc/power/motor-load` 로 간다.
 * 그 페이지를 실제로 열어 보면 **"계산기를 찾을 수 없습니다"** 다.
 * 모터 명판을 스캔한 사용자가 받는 추천이 빈 페이지로 간다.
 *
 * `debate-protocol` 의 `CALC_TO_PARAM` 에도 `'ampacity'` 가 있는데 실제
 * id 는 `ampacity-compare`·`ampacity-global-compare` 라 그 매핑은 영원히
 * 안 걸린다 — 주석이 "문자열 includes 대신 명시적 키워드 매핑으로 오판
 * 방지" 라고 적은 그 명시적 매핑이 죽어 있었다.
 *
 * 손으로 적은 id 는 계산기 이름이 바뀌면 조용히 어긋난다. 레지스트리를
 * 정본으로 두고 대조한다.
 */

const REPO = join(__dirname, '..', '..', '..');
const IDS = new Set([...CALCULATOR_REGISTRY.keys()]);

/** 파일에서 계산기 id 로 쓰이는 문자열을 뽑는다. */
function idsIn(relPath: string, pattern: RegExp): string[] {
  const src = readFileSync(join(REPO, relPath), 'utf8');
  return [...new Set([...src.matchAll(pattern)].map((m) => m[1]))];
}

describe('계산기 id 참조', () => {
  it('레지스트리를 실제로 읽는다', () => {
    expect(IDS.size).toBeGreaterThan(50);
  });

  it('OCR 추천 목록의 id 가 전부 실재한다 — 없으면 칩이 빈 페이지로 간다', () => {
    const suggested = idsIn('src/lib/ocr-nameplate.ts', /suggestions\.push\('([a-z0-9-]+)'\)/g);
    expect(suggested.length).toBeGreaterThan(3);
    expect(suggested.filter((id) => !IDS.has(id))).toEqual([]);
  });

  it('토론 프로토콜의 파라미터 매핑 키가 전부 실재한다', () => {
    const src = readFileSync(join(REPO, 'src/agent/debate/debate-protocol.ts'), 'utf8');
    const block = /const CALC_TO_PARAM[^{]*\{([\s\S]*?)\n\};/.exec(src)?.[1] ?? '';
    const keys = [...block.matchAll(/'([a-z0-9-]+)':/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(10);
    expect(keys.filter((id) => !IDS.has(id))).toEqual([]);
  });

  it.each([
    'src/app/(with-nav)/mobile/page.tsx',
    'src/app/(with-nav)/tools/ocr/page.tsx',
  ])('%s 의 라벨 표 키가 전부 실재한다', (rel) => {
    const src = readFileSync(join(REPO, rel), 'utf8');
    const block = /const CALC_LABELS[^{]*\{([\s\S]*?)\n\};/.exec(src)?.[1] ?? '';
    const keys = [...block.matchAll(/'([a-z0-9-]+)':/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(5);
    expect(keys.filter((id) => !IDS.has(id))).toEqual([]);
  });

  /**
   * `CalculationEntry.calculatorId` 에는 **레지스트리 계산기가 아닌 것**도
   * 들어간다 — KEC 표 조회, 전압강하 판정 단계, 팀 검토 묶음 같은 것들이다.
   * 지금 화면은 그걸 라벨로만 쓰고 링크를 걸지 않아 문제가 없다.
   *
   * 다만 필드 이름이 `calculatorId` 라 링크를 걸고 싶어진다 — 실제로
   * `motor-load` 가 그렇게 빈 페이지로 갔다. 그래서 "계산기가 아닌 것" 을
   * **여기 적어 두고**, 목록 밖의 새 값이 나타나면 실패시킨다. 새로 추가한
   * 사람이 링크 대상인지 라벨인지 한 번 생각하게 하는 것이 목적이다.
   */
  const PSEUDO_IDS = new Set([
    'ampacity',              // KEC 허용전류 표 조회 — 계산기 실행이 아니다
    'voltage-drop-judgment', // 전압강하 판정 단계
    'wiring-distance',       // 배치 검토의 배선 거리 항목
    'team-review',           // 팀 검토 묶음(내보내기 페이로드 라벨)
  ]);

  it('CalculationEntry 의 calculatorId 는 실재 계산기이거나 선언된 유사 id 다', () => {
    const files = [
      'src/agent/teams/standards-team.ts',
      'src/agent/teams/sld-team.ts',
      'src/agent/teams/layout-team.ts',
    ];
    const unknown: string[] = [];
    for (const rel of files) {
      const src = readFileSync(join(REPO, rel), 'utf8');
      for (const m of src.matchAll(/calculatorId:\s*'([a-z0-9-]+)'/g)) {
        if (!IDS.has(m[1]) && !PSEUDO_IDS.has(m[1])) unknown.push(`${rel}: ${m[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('선언된 유사 id 가 실제로 아직 쓰인다 — 안 쓰이면 목록만 낡는다', () => {
    const all = ['src/agent/teams/standards-team.ts', 'src/agent/teams/sld-team.ts',
      'src/agent/teams/layout-team.ts', 'src/app/(with-nav)/report/[id]/page.tsx']
      .map((r) => readFileSync(join(REPO, r), 'utf8')).join('\n');
    const stale = [...PSEUDO_IDS].filter((id) => !all.includes(`'${id}'`));
    expect(stale).toEqual([]);
  });

  /**
   * 라벨이 없으면 화면에 원본 id 가 그대로 찍힌다(`?? id`). 링크는 살아
   * 있으니 치명적이진 않지만, OCR 이 추천하는 것은 전부 라벨을 가져야 한다.
   */
  it('OCR 이 추천하는 id 는 두 화면 모두에 라벨이 있다', () => {
    const suggested = idsIn('src/lib/ocr-nameplate.ts', /suggestions\.push\('([a-z0-9-]+)'\)/g);
    for (const rel of ['src/app/(with-nav)/mobile/page.tsx', 'src/app/(with-nav)/tools/ocr/page.tsx']) {
      const src = readFileSync(join(REPO, rel), 'utf8');
      const block = /const CALC_LABELS[^{]*\{([\s\S]*?)\n\};/.exec(src)?.[1] ?? '';
      const labelled = new Set([...block.matchAll(/'([a-z0-9-]+)':/g)].map((m) => m[1]));
      expect(suggested.filter((id) => !labelled.has(id))).toEqual([]);
    }
  });
});
