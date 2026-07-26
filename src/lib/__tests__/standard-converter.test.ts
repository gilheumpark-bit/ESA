/**
 * 조항 번호 대조는 계층 식별자 매칭이다.
 *
 * 문자열 접두사로 보다가 두 가지가 깨져 있었다(실측 2026-07-26, /standards
 * "기준 변환" 화면).
 *
 *  ① 마디 중간에서 잘린 접두사를 하위로 인정 — "KEC 232.52 → NEC" 가
 *     240.1(단락보호)을 **82% 일치**로 돌려줬다. 232.52 는 232.5 의 하위가
 *     아니라 232.51 의 형제다. 없는 답보다 틀린 답이 나쁘다.
 *  ② 배열 순서가 특정성을 이김 — NEC 240.1(단락보호)은 제 행이 있는데도
 *     앞줄의 240(과전류 보호)에 가려 한 번도 나오지 않았다.
 */
import { convertStandard, getEquivalentStandards } from '../standard-converter';

const convert = (from: 'KEC' | 'NEC' | 'IEC' | 'JIS', clause: string, to: 'KEC' | 'NEC' | 'IEC' | 'JIS') =>
  convertStandard({ fromStandard: from, fromClause: clause, toStandard: to });

describe('조항 매칭', () => {
  it('마디 중간에서 잘린 접두사는 하위가 아니다', () => {
    // 232.52 를 232.5(단락보호)로 읽으면 안 된다. 표에서 232.52 가 무엇이든,
    // 단락보호는 아니다.
    expect(convert('KEC', '232.52', 'NEC').notes.join(' ')).not.toContain('Short Circuit');
  });

  it('마디 경계로 이어지는 것만 하위로 본다', () => {
    // 232.5.1 은 232.5 의 진짜 하위 — 상위 항목으로 답해도 된다.
    expect(convert('KEC', '232.5.1', 'NEC').toClause).toBe(convert('KEC', '232.5', 'NEC').toClause);
  });

  it('정확 일치가 상위 조항을 이긴다', () => {
    // NEC 240(과전류 보호)과 240.1(단락보호)이 둘 다 표에 있다.
    expect(convert('NEC', '240', 'KEC').notes.join(' ')).toContain('Overcurrent');
    expect(convert('NEC', '240.1', 'KEC').notes.join(' ')).toContain('Short Circuit');
    expect(convert('NEC', '240', 'KEC').toClause)
      .not.toBe(convert('NEC', '240.1', 'KEC').toClause);
  });

  it('상위가 여럿이면 가장 구체적인 것을 고른다', () => {
    // 240.1.5 는 240 과 240.1 둘 다의 하위 — 더 긴 240.1 이 답이다.
    expect(convert('NEC', '240.1.5', 'KEC').toClause).toBe(convert('NEC', '240.1', 'KEC').toClause);
  });

  it('표에 없으면 0% 로 없다고 답한다 — 지어내지 않는다', () => {
    const r = convert('KEC', '999.99', 'NEC');
    expect(r.toClause).toBe('');
    expect(r.confidence).toBe(0);
  });

  it('같은 기준끼리는 그대로 돌려준다', () => {
    const r = convert('KEC', '232.51', 'KEC');
    expect(r.toClause).toBe('232.51');
    expect(r.confidence).toBe(1);
  });
});

/**
 * 표 자체의 무결성. 어느 행이든 A→B 로 간 뒤 B→A 로 돌아오면 제자리여야 한다.
 * 돌아오지 못하면 두 행이 같은 조항 번호를 나눠 갖고 있다는 뜻이다.
 */
describe('표 왕복', () => {
  const PAIRS: Array<['KEC' | 'NEC' | 'IEC' | 'JIS', 'KEC' | 'NEC' | 'IEC' | 'JIS']> = [
    ['KEC', 'NEC'], ['KEC', 'IEC'], ['NEC', 'IEC'], ['IEC', 'JIS'],
  ];

  it.each(PAIRS)('%s ↔ %s — 제자리로 돌아오거나, 갈리는 이유를 밝힌다', (a, b) => {
    const broken: string[] = [];
    for (const clause of TABLE_CLAUSES[a]) {
      const forward = convert(a, clause, b);
      if (!forward.toClause) continue;
      const back = convert(b, forward.toClause, a);
      if (back.toClause === clause) continue;
      // 한 조항이 여러 주제를 덮으면 왕복이 제자리로 못 온다. 그 자체는
      // 데이터의 사실이고, 숨기지만 않으면 된다.
      const declared = back.notes.some((n) => n.includes('주제에 걸칩니다'));
      if (!declared) broken.push(`${a} ${clause} → ${b} ${forward.toClause} → ${a} ${back.toClause || '(없음)'}`);
    }
    expect(broken).toEqual([]);
  });

  it('여러 주제에 걸리는 조항은 걸린다고 말한다', () => {
    // JIS C 60364-5-52 는 배선방식 전반이라 표에서 5개 주제가 같은 번호를 쓴다.
    // 앞줄 하나(전압강하)만 답으로 내놓고 나머지를 감추면 안 된다.
    const note = convert('JIS', 'C 60364-5-52', 'IEC').notes.join(' ');
    expect(note).toContain('주제에 걸칩니다');
    for (const topic of ['전압강하', '분기회로', '배선 방식', '전선관 충전율', '수요율']) {
      expect(note).toContain(topic);
    }
  });

  it('주제가 하나면 군말을 붙이지 않는다', () => {
    expect(convert('KEC', '232.1', 'NEC').notes.join(' ')).not.toContain('주제에 걸칩니다');
  });

  it('동등 조항 조회도 같은 매칭 규칙을 쓴다', () => {
    const eq = getEquivalentStandards('NEC', '240.1');
    expect(eq.find((e) => e.standard === 'KEC')?.clause).toBe('232.5');
  });
});

/** 표에 실린 조항 번호 — 왕복 검사의 입력. */
const TABLE_CLAUSES: Record<'KEC' | 'NEC' | 'IEC' | 'JIS', string[]> = {
  KEC: ['232.1', '232.5', '232.51', '232.41', '232.75', '232.10', '232.30', '232.33', '232.8', '232.52', '232.11', '232.40'],
  NEC: ['240', '240.1', '210.19(A) FPN', '310.16', '210.8', '240.12', '460', '220'],
  IEC: ['60364-4-43.4', '60364-5-52.525', '60364-5-52', '60364-4-41.411', '60364-5-56.560'],
  JIS: ['C 60364-4-43.4', 'C 60364-5-52', 'C 4801'],
};
