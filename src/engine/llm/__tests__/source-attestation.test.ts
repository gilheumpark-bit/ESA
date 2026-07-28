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

  /**
   * **이 두 검사는 앞서 반대로 적혀 있었다.** "실증 집합에 있으면 통과한다 —
   * 정상 경로를 막지 않는다" 와 "실증을 넘기지 않으면 종전 동작" 이 둘 다
   * `SAY('1.6m')` 이 **살아남기를** 기대했다. 그런데 1.6m 은 그 계산기가 낸
   * 값이 아니다 — 지어낸 값이다. 즉 검사가 구멍을 기대값으로 적고 있었고,
   * 그래서 독립 심사 백엔드 좌석이 "성공한 계산기에 편승" 을 찾아냈을 때
   * 이 스위트는 초록이었다(2026-07-28).
   *
   * 규칙을 바꾼다: **계산기 태그는 근접만으로 근거가 되지 않는다.** 계산기가
   * 실제로 낸 값은 `trustedInput` 에 있고 값이 일치할 때 통과한다.
   *
   * "기존 호출부가 깨진다" 는 우려는 실측으로 답한다 — `filterLLMOutput` 의
   * 프로덕션 호출처는 `app/api/chat/route.ts` **하나뿐**이고 거기선 실증을
   * 항상 넘긴다(아래 라우트 검사가 그것을 잠근다).
   */
  it('실증 집합에 있어도 계산기가 내지 않은 값은 통과하지 못한다', () => {
    const r = filterLLMOutput(SAY('1.6m'), [], '', new Set(['unit-converter']));
    expect(r.filtered).toContain('[미확인]');
    expect(r.passed).toBe(false);
  });

  it('계산기가 실제로 낸 값은 통과한다 — 정상 경로를 막지 않는다', () => {
    const r = filterLLMOutput(
      SAY('154000V'), [], '계산 결과: 154 kV = 154000 V', new Set(['unit-converter']),
    );
    expect(r.filtered).toContain('154000');
    expect(r.passed).toBe(true);
  });

  it('다른 계산기를 댄 태그는 통과하지 못한다', () => {
    const r = filterLLMOutput(SAY('1.6m'), [], '', new Set(['voltage-drop']));
    expect(r.filtered).toContain('[미확인]');
  });

  it('실증을 넘기지 않아도 계산기 태그는 근접 승인을 못 한다', () => {
    const r = filterLLMOutput(SAY('1.6m'), [], '');
    expect(r.filtered).toContain('[미확인]');
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

/**
 * **1 차 수리가 막지 못한 넷** (2026-07-28 독립 심사 백엔드 좌석 실행 실측).
 *
 * `attestedSources` 대조는 *실패한* 계산기 태그만 막았다. 성공한 계산기가
 * 같은 일을 할 수 있었고, 태그 표기를 조금만 바꿔도 대조를 비켜 갔다.
 */
describe('실증 우회 — 표기 변형과 근접 편승', () => {
  const attested = new Set(['unit-converter']);
  /** 계산기가 실제로 낸 값. 이 값들은 계속 통과해야 한다. */
  const trusted = '계산 결과: 154 kV = 154000 V';

  it.each([
    ['소문자 태그', '접근 한계거리는 1.63m 입니다. [SOURCE: esa_calculator:unit-converter]'],
    ['id 생략', '접근 한계거리는 1.63m 입니다. [SOURCE: ESA_CALCULATOR]'],
    [
      '성공한 계산기에 편승',
      '154kV 는 154000V 입니다. [SOURCE: ESA_CALCULATOR:unit-converter]'
        + ' 이 전압의 접근 한계거리는 1.63m 입니다.',
    ],
  ])('%s — 지어낸 1.63m 이 통과하지 못한다', (_label, text) => {
    const r = filterLLMOutput(text, [], trusted, attested);
    expect(r.passed).toBe(false);
    expect(r.filtered).not.toContain('1.63');
  });

  /**
   * 편승 사례가 특히 중요하다: 앱 체크리스트는 154kV 를 **1.7m** 라 말한다.
   * 지어낸 1.63m 이 나가면 두 화면이 어긋나고, 어긋난 쪽이 더 가깝다.
   */
  it('편승 사례에서 kV→V 환산값(계산기 실출력)은 살아남는다 — 과차단 아님', () => {
    const r = filterLLMOutput(
      '154kV 는 154000V 입니다. [SOURCE: ESA_CALCULATOR:unit-converter]',
      [], trusted, attested,
    );
    expect(r.passed).toBe(true);
    expect(r.filtered).toContain('154000');
  });

  /** 없는 근거를 만들어 내는 것 자체를 신호로 남긴다. */
  it('돌지 않은 계산기를 댄 태그가 blocked 에 기록된다', () => {
    const r = filterLLMOutput(
      '값은 5A 입니다. [SOURCE: ESA_CALCULATOR:never-ran]', [], '', attested,
    );
    expect(r.blocked.some((b) => b.text.includes('never-ran'))).toBe(true);
  });

  /**
   * **남은 구멍을 검사로 고정한다.** 계산기가 아닌 payload 는 여전히 근접
   * 승인이 된다 — 모델이 표 번호를 지어낼 수 있다. 값에 결박할 대상이
   * 없어서(표 조회 결과가 응답 경로에 없다) 지금은 못 닫는다. 나중에 누가
   * "다 막혔다" 고 읽지 않도록 현재 상태를 그대로 적어 둔다.
   */
  it('[알려진 구멍] 비-계산기 태그는 아직 근접 승인이 된다', () => {
    const r = filterLLMOutput(
      '접근 한계거리는 1.63m 입니다. [SOURCE: KEC_TABLE 232.3]', [], '', attested,
    );
    expect(r.passed).toBe(true);
  });
});
