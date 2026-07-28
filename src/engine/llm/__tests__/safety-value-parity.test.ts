import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { APP_ASSERTED_CONSTANTS, findAssertedSource } from '../app-asserted-constants';

/**
 * 같은 규정 수치가 **두 파일에 사본으로 있다.** 둘을 묶는다.
 *
 *   `engine/safety/confined-space.ts`  — 화면 체크리스트가 보여주는 문구
 *   `engine/llm/app-asserted-constants.ts` — 챗이 말해도 되는 값 목록
 *
 * 소비자가 겹치지 않는다(레지스트리는 `output-filter` 만, 체크리스트는
 * `/field` 만). 그래서 **한쪽만 고치면 다른 쪽은 조용히 갈라진다** —
 * 그리고 갈라졌을 때 사용자에게 "안전보건규칙 제321조 제1항" 을 근거로
 * 달고 말하는 쪽은 LLM 경로다.
 *
 * 이건 가정이 아니라 이미 한 번 일어난 일이다: 2026-07-28 세션에서
 * 적정공기 수치를 `confined-space.ts` 에서 고쳤는데 `lib/safety-scheduler.ts`
 * 의 사본이 남아 화면에 옛 값이 그대로 떴다. 독립 심사가 같은 구조가
 * LLM 레지스트리에도 있다고 지적했고, 실측으로 확인됐다.
 *
 * 값을 한 곳으로 합치지 않는 이유: 두 파일이 쓰는 형태가 다르다(체크리스트는
 * 표시 문장, 레지스트리는 매칭용 숫자 문자열). 합치면 한쪽이 다른 쪽 형식을
 * 떠안는다. 대신 **어긋나면 깨지는 불변식**을 둔다.
 */

const CHECKLIST = readFileSync(
  join(__dirname, '..', '..', 'safety', 'confined-space.ts'),
  'utf8',
);

/** 주석은 세지 않는다 — 설명문이 검사를 대신 만족시키면 안 된다. */
const CHECKLIST_CODE = CHECKLIST
  .split(/\r?\n/)
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');

describe('안전 수치 — 체크리스트와 LLM 레지스트리가 어긋나지 않는다', () => {
  it('두 원본을 실제로 읽는다 — 공회전 아님', () => {
    expect(CHECKLIST_CODE.length).toBeGreaterThan(1000);
    expect(APP_ASSERTED_CONSTANTS.length).toBeGreaterThan(8);
  });

  /**
   * 레지스트리의 거리 값이 체크리스트 문구에 **그대로** 있어야 한다.
   * 체크리스트를 고치고 레지스트리를 잊으면 여기서 깨진다(그 반대도).
   */
  it.each([
    ['22.9kV', '0.9'],
    ['154kV', '1.7'],
  ])('%s 접근 한계거리가 두 곳에서 같다', (kv, metres) => {
    // ① 레지스트리에 있다
    expect(findAssertedSource(metres, 'm', `${kv} 접근 한계거리`)).toMatch(/제321조/);
    // ② 체크리스트 문구에도 같은 값이 있다
    expect(CHECKLIST_CODE).toContain(`${kv} ${metres}m`);
  });

  /** 적정공기 네 항목도 같은 규율 — 이쪽이 실제로 갈라졌던 축이다. */
  // 체크리스트 문구는 항목마다 표현이 달라(산소만 "농도" 가 붙는다) 기대
  // 문자열을 표에 그대로 적는다 — 치환으로 맞추면 읽는 사람이 무엇을
  // 검사하는지 알 수 없다.
  it.each([
    ['18', '%', '산소', '산소 농도 18%'],
    ['1.5', '%', '이산화탄소', '이산화탄소 1.5%'],
    ['30', 'ppm', '일산화탄소', '일산화탄소 30ppm'],
    ['10', 'ppm', '황화수소', '황화수소 10ppm'],
  ])('적정공기 %s%s(%s)가 두 곳에서 같다', (value, unit, term, checklistText) => {
    expect(findAssertedSource(value, unit, `${term} 기준`)).toMatch(/제618조/);
    expect(CHECKLIST_CODE).toContain(checklistText);
  });

  /**
   * 레지스트리가 **체크리스트에 없는 규정 수치를 새로 만들지 않는다.**
   * 목록의 규칙은 "앱이 이미 근거와 함께 내보내는 값" 이다 — 여기서
   * 값을 창작하면 그 규칙이 무너지고, 챗이 앱보다 많이 말하게 된다.
   */
  it('규정 출처 항목은 전부 체크리스트가 뒷받침한다', () => {
    const orphan = APP_ASSERTED_CONSTANTS
      .filter((c) => /안전보건규칙/.test(c.source))
      .filter((c) => !CHECKLIST_CODE.includes(c.value));
    expect(orphan.map((c) => `${c.value}${c.unit}(${c.source})`)).toEqual([]);
  });
});
