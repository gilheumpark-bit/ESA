import { filterLLMOutput } from '../output-filter';

/**
 * 질문에 있던 조항을 답이 **되받을 수 있는지** 본다.
 *
 * 출력 필터는 수치에 대해 이미 "질문에 있던 값은 그대로 인용해도 된다"
 * (`isTrustedInput`)를 갖고 있었다. 조항 인용 규칙에는 그 예외가 없어서
 * 도구 호출이나 `[SOURCE:]` 태그가 없으면 무조건 지웠다.
 *
 * 실측 2026-07-28, 라이브 답변:
 *   질문 "KEC 999.99 조항이 무슨 내용인지 알려줘"
 *   답변 "문의하신 **[미확인]** 조항은 실제 KEC 에 존재하지 않거나 …"
 * 모델은 **옳게** 답했다(지어내지 않고 없는 번호라고 했다). 그런데 무엇을
 * 묻고 답하는지가 지워져 사용자가 읽을 수 없다.
 *
 * 질문의 조항을 되받는 것은 **근거 주장이 아니라 대상 지칭**이다.
 * 반대로 모델이 *다른* 조항을 근거로 끌어오는 것은 계속 막아야 한다 —
 * 그게 이 규칙의 존재 이유다. 두 방향을 함께 잠근다.
 */
describe('조항 되받기', () => {
  it.each([
    ['KEC 232 조항 알려줘', 'KEC 232 조항은 다음과 같습니다.', 'KEC 232'],
    ['KEC 999.99 조항 알려줘', 'KEC 999.99 조항은 존재하지 않습니다.', 'KEC 999.99'],
    ['KEC 232.3.9 알려줘', 'KEC 232.3.9 조항을 보십시오.', 'KEC 232.3.9'],
    ['NEC 310.16 이 뭐야', 'NEC 310.16 은 허용전류 표입니다.', 'NEC 310.16'],
    ['IEC 60364-5-52 문의', 'IEC 60364-5-52 는 배선설비를 다룹니다.', 'IEC 60364-5-52'],
  ])('질문 "%s" 의 조항은 답에 남는다', (question, answer, citation) => {
    const r = filterLLMOutput(answer, [], question);
    expect(r.filtered).toContain(citation);
    expect(r.filtered).not.toContain('[미확인]');
  });

  /**
   * 여기가 이 규칙의 본래 목적이다. 되받기를 허용하면서 이쪽이 뚫리면
   * 수리가 아니라 후퇴다.
   */
  it.each([
    ['KEC 232 조항 알려줘', 'NEC 310.16 을 근거로 하면 다음과 같습니다.'],
    ['접지 방식 알려줘', 'KEC 142.2 에 따르면 접지저항 기준이 있습니다.'],
    ['케이블 굵기 문의', 'IEC 60364-5-52 표에 따라 결정합니다.'],
  ])('질문 "%s" 에 없는 조항을 끌어오면 막는다', (question, answer) => {
    const r = filterLLMOutput(answer, [], question);
    expect(r.filtered).toContain('[미확인]');
    expect(r.blocked.some((b) => b.reason === 'direct_citation')).toBe(true);
  });

  it('되받기는 표기 흔들림(공백·대소문자)에도 통한다', () => {
    const r = filterLLMOutput('kec  232.3.9 를 보십시오.', [], 'KEC 232.3.9 알려줘');
    expect(r.filtered).not.toContain('[미확인]');
  });

  /**
   * 수치 쪽 예외는 원래 있던 것이다 — 조항 예외를 넣으면서 깨지지 않았는지.
   */
  it('질문의 수치 되받기도 그대로 살아 있다', () => {
    const r = filterLLMOutput('말씀하신 100AF 차단기 기준으로 보겠습니다.', [], '100AF 차단기 문의');
    expect(r.filtered).toContain('100AF');
  });

  it('근거 없는 새 수치는 여전히 막는다', () => {
    const r = filterLLMOutput('35sq 의 허용전류는 175A 입니다.', [], '35sq 케이블 문의');
    expect(r.filtered).toContain('[미확인]');
  });
});
