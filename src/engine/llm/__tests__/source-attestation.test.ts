import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { filterLLMOutput } from '../output-filter';

/**
 * 모델이 쓴 근거 태그를 **실제로 돈 계산기와 대조**하는가.
 *
 * `[SOURCE: ...]` 는 시스템이 주입하는 것으로 적혀 있었지만 실제로는
 * **모델 출력 안의 글자**다(라우트는 `toolCalls` 로 빈 배열을 넘긴다).
 * 즉 모델이 태그를 적는 것만으로 제 숫자에 근거를 붙일 수 있었다.
 *
 * 실측 2026-07-28(실공급자 라이브, gemini-3.6-flash):
 *
 *   질문: "154kV 충전전로 접근 한계거리는 몇 m 입니까?"
 *   답변: "…접근 한계거리는 **1.6m (160cm)**입니다 …
 *          [SOURCE: ESA_CALCULATOR:unit-converter]"
 *
 * 같은 요청에서 `unit-converter` 는 `judgment.pass=false` 로 **실패**했다
 * ("kV 에서 m 로는 단위 환산만으로 갈 수 없습니다"). 실패한 계산기의
 * 이름표가 지어낸 거리를 통과시킨 것이고, 그 값은 앱 자신의 체크리스트
 * (1.7m)와도 어긋난다.
 */

const SAY = (n: string) => `154kV 접근 한계거리는 ${n} 입니다. [SOURCE: ESA_CALCULATOR:unit-converter]`;

describe('근거 태그 실증 — 실패한 계산기의 이름표는 근거가 아니다', () => {
  it('실증 집합에 없으면 그 태그로는 통과하지 못한다', () => {
    const r = filterLLMOutput(SAY('1.6m'), [], '', new Set());
    expect(r.filtered).toContain('[미확인]');
    expect(r.passed).toBe(false);
  });

  it('실증 집합에 있으면 통과한다 — 정상 경로를 막지 않는다', () => {
    const r = filterLLMOutput(SAY('1.6m'), [], '', new Set(['unit-converter']));
    expect(r.filtered).toContain('1.6');
  });

  it('다른 계산기를 댄 태그는 통과하지 못한다', () => {
    const r = filterLLMOutput(SAY('1.6m'), [], '', new Set(['voltage-drop']));
    expect(r.filtered).toContain('[미확인]');
  });

  /**
   * 실증을 넘기지 않으면 종전대로 — 기존 호출부·검사가 깨지지 않게.
   * 다만 **production 경로는 반드시 넘겨야** 하고, 그것을 아래에서 잠근다.
   */
  it('실증을 넘기지 않으면 종전 동작', () => {
    const r = filterLLMOutput(SAY('1.6m'), [], '');
    expect(r.filtered).toContain('1.6');
  });

  it('챗 라우트가 실증을 실제로 넘긴다', () => {
    const route = readFileSync(
      join(__dirname, '..', '..', '..', 'app', 'api', 'chat', 'route.ts'),
      'utf8',
    );
    // 넷 다 있어야 한다 — 집합을 만들고, 실패를 걸러 담고, 필터에 넘긴다.
    expect(route).toMatch(/const attestedSources = new Set<string>\(\)/);
    expect(route).toMatch(/judgment\?\.pass !== false/);
    expect(route).toMatch(/attestedSources\.add\(/);
    expect(route).toMatch(/filterLLMOutput\([\s\S]{0,240}attestedSources,/);
  });

  /** 계산기 이름이 아닌 근거 태그(KEC 표 등)는 이 규칙과 무관하다. */
  it('비-계산기 근거 태그는 실증 대상이 아니다', () => {
    const text = '허용전류는 100A 입니다. [SOURCE: KEC 232.3 Table 232-1]';
    const r = filterLLMOutput(text, [], '', new Set());
    expect(r.filtered).toContain('100');
  });
});
