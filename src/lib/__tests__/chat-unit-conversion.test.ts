import { resolveChatCalculationEvidence } from '@/lib/chat-calculation-evidence';

/**
 * 채팅이 단위 환산 질문에 **영수증을 만드는지** 본다.
 *
 * "0.4kV 는 몇 V" 에 `[미확인]입니다` 가 나갔다(AI 품질 점검 2026-07-28).
 * 모델은 400 을 알지만 앱이 보증할 수 없어 필터가 지웠고, 보증할 계산기가
 * 없었다.
 *
 * 계산기를 만든 것만으로는 부족했다 — 범용 의도 브리지가 이 질문 모양을
 * 못 읽어 계산기가 실행되지 않았다. 라이브에서 모델이 계산기 이름은
 * 정확히 댔는데(`unit-converter(전기 단위 환산)`) 답은 여전히 `[미확인]`
 * 이었다. **만든 것과 닿는 것은 다르다**(§2.4).
 */
describe('채팅 단위 환산 — 영수증이 만들어진다', () => {
  it.each([
    ['0.4kV는 몇 V야?', 400, 'V'],
    ['380V를 kV로 바꿔줘', 0.38, 'kV'],
    ['22.9kV를 V로 환산해줘', 22900, 'V'],
    ['1.5MW를 kW로 변환', 1500, 'kW'],
    ['250mA는 몇 A인가요', 0.25, 'A'],
  ])('%s → %s%s', (query, value, unit) => {
    const ev = resolveChatCalculationEvidence(query);
    expect(ev).not.toBeNull();
    expect(ev!.calculatorId).toBe('unit-converter');
    expect(Number(ev!.result.value)).toBeCloseTo(value, 6);
    expect(ev!.result.unit).toBe(unit);
    expect(ev!.result.judgment?.pass).toBe(true);
  });

  /**
   * 여기가 이 수리의 값어치다. 배수만 곱해 답을 내면 그게 이 앱이
   * 막으려는 실수다 — 영수증은 만들되 판정은 실패여야 한다.
   */
  it.each([
    ['500kVA를 kW로 바꿔줘', '역률'],
    ['380V를 A로 바꿔줘', '옴의 법칙'],
    ['100kW를 A로 환산해줘', '전압'],
  ])('%s — 영수증은 나오되 판정이 실패다', (query, needle) => {
    const ev = resolveChatCalculationEvidence(query);
    expect(ev).not.toBeNull();
    expect(ev!.result.judgment?.pass).toBe(false);
    expect(ev!.result.judgment?.message).toContain(needle);
    // 모델에게 "임의로 환산하지 마라" 가 함께 가야 한다.
    expect(ev!.promptContext).toContain('임의로 환산하지 마세요');
  });

  /**
   * 환산이 아닌 질문을 가로채면 안 된다. 단위가 여럿 있는 계산 요청이
   * 환산으로 오인되면 엉뚱한 영수증이 나간다.
   */
  it.each([
    ['전압 380V, 전류 100A, 길이 50m, 케이블 35sq 전압강하 계산해줘', 'voltage-drop'],
  ])('%s 는 %s 로 간다 — 환산이 가로채지 않는다', (query, expected) => {
    expect(resolveChatCalculationEvidence(query)?.calculatorId).toBe(expected);
  });

  it.each([
    '35sq 허용전류 알려줘',
    'KEC 232.5 조항이 뭔가요',
    '전압강하 계산해줘',
    '380V 계통 설명해줘',
  ])('%s 는 환산 영수증을 만들지 않는다', (query) => {
    const ev = resolveChatCalculationEvidence(query);
    expect(ev?.calculatorId).not.toBe('unit-converter');
  });

  it('환산 의도가 없으면 읽지 않는다 — 단위가 둘 있어도', () => {
    expect(resolveChatCalculationEvidence('380V 계통에 A급 차단기를 씁니다')?.calculatorId)
      .not.toBe('unit-converter');
  });

  it('영수증에 입력과 결과가 함께 실린다 — 필터가 그걸로 수치를 통과시킨다', () => {
    const ev = resolveChatCalculationEvidence('0.4kV는 몇 V야?')!;
    expect(ev.trustedText).toContain('400');
    expect(ev.trustedText).toContain('unit-converter');
    expect(ev.promptContext).toContain('[SOURCE: ESA_CALCULATOR:unit-converter]');
  });
});
