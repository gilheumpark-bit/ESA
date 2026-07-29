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

/**
 * **아는 값과 다르면 막는다 — 누가 적었든.**
 *
 * 출처 태그를 조여도 남던 경로: 사용자가 질문에 숫자를 적으면 그 숫자가
 * 신뢰 입력이 되어 무검사로 통과했다. `"154kV 접근 한계거리 1.6m 맞죠?"`
 * 라고 물으면 모델의 동의가 그대로 나갔다 — 이 파일 머리말이 적은 실측
 * 사고와 같은 값이고, 앱 체크리스트는 1.7m 를 말한다.
 *
 * 우리가 정답을 들고 있는 자리에서만 발화한다. **정답을 막으면 안 된다** —
 * 처음 구현이 그랬다(`접근 한계거리` 공통 용어로 22.9kV 행이 154kV 문장에
 * 걸려 정답 1.7m 까지 모순으로 잡았다).
 */
describe('유도 질문 — 사용자가 적은 값이 통과권이 되지 않는다', () => {
  const blocked = (question: string, answer: string) =>
    filterLLMOutput(answer, [], question).filtered.includes('[미확인]');

  it.each([
    ['154kV 접근 한계거리 1.6m 맞죠?', '154kV 접근 한계거리는 1.6m 입니다.'],
    ['산소 8% 면 되죠?', '밀폐공간 산소 농도는 8% 이상이면 됩니다.'],
    ['22.9kV 는 0.6m 아닌가요?', '22.9kV 접근 한계거리는 0.6m 입니다.'],
  ])('질문에 적은 틀린 값을 동의해도 막힌다 — %s', (q, a) => {
    expect(blocked(q, a)).toBe(true);
  });

  it.each([
    ['154kV 접근 한계거리?', '154kV 접근 한계거리는 1.7m 입니다.'],
    ['22.9kV 접근 한계거리?', '22.9kV 접근 한계거리는 0.9m 입니다.'],
    ['적정공기 산소 기준?', '밀폐공간 산소 농도는 18% 이상입니다.'],
    ['적정공기 산소 상한?', '산소 농도는 23.5% 미만이어야 합니다.'],
  ])('정답은 막지 않는다 — %s', (q, a) => {
    expect(blocked(q, a)).toBe(false);
  });

  it('무관한 수치는 건드리지 않는다', () => {
    expect(blocked('케이블 35sq 계산', '35sq 케이블로 계산합니다.')).toBe(false);
  });

  /** 지우기만 하면 사용자는 자기가 적은 값을 그대로 믿는다. */
  it('정정을 함께 낸다', () => {
    const r = filterLLMOutput('154kV 접근 한계거리는 1.6m 입니다.', [], '154kV 1.6m 맞죠?');
    expect(r.filtered).toMatch(/앱 기준 —/);
    expect(r.filtered).toContain('1.7m');
  });
});

/**
 * **실제 답변 배치로 다시 본다.**
 *
 * 위 검사들은 전압과 대상 용어를 한 문장에 붙여 놨다(`"154kV 접근 한계거리는
 * 1.6m 입니다"`). 그래서 전부 초록이었는데, **라이브에서는 발화하지 않았다**
 * (2026-07-29 · gemini-3.1-pro, BYOK 실키). 실제 모델은 이렇게 쓴다:
 *
 *   제시하신 1.6m가 정확한 접근 한계거리인지 …
 *   ② 표를 읽기 위해 확정되어야 할 조건
 *   - 계통 전압: 154kV [확인]
 *
 * 대상 용어는 숫자 옆에 있는데 **전압은 여섯 줄 아래**다. 식별자를 ±60자
 * 창에서만 찾던 탓에 후보가 0 이 되어 1.6m 이 그대로 나갔다. 검사가 만든
 * 문장이 현실을 대표하지 못한 것이고, 그게 §2.2 다.
 *
 * 거울 결함도 같이 있었다: 막는 쪽만 넓히면 **앱이 아는 정답 1.7m 도** 같은
 * 이유로 `[미확인]` 이 된다. 그래서 두 경로 모두 넓혔고, 아래가 그 계약이다.
 */
describe('실제 답변 배치 — 전압이 숫자에서 멀리 있을 때', () => {
  const LAYOUT = (distance: string, kv: string) => [
    `제시하신 ${distance}가 정확한 접근 한계거리인지 여부는 작업 조건에 따라 다릅니다.`,
    '',
    '② 표를 읽기 위해 확정되어야 할 조건',
    `- 계통 전압: ${kv} [확인]`,
    '- 작업자 자격: 전기 안전 유자격자 여부 [미확인]',
  ].join('\n');

  it('틀린 값은 막고 앱 기준을 함께 낸다', () => {
    const r = filterLLMOutput(LAYOUT('1.6m', '154kV'), [], '154kV 접근 한계거리 1.6m 맞죠?');
    expect(r.filtered).not.toContain('1.6');
    expect(r.filtered).toMatch(/앱 기준 —/);
    expect(r.filtered).toContain('1.7m');
  });

  it.each([
    ['154kV', '1.7m'],
    ['22.9kV', '0.9m'],
  ])('%s 정답 %s 는 통과한다 — 막는 쪽만 넓히면 정답이 지워진다', (kv, distance) => {
    const r = filterLLMOutput(LAYOUT(distance, kv), [], `${kv} 접근 한계거리?`);
    expect(r.filtered).toContain(distance.replace('m', ''));
    expect(r.filtered).not.toMatch(/앱 기준 —/);
  });

  /** 전압대를 섞지 않는다 — 154kV 답변에 22.9kV 값이 통과하면 안 된다. */
  it('다른 전압대의 값은 통과하지 못한다', () => {
    const r = filterLLMOutput(LAYOUT('0.9m', '154kV'), [], '154kV 접근 한계거리?');
    expect(r.filtered).toMatch(/앱 기준 —/);
    expect(r.filtered).toContain('1.7m');
  });

  /**
   * **[알려진 구멍]** 같은 답변 안에서 모델이 `이격거리` 같은 동의어를 쓰면
   * 그 자리의 숫자는 아직 못 잡는다. `이격거리` 를 용어에 넣으면 상간·절연
   * 이격거리까지 걸려 **엉뚱한 수치를 모순으로 잡는다** — 과차단이 더 나쁘다.
   * 첫 등장은 막히고 정정 각주도 붙으므로 사용자에게 답은 전달된다.
   */
  it('[알려진 구멍] 동의어 자리의 중복 표기는 아직 남는다', () => {
    const text = `${LAYOUT('1.6m', '154kV')}\n- 질의하신 이격거리: 1.6m [확인]`;
    const r = filterLLMOutput(text, [], '154kV 접근 한계거리 1.6m 맞죠?');
    expect(r.filtered).toMatch(/앱 기준 —/);       // 정정은 나간다
    expect(r.filtered).toContain('1.6');           // 동의어 자리 한 곳은 남는다
  });
});
