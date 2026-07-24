/**
 * Motor FLC 표 내부 정합성 + 미검증 구간 가드 (H9).
 *
 * 이 표는 NEC 430.250 사실값이지만 원문 오라클을 리포가 보유하지 않는다. 그래서
 * 값을 "정답"으로 박는 대신 **내부 정합성**으로 반증한다: 3상 FLC의 A/HP 비는
 * 전동기가 커질수록 완만히 감소해야 한다(효율·역률 상승). ≤200HP 구간이 이
 * 불변식을 지키는지 잠그고, ≥250HP가 그 불변식을 깨는(=미검증) 사실을 명시한다.
 */
import {
  MOTOR_FLC_3PH,
  getMotorFLC3PH,
  isMotorFLC3PHUnverified,
  UNVERIFIED_FLC_MIN_HP,
} from '../motor-flc-tables';

describe('Motor FLC 3상 표 — 내부 정합성 (H9)', () => {
  const ratio = (hp: number) => {
    const flc = getMotorFLC3PH(hp, 460);
    if (flc == null) throw new Error(`no FLC for ${hp}HP`);
    return flc / hp;
  };

  it('중대형 구간(15~200HP)의 A/HP 비는 완만하다 — FLC가 매끄럽게 스케일한다', () => {
    // 소형(≤10HP)은 제외한다: 소형 전동기는 효율·역률이 급격히 개선되므로 A/HP가
    // 물리적으로 크게 변한다(0.5HP 2.20 → 10HP 1.40, NEC 실측 특성 — 데이터 오류
    // 아님). 효율·역률이 포화되는 15HP 이상에서 완만성이 성립해야 정상이다.
    const midLarge = MOTOR_FLC_3PH
      .filter((e) => e.hp >= 15 && e.hp < UNVERIFIED_FLC_MIN_HP)
      .map((e) => e.hp);
    for (let i = 1; i < midLarge.length; i++) {
      const prev = ratio(midLarge[i - 1]);
      const curr = ratio(midLarge[i]);
      // 이 구간의 실측 스텝은 -3.8%~+0.7% — ±5%를 넘는 계단이 없어야 검증 구간이다.
      expect(curr).toBeLessThanOrEqual(prev * 1.05);
      expect(curr).toBeGreaterThanOrEqual(prev * 0.95);
    }
  });

  it('250HP 경계에서 A/HP가 12% 계단 하락한다 — 이것이 미검증 판정의 근거', () => {
    const at200 = ratio(200);
    const at250 = ratio(250);
    // 불연속을 회귀로 잠근다: 이 계단이 사라지면(=값이 정정되면) 이 테스트를
    // 갱신하고 미검증 표기를 해제하라(현재는 원문 미확보라 값 미변경).
    expect(at250).toBeLessThan(at200 * 0.92);
  });

  it('미검증 가드가 ≥250HP를 표시하고 그 미만은 통과시킨다', () => {
    expect(isMotorFLC3PHUnverified(200)).toBe(false);
    expect(isMotorFLC3PHUnverified(250)).toBe(true);
    expect(isMotorFLC3PHUnverified(500)).toBe(true);
  });

  it('lookup 자체는 회귀 없이 값을 반환한다(가드는 별개 신호)', () => {
    expect(getMotorFLC3PH(100, 460)).toBe(124.0);   // 검증 구간 known value
    expect(getMotorFLC3PH(250, 460)).toBe(263.0);   // 미검증이지만 값은 그대로 조회됨
    expect(getMotorFLC3PH(1, 999)).not.toBeNull();  // 미지원 전압도 최근접으로 반환(널 아님)
  });
});
