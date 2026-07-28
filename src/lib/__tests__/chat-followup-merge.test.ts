import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveChatCalculationEvidence } from '@/lib/chat-calculation-evidence';

/**
 * 앞 turn 을 이어받는 후속 계산.
 *
 * "…전압강하 계산해줘" 다음 "그럼 길이를 100m 로 늘리면?" 은 지금까지
 * 되물었다. 마지막 메시지만 봤기 때문이다. 수치를 지어내지 않는다는 점에서
 * 안전한 쪽으로 틀렸지만 자연스러운 후속이 매번 막혔다.
 *
 * **그냥 대화를 이어붙이면 위험하다.** 실측 2026-07-28:
 *   · 앞뒤로 붙이면 앞의 값이 이긴다 — 후속의 100m 가 무시되고 낡은 50m 로
 *     계산된 영수증이 나갔다.
 *   · 무관한 후속("그건 왜 그래?")에도 앞 값이 다 살아나 묻지도 않은
 *     계산의 영수증이 붙었다.
 *
 * 그래서 네 조건 안에서만 잇는다. 아래가 그 네 조건의 잠금이다.
 */
const PRIOR = '전압 380V, 전류 100A, 길이 50m, 케이블 35sq 구리, 3상, 역률 0.9 전압강하 계산해줘';

describe('후속 계산 — 이어받기', () => {
  it('앞 turn 만으로도 영수증이 나온다 — 바탕이 없으면 아래가 다 공회전이다', () => {
    const base = resolveChatCalculationEvidence(PRIOR);
    expect(base?.calculatorId).toBe('voltage-drop');
    expect(base?.input.length).toBe(50);
  });

  it.each([
    ['그럼 길이를 100m로 늘리면 전압강하는 얼마야?', 'length', 100],
    ['길이 100m로 하면?', 'length', 100],
    ['전압을 440V로 바꾸면?', 'voltage', 440],
    ['전류 150A면?', 'current', 150],
    ['케이블 50sq로 하면?', 'cableSize', 50],
  ])('"%s" — %s 가 %s 로 바뀌어 다시 계산된다', (followUp, field, value) => {
    const ev = resolveChatCalculationEvidence(followUp, [PRIOR]);
    expect(ev).not.toBeNull();
    expect(ev!.calculatorId).toBe('voltage-drop');
    expect(ev!.input[field]).toBe(value);
  });

  /**
   * 여기가 핵심이다. 후속이 말한 값이 이겨야 한다 — 반대면 낡은 값으로
   * 계산한 영수증이 나간다.
   */
  it('후속이 말한 값이 앞의 값을 덮는다', () => {
    const ev = resolveChatCalculationEvidence('그럼 길이를 100m로 늘리면?', [PRIOR])!;
    expect(ev.input.length).toBe(100);
    // 나머지는 그대로 이어받는다.
    expect(ev.input.voltage).toBe(380);
    expect(ev.input.current).toBe(100);
    expect(ev.input.cableSize).toBe(35);
  });

  it('길이를 두 배로 하면 전압강하도 커진다 — 실제로 다시 계산됐는지', () => {
    const base = resolveChatCalculationEvidence(PRIOR)!;
    const after = resolveChatCalculationEvidence('그럼 길이를 100m로 늘리면?', [PRIOR])!;
    expect(Number(after.result.value)).toBeGreaterThan(Number(base.result.value) * 1.5);
  });

  /**
   * 이어받은 값을 사용자가 알아야 한다. 앞 조건이 그대로 쓰였다는 걸
   * 모르면 답을 잘못 읽는다.
   */
  it('이어받은 값을 답변에서 밝히게 한다', () => {
    const ev = resolveChatCalculationEvidence('그럼 길이를 100m로 늘리면?', [PRIOR])!;
    expect(ev.assumed.length).toBeGreaterThan(0);
    expect(ev.promptContext).toContain('앞 대화에서 그대로 가져온 값');
    expect(ev.promptContext).toContain('380');
  });
});

describe('후속 계산 — 잇지 않아야 하는 경우', () => {
  it.each([
    '그건 왜 그래?',
    '더 자세히 설명해줘',
    '고마워',
    'KEC 기준은 몇 퍼센트야?',
  ])('"%s" 는 앞 계산을 이어받지 않는다', (followUp) => {
    expect(resolveChatCalculationEvidence(followUp, [PRIOR])).toBeNull();
  });

  it('앞 turn 이 영수증을 못 냈으면 이어받을 것도 없다', () => {
    expect(resolveChatCalculationEvidence('길이 100m로 하면?', ['전압강하 계산해줘'])).toBeNull();
  });

  it('앞 turn 이 없으면 단일 turn 그대로다 — 회귀 없음', () => {
    expect(resolveChatCalculationEvidence('그럼 길이를 100m로 늘리면?')).toBeNull();
    expect(resolveChatCalculationEvidence(PRIOR)).not.toBeNull();
  });
});

describe('라우트가 앞 turn 을 넘긴다', () => {
  const route = readFileSync(
    join(__dirname, '..', '..', 'app', 'api', 'chat', 'route.ts'),
    'utf8',
  );

  it('사용자 발화만, 마지막을 뺀 것을 넘긴다', () => {
    expect(route).toContain('resolveChatCalculationEvidence(lastUser.content, priorUserTexts)');
    expect(route).toContain("message.role === 'user'");
    expect(route).toContain('.slice(0, -1)');
  });
});
