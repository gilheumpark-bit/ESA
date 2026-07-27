import { resolveChatCalculationEvidence, resolveChatCalculationShortfall } from '@/lib/chat-calculation-evidence';
import { filterLLMOutput } from '@engine/llm/output-filter';

/**
 * 표에서 수치를 꺼내는 질문에 **지시가 붙는지** 본다.
 *
 * 이 앱의 사용자는 계산만 시키지 않는다. "35sq 허용전류 얼마냐" 처럼 표
 * 값을 묻는다. 그건 `parseQuery` 에서 `calculate` 가 아니라 `search` 로
 * 분류되고 — 맞는 분류다 — 그 다음이 비어 있었다. 계산기도 안 걸리고
 * `calculate` 도 아니니 시스템 프롬프트에 아무 지시도 안 붙었다.
 *
 * 그러면 모델은 기억에서 수치를 쓰고, 출력 필터가 그걸 전부 [미확인] 으로
 * 지운다. 사용자가 받는 건 구멍 뚫린 문장이다(아래 실측 재현).
 * 필터는 제 일을 한 것이고, 빠진 건 **쓰기 전에 알려 주는 지시**다.
 */
describe('표 조회 질문 — 수치 발명 차단 지시', () => {
  const 표조회 = [
    '케이블 35sq 허용전류 알려줘',
    '100AF 차단기에 4sq 케이블 써도 되나요?',
    'MCCB 225AT에 맞는 케이블 굵기는?',
    'CV 케이블 관로 포설 보정계수는?',
    '접지저항 기준이 뭐야?',
  ];

  it.each(표조회)('%s — 지시가 붙는다', (q) => {
    expect(resolveChatCalculationEvidence(q)).toBeNull();
    const shortfall = resolveChatCalculationShortfall(q);
    expect(shortfall).toBeTruthy();
    expect(shortfall).toContain('수치로 적지 마세요');
  });

  /**
   * 넓게 붙이면 프롬프트만 길어진다. 설명을 묻는 질문에는 안 붙어야 한다.
   */
  it.each([
    'KEC가 뭐야?',
    '누전차단기 원리 설명해줘',
    '변압기 결선 방식 종류 알려줘',
    // 조항 번호·연도도 숫자다. "숫자가 있으면" 으로 잡으면 이것들이 걸린다
    // — 실제로 걸렸고 기존 잠금이 잡아냈다. 단위 유무가 두 부류를 가른다.
    'KEC 232.5 조항이 뭔가요',
    'IEC 60364-4-41 은 무엇을 다루나요',
    '2024 개정에서 바뀐 게 뭐야',
  ])('%s — 설명 질문에는 안 붙는다', (q) => {
    expect(resolveChatCalculationShortfall(q)).toBeNull();
  });

  /**
   * 계산 요청은 원래 경로 그대로여야 한다 — 조회 지시가 계산 지시를
   * 밀어내면 회귀다.
   */
  it('계산기가 잡힌 계산 요청에는 입력 되묻기 지시가 붙는다', () => {
    const sf = resolveChatCalculationShortfall('전압강하 계산해줘');
    expect(sf).toBeTruthy();
    expect(sf).toContain('필요한 입력');
    expect(sf).not.toContain('표·규정에서 수치를 꺼내는 조회');
  });

  /**
   * 계산 의도인데 **맞는 계산기가 없는** 경우. 위 케이스와 다른 분기다 —
   * 변이 검사에서 이 분기를 아무도 안 밟는다는 게 드러나 추가했다.
   * 여기에 조회 지시가 들어오면 "공식과 입력을 설명하라" 가 밀려난다.
   */
  it('계산 의도인데 계산기가 없으면 공식·입력 설명 지시가 붙는다', () => {
    const sf = resolveChatCalculationShortfall('22.9kV 500kVA 변압기 2차 전류가 얼마인가요?');
    expect(sf).toBeTruthy();
    expect(sf).toContain('적용 공식을 기호로');
    expect(sf).not.toContain('표·규정에서 수치를 꺼내는 조회');
  });

  it('입력이 완전하면 계산기가 돌고 지시는 붙지 않는다', () => {
    const q = '전압 380V, 전류 100A, 길이 50m, 케이블 35sq 전압강하 계산해줘';
    expect(resolveChatCalculationEvidence(q)).not.toBeNull();
    expect(resolveChatCalculationShortfall(q)).toBeNull();
  });
});

/**
 * 지시가 왜 필요한지를 필터로 직접 보인다. 이 검사가 없으면 위 검사는
 * "문자열이 붙었다" 만 확인하고 **왜 붙여야 하는지**를 잃는다.
 */
describe('지시가 없을 때 사용자가 받는 것', () => {
  it.each([
    ['허용전류', 'CV 35sq 동도체 케이블의 허용전류는 관로 포설 기준 약 175A입니다.'],
    ['권장 굵기', '4sq의 허용전류는 약 32A로 트립 100A를 견디지 못합니다. 최소 25sq 이상을 권장합니다.'],
  ])('%s — 모델이 만든 수치는 출력 필터가 지운다', (_이름, answer) => {
    const r = filterLLMOutput(answer, [], '케이블 굵기 질문');
    expect(r.passed).toBe(false);
    expect(r.filtered).toContain('[미확인]');
  });

  it('질문에 있던 값은 지우지 않는다 — 인용은 허용이다', () => {
    const r = filterLLMOutput('말씀하신 100AF 차단기 기준으로 보겠습니다.', [], '100AF 차단기에 4sq 케이블 써도 되나요?');
    expect(r.filtered).toContain('100AF');
  });
});
