import { calculateCableSizing } from '../cable-sizing';

/**
 * 계산 단계 제목이 **한 언어로 통일돼 있는가.**
 *
 * 실측 2026-07-28: `cable-sizing` 의 단계 제목이 영어 3 + 국문 1 로 섞여
 * 있었다. 국문 1 은 같은 날 KEC 커밋에서 내가 넣은 것이라 **내가 만든
 * 불일치**다. 섞인 상태가 전부 영어인 것보다 나쁘다 — 읽는 사람이
 * 번역이 덜 된 화면으로 읽는다.
 *
 * 언어 선택(헤더의 KO/EN)이 이걸 바꾸지 않는다는 점도 함께 확인한다.
 * 그 선택은 **AI 답변과 영수증 면책문**을 바꾸고(실측으로 확인), 단계
 * 제목은 각 계산기에 하드코딩돼 있다. 지금은 그게 설계이고, 그렇다면
 * 최소한 **한 언어로는 통일**돼야 한다.
 */

// 계산기 입력에 language 가 없다 — 단계 제목은 언어 선택의 영향을 받지
// 않는다는 뜻이고, 그래서 이 검사가 필요하다.
const run = () => calculateCableSizing({
  current: 100, length: 50, voltage: 380,
  conductor: 'Cu', insulation: 'XLPE', installation: 'C', phase: 3,
});

describe('계산 단계 제목 — 언어 통일', () => {
  const titles = run().steps.map((s) => s.title);

  it('단계가 실제로 있다 — 이 검사가 공회전이 아님', () => {
    expect(titles.length).toBeGreaterThanOrEqual(4);
  });

  it('모든 단계 제목이 한국어다 — 섞이지 않는다', () => {
    const notKorean = titles.filter((t) => !/[가-힣]/.test(t));
    expect(notKorean).toEqual([]);
  });

  /**
   * 영문 기술용어(mm²·AF/AT·KEC 같은)는 섞여도 된다 — 막으려는 것은
   * **문장이 통째로 영어인 제목**이다.
   */
  it('영문 전용 제목이 없다', () => {
    const englishOnly = titles.filter((t) => /^[A-Za-z0-9 ()\-.,%/]+$/.test(t));
    expect(englishOnly).toEqual([]);
  });

  it('단계마다 제목이 비어 있지 않다', () => {
    for (const t of titles) expect(t.trim().length).toBeGreaterThan(1);
  });
});
