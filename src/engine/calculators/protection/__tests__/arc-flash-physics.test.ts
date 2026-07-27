import { calculateArcFlash, type ArcFlashInput, type ElectrodeConfig } from '../arc-flash';

/**
 * 아크플래시 결과가 **물리적으로 가능한 값인지** 본다.
 *
 * 기존 테스트 8 개는 전부 방향성만 봤다 — `> 0`, `not.toEqual`, 단조성,
 * 단계 수. 공식이 몇 배 틀려도 전부 통과한다. 그 사이로 이게 지나갔다:
 *
 *   480V · 볼트 단락 20kA → **아크 전류 23.51kA**
 *   208V · 볼트 단락  5kA → **아크 전류  5.04kA**
 *
 * 아크 전류는 볼트 단락전류를 넘을 수 없다. 볼트 단락은 임피던스 0 인
 * 극한이고, 아크가 생기면 아크 임피던스가 회로에 더해져 전류가 **줄어든다**.
 * 저압에서는 아크 전압강하가 커서 보통 Ia/Ibf 가 0.3~0.6 이다.
 *
 * 원인은 저압 분기의 `K3·(V/1000)` 항이다. 480V 에서 log 에 +0.139 를
 * 더해 전류를 1.38 배로 올린다. 그 결과 일상적인 480V 반이 75.88 cal/cm²
 * → **PPE −1 "작업 금지"** 로 나온다. 늑대 소년이 되면 아무도 안 본다.
 *
 * 값의 정확도는 여기서 못 잠근다 — IEEE 1584 는 유료 표준이라 이 리포에
 * known-answer 대조표가 없다. 잠글 수 있는 것은 **표준 없이도 참인 물리
 * 제약**이다. 그것도 안 걸려 있었다.
 */

const CONFIGS: ElectrodeConfig[] = ['VCB', 'VCBB', 'HCB', 'VOA', 'HOA'];

function input(over: Partial<ArcFlashInput> = {}): ArcFlashInput {
  return {
    voltage_V: 480,
    boltedFaultCurrent_kA: 20,
    arcDuration_s: 0.2,
    workingDistance_mm: 457,
    electrodeConfig: 'VCB',
    enclosureType: 'box',
    ...over,
  };
}

describe('아크플래시 — 물리 제약', () => {
  // 전압·전류·전극 구성을 훑는다. 한 점만 보면 그 점만 맞춰도 통과한다.
  const grid: ArcFlashInput[] = [];
  for (const voltage_V of [208, 240, 380, 480, 600, 1000, 4160, 13800]) {
    for (const boltedFaultCurrent_kA of [0.5, 2, 5, 10, 20, 50, 100]) {
      for (const electrodeConfig of CONFIGS) {
        grid.push(input({ voltage_V, boltedFaultCurrent_kA, electrodeConfig,
          enclosureType: electrodeConfig.endsWith('OA') ? 'open' : 'box' }));
      }
    }
  }

  it('격자를 실제로 돈다 — 0 건을 돌고 통과하면 검사가 아니다', () => {
    expect(grid.length).toBeGreaterThan(200);
  });

  /**
   * 이 단언은 **위반이 0 이 되기를 요구하지 않는다.** 계수 재보정에는
   * IEEE 1584 원문이 필요하고 없는 값을 지어내지 않기로 했다. 지금
   * 강제할 수 있는 것은 둘이다 — 위반하면 **밝힐 것**, 그리고 위반 범위가
   * **늘지 않을 것**.
   *
   * 원문을 확보해 저압 계수를 고치면 이 수가 줄고 baseline 을 내려야 한다.
   * 0 이 되면 위 두 단언을 "Ia < Ibf 항상 성립" 하나로 바꿔라.
   */
  const VIOLATION_BASELINE = 189; // 280 격자점 중 (2026-07-28 실측)

  const violating = grid
    .map((c) => ({ c, r: calculateArcFlash(c) }))
    .filter(({ c, r }) => r.arcingCurrent_kA > c.boltedFaultCurrent_kA);

  it('물리 제약 위반 범위가 늘지 않는다', () => {
    expect(violating.length).toBeLessThanOrEqual(VIOLATION_BASELINE);
  });

  it('위반한 계산은 결과에 그 사실을 밝히고 신뢰 불가를 알린다', () => {
    const silent = violating
      .filter(({ r }) => !(r.warnings ?? []).some((w) => /물리적으로 불가능|신뢰할 수 없/.test(w)))
      .map(({ c }) => `${c.voltage_V}V ${c.boltedFaultCurrent_kA}kA ${c.electrodeConfig}`);
    expect(silent).toEqual([]);
  });

  it('위반하지 않은 계산에는 그 경고가 붙지 않는다 — 과잉 경고도 신호를 죽인다', () => {
    const overWarned = grid
      .map((c) => ({ c, r: calculateArcFlash(c) }))
      .filter(({ c, r }) => r.arcingCurrent_kA <= c.boltedFaultCurrent_kA)
      .filter(({ r }) => (r.warnings ?? []).some((w) => /물리적으로 불가능/.test(w)))
      .map(({ c }) => `${c.voltage_V}V ${c.boltedFaultCurrent_kA}kA`);
    expect(overWarned).toEqual([]);
  });

  it('아크 전류는 양수다', () => {
    for (const c of grid) expect(calculateArcFlash(c).arcingCurrent_kA).toBeGreaterThan(0);
  });

  it('입사 에너지는 작업 거리가 멀수록 줄어든다', () => {
    const near = calculateArcFlash(input({ workingDistance_mm: 457 }));
    const far = calculateArcFlash(input({ workingDistance_mm: 914 }));
    expect(far.incidentEnergy_cal_cm2).toBeLessThan(near.incidentEnergy_cal_cm2);
  });

  it('입사 에너지는 아크 지속시간에 비례해 늘어난다', () => {
    const short = calculateArcFlash(input({ arcDuration_s: 0.1 }));
    const long = calculateArcFlash(input({ arcDuration_s: 0.4 }));
    // 시간 항은 선형이다 — 4 배 시간이면 4 배 에너지.
    expect(long.incidentEnergy_cal_cm2 / short.incidentEnergy_cal_cm2).toBeCloseTo(4, 1);
  });

  it('아크플래시 경계는 작업 거리보다 멀다 — 경계 안에서 계산했으니', () => {
    const r = calculateArcFlash(input());
    if (r.incidentEnergy_cal_cm2 > 1.2) {
      expect(r.arcFlashBoundary_mm).toBeGreaterThan(input().workingDistance_mm);
    }
  });
});
