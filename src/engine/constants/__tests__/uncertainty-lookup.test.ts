import { getUncertainty, UNCERTAINTY } from '../disclaimer';
import { CALCULATOR_REGISTRY } from '@engine/calculators';

/**
 * 불확실성 정보 조회가 **실제 계산기 id 에 닿는지** 본다.
 *
 * 전에는 접미사 정규식으로 기본 id 를 뽑았다 — `voltage-drop-3phase →
 * voltage-drop`. 그런데 **그 명명 규칙이 이 저장소에 없다.** 실제 id 는
 * `three-phase-vd`·`complex-voltage-drop`·`busbar-vd`·`country-compare-vd`
 * 라 정규식이 한 번도 안 걸렸고, 전압강하 변형 4 종이 전부 null 이었다.
 * 표의 `grounding` 키도 id 가 아니라 카테고리라 접지 계산기 3 종 역시
 * 전부 null 이었다.
 *
 * 불확실성은 "이 값은 ±25% 다" 를 사용자에게 알리는 자리다. 없으면
 * 화면이 오차 없이 딱 떨어지는 수처럼 보인다 — 조용히 사라지는 쪽이라
 * 아무도 눈치채지 못한다.
 *
 * `requiresPEReview` 와 **같은 결함 계열**이다: 표의 키 공간이 레지스트리와
 * 안 맞는다. 둘 다 호출처가 0 이라 지금 사용자에게 닿지는 않는다.
 */
describe('불확실성 조회', () => {
  it('표를 실제로 읽는다', () => {
    expect(Object.keys(UNCERTAINTY).length).toBeGreaterThanOrEqual(5);
  });

  it('표에 id 로 있는 것은 그대로 나온다', () => {
    for (const id of ['voltage-drop', 'cable-sizing', 'short-circuit', 'arc-flash']) {
      expect(getUncertainty(id)).not.toBeNull();
    }
  });

  it('전압강하 변형은 카테고리로 기본 항목에 닿는다 — 죽은 정규식이 하려던 일', () => {
    for (const id of ['three-phase-vd', 'complex-voltage-drop', 'busbar-vd', 'country-compare-vd']) {
      expect(getUncertainty(id)).toBeNull();               // id 로는 없다
      expect(getUncertainty(id, 'voltage-drop')).not.toBeNull(); // 카테고리로 닿는다
    }
  });

  it('접지 계산기는 카테고리로 닿는다 — 표의 grounding 은 id 가 아니다', () => {
    for (const id of ['ground-resistance', 'ground-conductor', 'equipotential-bonding']) {
      expect(getUncertainty(id, 'grounding')).not.toBeNull();
    }
  });

  /**
   * 레지스트리를 그대로 돌려, 표에 항목이 있는 카테고리의 계산기는
   * **하나도 빠짐없이** 불확실성을 얻는지 본다. 손으로 적은 목록은
   * 계산기가 늘면 따라오지 않는다.
   */
  it('표에 카테고리 항목이 있는 계산기는 전부 불확실성을 얻는다', () => {
    const missing: string[] = [];
    for (const entry of CALCULATOR_REGISTRY.values()) {
      const covered = UNCERTAINTY[entry.id] || UNCERTAINTY[entry.category];
      if (!covered) continue; // 표가 다루지 않는 주제 — 정책 문제라 여기서 안 본다
      if (getUncertainty(entry.id, entry.category) === null) missing.push(entry.id);
    }
    expect(missing).toEqual([]);
  });

  it('표에 없는 주제는 null 이다 — 없는 오차를 지어내지 않는다', () => {
    expect(getUncertainty('token-cost', 'ai')).toBeNull();
    expect(getUncertainty('', '')).toBeNull();
  });
});
