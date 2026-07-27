/**
 * 등록된 조항 중 **실제로 판정에 쓰이는 것이 몇 개인지** 못박는다.
 *
 * 조항은 74 개가 등록돼 `/standards` 에 뜨고 저마다 `conditions` 를 갖고
 * 있어서 "이 앱이 74 개 조항을 강제한다" 로 읽힌다. 실측은 다르다 —
 * `evaluateStandard` 의 **프로덕션 호출부가 하나뿐**이고(전압강하 비교),
 * 나머지 조항의 `param` 은 규격 정의 밖에서 아무도 채우지 않는다.
 * 채워지지 않으면 `simpleEval` 이 `makeHold` 로 끝난다 — 어떤 입력을 줘도
 * 영원히 HOLD 다.
 *
 * 이게 결함이라는 말이 아니다. 조항 레지스트리는 참조·표시 데이터이고
 * 실제 판정은 계산기 층이 자기 임계값으로 한다. 문제는 **둘이 구분되지
 * 않는다**는 것이다 — 레지스트리 크기를 강제 범위로 착각하기 쉽다.
 * 그래서 수를 여기에 적어 둔다. 배선이 늘면 이 수가 바뀌고 눈에 띈다.
 *
 * 실측 2026-07-27: 조건 보유 74 · 외부에서 param 이 채워지는 것 12 ·
 * 그중 프로덕션 판정 경로를 타는 것은 전압강하 하나다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..');
const STANDARDS = join(REPO, 'src', 'engine', 'standards');

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n === '__tests__') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe('조항의 판정 도달', () => {
  /**
   * **프로덕션 경로를 그대로 탄다.** 처음에는 `evaluateStandard` 를 직접
   * 불렀는데, 그러면 호출부(`compareDesign`)가 param 을 안 넘기게 망가져도
   * 통과한다 — 변이로 확인했다. 게이트가 실제로 밟는 것을 확인하지 않으면
   * 초록은 아무 뜻이 없다.
   */
  it('전압강하 판정이 프로덕션 경로에서 살아 있고 판별한다', async () => {
    const { compareDesign } = await import('@/engine/chain/standard-comparator');
    const base = { loadCurrent: 100, wireAmpacity: 150, breakerRating: 125 };

    const ok = compareDesign({ ...base, voltageDropPercent: 3 });
    const bad = compareDesign({ ...base, voltageDropPercent: 99 });

    const kec = (r: ReturnType<typeof compareDesign>) =>
      r.entries.find((e) => e.standard === 'KEC')?.judgment?.judgment;

    // 통과해야 하는 값과 떨어져야 하는 값이 갈리는지 본다.
    // 한쪽만 보면 "항상 PASS" 도 "항상 HOLD" 도 통과로 오인한다.
    expect(kec(ok)).toBe('PASS');
    expect(kec(bad)).toBe('FAIL');
  });

  /**
   * 한 단계 더 올라간다. 위 검사는 `compareDesign` 을 **직접** 부르므로
   * 사용자가 그 함수에 도달하는 경로가 끊겨도 초록이다.
   *
   * 실제 사슬:
   *   POST /api/team-review → runOrchestrator → executeStandardsTeam
   *   → parseStandardQuery 가 "비교" 를 `comparison` 으로 분류
   *   → compareStandards → compareDesign → evaluateStandard
   *
   * 여기서는 팀 진입점부터 탄다 — 의도 분류와 `case 'comparison'` 배선까지
   * 함께 걸린다. 배선이 끊기면 추천이 안 나온다.
   */
  it('사용자 질의가 팀을 통해 비교 판정까지 도달한다', async () => {
    const { executeStandardsTeam } = await import('@/agent/teams/standards-team');
    const run = (voltageDropPercent: number) => executeStandardsTeam({
      sessionId: 'judgment-reach-probe',
      classification: 'text_query',
      query: '전압강하 기준 비교',
      params: { voltageDropPercent, loadCurrent: 100, wireAmpacity: 150, breakerRating: 125 },
    });

    const ok = await run(3);
    const bad = await run(99);

    const verdict = (r: Awaited<ReturnType<typeof executeStandardsTeam>>) =>
      r.recommendations?.find((x) => x.id === 'rec-compare')?.description;

    // 추천 자체가 안 나오면 배선이 끊긴 것이다 — undefined 도 실패로 잡힌다.
    //
    // 3% 가 "적합" 이 되려면 HOLD 를 부적합으로 세지 않아야 한다. 전에는
    // `every(PASS)` 였고 NEC 210.19 가 자리표시자라 늘 HOLD 여서, **입력과
    // 무관하게 언제나 "일부 기준 부적합"** 이었다. 두 값이 갈리는지가
    // 그 수리를 지킨다.
    expect(verdict(ok)).toBe('전 기준 적합');
    expect(verdict(bad)).toBe('일부 기준 부적합');
  });

  it('판정에 도달할 수 있는 조항 수가 선언과 같다 — 배선이 늘면 눈에 띄어야 한다', () => {
    const files = walk(join(REPO, 'src'));
    const inStandards = (f: string) => f.startsWith(STANDARDS);

    const DEF = /(?:buildArticle\('KEC-|kec\(')([\d.]+)'\s*,\s*'[\d.]+'\s*,\s*'[^']*'\s*,\s*\[([\s\S]*?)\]\s*[,)]/g;
    const clauses = new Map<string, string[]>();
    for (const f of files.filter(inStandards)) {
      for (const m of readFileSync(f, 'utf8').matchAll(DEF)) {
        const params = [...new Set([...m[2].matchAll(/(?:param:\s*'|cond\(')([A-Za-z_]\w*)/g)].map((x) => x[1]))];
        if (params.length) clauses.set(m[1], params);
      }
    }
    // 정규식이 죽으면 0 개를 세고 통과한다.
    expect(clauses.size).toBeGreaterThan(50);

    const outside = files.filter((f) => !inStandards(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
    const reachable = [...clauses.values()]
      .filter((params) => params.some((p) => new RegExp(`\\b${p}\\b`).test(outside)))
      .length;

    // 늘어나면(배선 추가) 이 수를 올리고 무엇을 배선했는지 적어라.
    // 줄어들면 배선이 끊긴 것이다.
    expect(reachable).toBe(12);
  });
});
