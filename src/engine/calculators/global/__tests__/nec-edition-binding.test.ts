import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { calculateNECLoad } from '../nec-load-calc';

/**
 * NEC 인용이 **어느 판인지 말하는가**.
 *
 * 실측 2026-07-28: 결과의 `source` 는 `edition: '2023'` 을 달고 나갔는데
 * 인용한 조항 번호(220.12 일반조명 · 220.42 수요율 · 220.52 소형기기)는
 * **2020 판 번호**였다. 선언한 판과 인용한 번호가 서로 다른 상태다.
 *
 * 번호는 실제로 옮겨졌다:
 *  · 2023 판 — 220.12 의 비주거 조명 내용이 220.42 로 이동, Article 220 을
 *    7 개 Part 로 재편
 *  · 2026 판 — Article 220 자체가 **Article 120** 으로 재번호
 *
 * 그래서 "NEC 220.12" 만 적는 것은 조항을 안 적은 것과 크게 다르지 않다 —
 * 읽는 사람이 최신판에서 찾으면 다른 내용이 나온다. 이 검사는 **판이
 * 붙어 있는지**를 잠근다. 번호를 새 판으로 옮겨 적는 것은 NEC 원문이 있어야
 * 하는 일이라 하지 않는다(확인 못 한 번호를 지어내지 않는다).
 */

const result = calculateNECLoad({
  occupancyType: 'dwelling',
  area: 200,
  smallApplianceCircuits: 2,
  laundryCircuits: 1,
  serviceVoltage: 240,
  phases: 1,
});

const disclosure = [...(result.warnings ?? [])].join(' | ');

describe('NEC 부하계산 — 판 결박', () => {
  it('선언한 판이 인용한 번호와 같다', () => {
    const nec = result.source?.find((s) => s.standard === 'NEC');
    expect(nec).toBeDefined();
    // 2020 번호를 쓰면서 2023 을 선언하던 것이 결함이었다.
    expect(nec?.edition).toBe('2020');
  });

  it('단계마다 조항에 판이 붙는다 — 번호만 적지 않는다', () => {
    const refs = result.steps.map((s) => s.standardRef ?? '').filter((r) => r.includes('220'));
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(ref).toMatch(/NEC\s*20\d\d\s*220\./);
  });

  it('이후 판에서 번호가 옮겨졌음을 결과가 말한다', () => {
    expect(disclosure).toMatch(/2020/);
    expect(disclosure).toMatch(/2023/);
    expect(disclosure).toMatch(/Article 120|120 으로/);
  });

  /**
   * 소스에도 같은 사실이 적혀 있어야 한다 — 결과 문구만 고치고 주석이
   * 옛 판을 말하면 다음 사람이 되돌린다.
   */
  it('소스 **머리말**이 재번호 사실을 기록하고 있다', () => {
    const src = readFileSync(join(__dirname, '..', 'nec-load-calc.ts'), 'utf8');
    // 파일 전체를 훑으면 아래 warnings 문자열이 이 검사를 대신 만족시킨다 —
    // 주석에서 지워도 초록이었다(2026-07-28 변이 실측). 머리말 블록만 본다.
    const header = src.slice(0, src.indexOf('*/') + 2);
    expect(header.length).toBeGreaterThan(200);
    expect(header).toMatch(/\*\*NEC 2020\*\*/);
    expect(header).toContain('Article 120');
    expect(header).toMatch(/2023 판/);
  });

  it('계산은 그대로 나온다 — 판 결박이 값을 건드리지 않았다', () => {
    expect(result.value).toBeGreaterThan(0);
    expect(result.steps.length).toBeGreaterThan(0);
  });
});
