import { checkSelectivity, MCCB_TCC } from '../tcc-data';

/**
 * 보호 협조 판정이 **밴드의 올바른 쪽**을 쓰는지 본다.
 *
 * 시간-전류 협조의 표준 관행(IEEE 242 계열)은 이렇다:
 *   상위 장치의 **최소** 동작시간 − 하위 장치의 **최대** 동작시간 ≥ CTI
 * 제조 공차 밴드의 최악 조합을 덮어야 하기 때문이다. 상위가 가장 빨리
 * 떨어지고 하위가 가장 늦게 떨어지는 순간이 협조가 깨지는 순간이다.
 *
 * 그런데 `interpolateTime` 이 상위·하위를 구분하지 않고 **둘 다
 * `timeMax_s`** 로 보간했고, 곡선 범위 밖에서만 `timeMin_s` 를 냈다.
 * 상위에 최대값을 쓰면 "상위는 느리다" 고 가정하는 셈이라 마진이 부풀고,
 * **협조가 안 되는 조합을 확보로 보고**한다.
 *
 * 실측 2026-07-28 (상위 200AT MCCB · 하위 100AT MCCB · 고장 1200A):
 *   수리 전: 상위 1.119s(최대측) − 하위 0.01s(범위 밖 최소측) = 1.109s → 확보
 *   올바름 : 상위 최소 ≈0.19s − 하위 최대 0.04s = 약 0.15s < 0.3s → 미확보
 *
 * 방향이 **통과시키는 쪽**이라 위험하다. 감리 제출물에 "협조 확보" 가
 * 찍히면 하위 사고에 상위까지 떨어지는 설계가 그대로 나간다.
 */

const up = MCCB_TCC.find((d) => d.ratingA === 200)!;
const down = MCCB_TCC.find((d) => d.ratingA === 100)!;

describe('보호 협조 — 밴드 방향', () => {
  it('대상 곡선을 실제로 찾았다', () => {
    expect(up).toBeDefined();
    expect(down).toBeDefined();
    expect(up.curve.length).toBeGreaterThan(3);
  });

  it('상위 동작시간은 밴드의 최소측을 쓴다 — 최대측을 쓰면 마진이 부푼다', () => {
    // 1200A → 상위 배수 6.0. 최대측 보간은 약 1.1s, 최소측은 약 0.2s 다.
    const r = checkSelectivity(up, down, 1200);
    expect(r.upstreamTime_s).toBeLessThan(0.6);
  });

  it('하위 동작시간은 밴드의 최대측을 쓴다 — 곡선 범위 밖에서도', () => {
    // 1200A → 하위 배수 12.0 으로 곡선 마지막 점(10)을 넘는다.
    // 그 점의 timeMax 는 0.04s, timeMin 은 0.01s 다. 최악은 0.04s 다.
    const r = checkSelectivity(up, down, 1200);
    expect(r.downstreamTime_s).toBeGreaterThanOrEqual(0.04);
  });

  it('1200A 에서 협조가 확보되지 않는다고 판정한다 — 통과시키던 자리', () => {
    const r = checkSelectivity(up, down, 1200);
    expect(r.selective).toBe(false);
    expect(r.note).toContain('미확보');
  });

  it('마진이 충분한 저전류 구간은 여전히 확보로 본다 — 과잉 차단도 결함이다', () => {
    // 300A: 상위 배수 1.5(최소 20s) · 하위 배수 3.0(최대 8s) → 12s 마진.
    const r = checkSelectivity(up, down, 300);
    expect(r.selective).toBe(true);
  });

  it('순시 영역에서는 협조가 성립하지 않는다', () => {
    // 3000A 는 둘 다 순시 영역이라 시간 차가 없다.
    const r = checkSelectivity(up, down, 3000);
    expect(r.selective).toBe(false);
  });

  it('상위 시간이 하위보다 항상 크거나 같다 — 부호가 뒤집히면 판정이 무의미하다', () => {
    for (const I of [150, 300, 600, 1200, 2400]) {
      const r = checkSelectivity(up, down, I);
      expect(r.margin_s).toBeCloseTo(r.upstreamTime_s - r.downstreamTime_s, 3);
    }
  });
});
