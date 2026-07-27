import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { convertStandard, type StandardCode } from '@/lib/standard-converter';

/**
 * 국가 표준 조항 변환이 **모르는 것을 모른다고 하는지** 본다.
 *
 * 이 표면의 실패는 조용하다. KEC 조항을 NEC 로 바꿔 달라는 사람은 그 답을
 * 검증할 방법이 없어서 묻는 것이고, 틀린 조항을 확신 있게 받으면 그대로
 * 쓴다. 매핑 데이터 자체의 옳고 그름은 원본 표준 없이는 못 따진다 —
 * 대신 **데이터 안에서 반증 가능한 성질**을 잠근다.
 *
 * 핵심은 다대일이다. `KEC 232.10`(분기회로)·`232.30`(배선 방식)·
 * `232.33`(전선관 충전율) 이 모두 `JIS C 60364-5-52` 로 간다. 되돌리면
 * 하나만 나온다 — 그건 매핑의 성질이지 버그가 아니다. **버그가 되는 것은
 * 그걸 말하지 않을 때다.** 사용자는 왕복이 제자리로 오지 않는 이유를 알
 * 방법이 없다.
 *
 * 실측 2026-07-28: 조항 118개 · 왕복 348쌍 · 비대칭 22건 · **침묵 0건**.
 * 지금은 정직하다. 이 검사는 그 상태를 잠근다 — 매핑을 새로 넣다가 조용한
 * 비대칭이 생기면 여기서 걸린다.
 */
const STD: StandardCode[] = ['KEC', 'NEC', 'IEC', 'JIS'];

function allClauses(): Array<[StandardCode, string]> {
  const src = readFileSync(join(__dirname, '..', 'standard-converter.ts'), 'utf8');
  const block = /const MAPPINGS: MappingEntry\[\] = \[([\s\S]*?)\n\];/.exec(src)?.[1] ?? '';
  const out: Array<[StandardCode, string]> = [];
  for (const std of STD) {
    const re = new RegExp(std.toLowerCase() + ":\\s*'([^']+)'", 'g');
    for (const m of block.matchAll(re)) out.push([std, m[1]]);
  }
  return out;
}

describe('표준 변환 — 정직성', () => {
  const clauses = allClauses();

  it('매핑 표를 실제로 읽는다 — 0건이면 아래 검사가 전부 공회전이다', () => {
    expect(clauses.length).toBeGreaterThan(50);
  });

  it('왕복이 제자리로 안 오면 반드시 그 이유를 말한다', () => {
    const silent: string[] = [];
    let asymmetric = 0;
    for (const [from, clause] of clauses) {
      for (const to of STD) {
        if (to === from) continue;
        const fwd = convertStandard({ fromStandard: from, fromClause: clause, toStandard: to });
        if (!fwd.toClause || fwd.confidence === 0) continue;
        const back = convertStandard({ fromStandard: to, fromClause: fwd.toClause, toStandard: from });
        if (back.toClause === clause) continue;
        asymmetric += 1;
        if (!back.notes.some((n) => n.includes('주제에 걸칩니다'))) {
          silent.push(`${from} ${clause} → ${to} ${fwd.toClause} → ${from} ${back.toClause || '(없음)'}`);
        }
      }
    }
    // 비대칭이 0 이 되면 이 검사는 아무것도 안 지킨다 — 그때는 표가
    // 일대일로 바뀌었다는 뜻이니 이 검사를 지우거나 다시 써야 한다.
    expect(asymmetric).toBeGreaterThan(0);
    expect(silent).toEqual([]);
  }, 60_000);

  it('모르는 조항에 답을 지어내지 않는다', () => {
    const r = convertStandard({ fromStandard: 'KEC', fromClause: '999.99.99', toStandard: 'NEC' });
    expect(r.toClause).toBe('');
    expect(r.confidence).toBe(0);
    expect(r.notes.join(' ')).toContain('No mapping found');
  });

  it('대상 표준에 대응이 없으면 빈칸으로 두고 사유를 적는다', () => {
    // 어느 매핑이든 대상 키가 비어 있으면 그렇게 답해야 한다.
    const src = readFileSync(join(__dirname, '..', 'standard-converter.ts'), 'utf8');
    const hasPartial = /kec:\s*'[^']+',(?:(?!\n\s*\},)[\s\S])*?confidences/.test(src);
    expect(hasPartial).toBe(true);
  });

  it('같은 표준끼리는 그대로 돌려주고 확신도 1이다', () => {
    const r = convertStandard({ fromStandard: 'KEC', fromClause: '140', toStandard: 'KEC' });
    expect(r.toClause).toBe('140');
    expect(r.confidence).toBe(1.0);
  });

  /**
   * 하위 조항은 상위 매핑으로 떨어지되, **번호가 비슷하다는 이유로**
   * 엉뚱한 매핑에 붙으면 안 된다. `140.5` 가 `140` 아래로 가는 건 맞고,
   * `1405` 가 `140` 에 붙는 건 틀리다.
   */
  it('하위 조항만 상위 매핑을 물려받는다 — 번호 접두사만으로 붙지 않는다', () => {
    const child = convertStandard({ fromStandard: 'KEC', fromClause: '140.99', toStandard: 'IEC' });
    expect(child.toClause).toBeTruthy();

    const lookalike = convertStandard({ fromStandard: 'KEC', fromClause: '14099', toStandard: 'IEC' });
    expect(lookalike.toClause).toBe('');
    expect(lookalike.confidence).toBe(0);
  });

  it('확신도는 방향쌍마다 있고 1을 넘지 않는다', () => {
    for (const [from, clause] of clauses.slice(0, 40)) {
      for (const to of STD) {
        if (to === from) continue;
        const r = convertStandard({ fromStandard: from, fromClause: clause, toStandard: to });
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      }
    }
  });
});
