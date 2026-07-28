import { calculateArcFlash, type ArcFlashInput } from '../arc-flash';
import { IEEE_1584_2002, PPE_THRESHOLDS } from '@/engine/constants/electrical';

/**
 * **외부 오라클** — 우리 구현을 우리가 아닌 것에 대조한다.
 *
 * 이 계산기의 최악 결함(입사 에너지 4.184 배)이 오래 살아남은 이유는 검사가
 * 전부 *상대적*이었기 때문이다 — 접지<비접지, 간격 다름, 단조성. 전 구간에
 * 같은 배수를 곱해도 하나도 안 깨졌다.
 *
 * 표준 원문은 유료라 없다. 대신 **공개 문헌이 명시한 정의와 표**를 오라클로
 * 쓴다. 아래 각 항목은 어느 출처가 무엇을 말하는지 함께 적는다 — 출처 없는
 * 기대값은 자기채점이고, 그건 이 파일이 막으려는 것이다.
 *
 * 출처
 *  [A] CED Engineering, "Arc Flash Calculation Methods" (Course E04-033)
 *      — 경계식과 **EB 단위를 명시**: `EB … (J/cm²); EB can be set at
 *        5.0 J/cm² (1.2 cal/cm²) for bare skin`
 *      — Table 2 거리 지수, Table 14 거리 지수
 *      — 예시 대역: "low voltage in box … 10 cal/cm²",
 *        "low voltage switchgear at 18 inches … 25 cal/cm²"
 *  [B] Benha University 강의자료, "IEEE 1584 Arc Flash Calculations"
 *      — Table: Open air 2.0 / LV switchgear 1.473 / HV switchgear 0.973 /
 *        LV MCCs and panels 1.641 / Cables 2.0
 *  [C] ELEK, "Arc Flash Calculation Example" — **IEEE 1584-2018** 워크드 예제
 *      400V·7.56kA·32mm·110ms·304.8mm·VCB → Ia 5.071kA · 0.846 cal/cm² · AFB 490mm
 *
 * **[C] 는 판이 다르다.** 통과/실패 기준으로 쓰지 않고 아래에서 그 사실만
 * 기록한다. 2002 판 숫자 예제는 아직 못 구했다 — 그게 이 오라클의 남은 구멍이다.
 */

const LV_SWITCHGEAR: ArcFlashInput = {
  voltage_V: 480,
  boltedFaultCurrent_kA: 20,
  arcDuration_s: 0.2,
  workingDistance_mm: 457,
  conductorGap_mm: 32,
  electrodeConfig: 'VCB',
  enclosureType: 'box',
  grounding: 'ungrounded',
  equipmentClass: 'switchgear',
};

describe('[A] 화상 문턱의 두 단위 표기가 우리 상수와 맞는다', () => {
  /**
   * 출처가 같은 문턱을 `5.0 J/cm²` 와 `1.2 cal/cm²` 로 병기한다. 이 둘이
   * 같은 값이라는 사실이 **식 (5) 의 E 가 J/cm² 라는 증거**다 — 경계식에서
   * E 와 EB 는 같은 자리이고, 그 자리의 값이 5.0 이라고 못 박혀 있다.
   *
   * 그러므로 `J_PER_CAL` 로 나눠 cal 로 바꾸는 현재 구현이 맞다.
   */
  it('5.0 J/cm² 와 1.2 cal/cm² 가 J_PER_CAL 로 이어진다', () => {
    const EB_JOULE = 5.0;
    expect(EB_JOULE / IEEE_1584_2002.ENERGY.J_PER_CAL).toBeCloseTo(PPE_THRESHOLDS.BURN_THRESHOLD, 1);
  });

  /**
   * 위 관계를 **구현으로** 확인한다. 작업거리를 아크 경계까지 밀면 에너지가
   * 화상 문턱으로 수렴해야 한다. 이건 스케일 불변이라 단위를 못 잡지만,
   * 경계 역산이 에너지식과 같은 거리 지수를 쓰는지는 잡는다.
   */
  it('경계 거리에서 에너지가 화상 문턱으로 수렴한다', () => {
    const r = calculateArcFlash(LV_SWITCHGEAR);
    const atBoundary = calculateArcFlash({ ...LV_SWITCHGEAR, workingDistance_mm: r.arcFlashBoundary_mm });
    expect(atBoundary.incidentEnergy_cal_cm2).toBeCloseTo(PPE_THRESHOLDS.BURN_THRESHOLD, 1);
  });
});

describe('[A][B] 거리 지수표가 두 출처와 일치한다', () => {
  it.each([
    ['LV 개방', 'LV', 'open_air', 2.0],
    ['LV 배전반', 'LV', 'switchgear', 1.473],
    ['LV MCC·분전반', 'LV', 'mcc_panel', 1.641],
    ['LV 케이블', 'LV', 'cable', 2.0],
    ['MV 개방', 'MV', 'open_air', 2.0],
    ['MV 배전반', 'MV', 'switchgear', 0.973],
    ['MV 케이블', 'MV', 'cable', 2.0],
  ])('%s = %s', (_label, band, cls, expected) => {
    const row = IEEE_1584_2002.EQUIPMENT_CLASS[band as 'LV' | 'MV'][cls as 'switchgear'];
    expect(row.x).toBe(expected);
  });

  /** 표가 통째로 한 값으로 뭉개지면 위 검사는 통과하고 계산은 틀린다. */
  it('전압대별로 실제로 다른 값을 쓴다', () => {
    expect(IEEE_1584_2002.EQUIPMENT_CLASS.LV.switchgear.x)
      .not.toBe(IEEE_1584_2002.EQUIPMENT_CLASS.MV.switchgear.x);
  });
});

describe('[A] 결과가 문헌이 예시로 드는 대역 안에 있다', () => {
  /**
   * 출처가 IEEE 1584 계산 예시로 드는 저압 값은 `10 cal/cm²`(low voltage in
   * box)와 `25 cal/cm²`(low voltage switchgear at 18 inches)다. 통상 조건의
   * 저압 배전반이 그 자릿수여야 한다.
   *
   * 이 검사가 잡는 것: 전 구간 배수 오류. 4.184 배가 붙으면 41.55 가 되어
   * 대역을 벗어난다(그리고 40 초과라 "작업 금지" 로 판정된다).
   */
  it('480V·20kA·0.2s·18" 배전반이 한 자릿수~수십 cal/cm² 대역이다', () => {
    const E = calculateArcFlash(LV_SWITCHGEAR).incidentEnergy_cal_cm2;
    expect(E).toBeGreaterThan(5);
    expect(E).toBeLessThan(30);
  });

  /** 지속시간을 10 배로 늘리면 대역을 넘어 작업 금지가 되어야 한다 — 방향 확인. */
  it('같은 조건에서 2초 차단이면 작업 금지 영역이다', () => {
    const r = calculateArcFlash({ ...LV_SWITCHGEAR, arcDuration_s: 2.0 });
    expect(r.incidentEnergy_cal_cm2).toBeGreaterThan(PPE_THRESHOLDS.CAT_4_MAX);
    expect(r.ppeCategory).toBe(-1);
  });
});

describe('[C] 2018 판 예제와의 차이를 기록한다 — 판정 기준이 아니다', () => {
  const ELEK_2018 = {
    input: {
      voltage_V: 400, boltedFaultCurrent_kA: 7.56, arcDuration_s: 0.110,
      workingDistance_mm: 304.8, conductorGap_mm: 32, electrodeConfig: 'VCB',
      enclosureType: 'box', grounding: 'ungrounded', equipmentClass: 'switchgear',
    } as ArcFlashInput,
    publishedIa_kA: 5.071,
    publishedE_cal: 0.846,
  };

  /**
   * 아크 전류는 두 판이 가깝다 — 여기서 크게 벌어지면 아크 전류식이 잘못된
   * 것이고, 그건 판 차이로 설명되지 않는다.
   */
  it('아크 전류가 2018 공개 예제의 ±20% 안이다', () => {
    const Ia = calculateArcFlash(ELEK_2018.input).arcingCurrent_kA;
    const ratio = Ia / ELEK_2018.publishedIa_kA;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  });

  /**
   * **에너지는 크게 벌어진다(약 4 배).** 판정 기준으로 쓰지 않는 이유:
   *  · 2018 은 함체 크기와 전극 배치를 명시적으로 반영하는 다른 모델이다
   *  · 이 예제의 작업거리 304.8mm 는 2018 의 최소 권장값이고 2002 의 기준
   *    거리 610mm 보다 짧아 `(610/D)^x` 가 2.78 배로 증폭된다
   *
   * 그래서 이 검사는 "맞다/틀리다" 가 아니라 **차이가 조용히 커지지 않는지**만
   * 본다. 2002 판 숫자 예제를 구하면 이 자리를 실제 판정으로 바꿀 것.
   */
  it('[알려진 구멍] 2002 판 숫자 예제가 없어 에너지 절대값은 미검증이다', () => {
    const E = calculateArcFlash(ELEK_2018.input).incidentEnergy_cal_cm2;
    const ratio = E / ELEK_2018.publishedE_cal;
    // 현 실측 약 4.1 배. 이 범위를 벗어나면 판 차이 설명이 무너진 것이므로
    // 그때는 이 주석이 아니라 구현을 의심할 것.
    expect(ratio).toBeGreaterThan(2);
    expect(ratio).toBeLessThan(8);
  });
});

/**
 * **검증 수준이 사용자에게 도달한다.**
 *
 * 이 계산기는 어느 판에도 없는 식이 표준 이름을 달고 나간 전력이 있다.
 * 그러니 "무엇에 대조했고 무엇에 대조하지 않았는지" 는 코드 주석이 아니라
 * 결과에 실려야 한다 — 값을 보는 사람이 주석을 읽지는 않는다.
 */
describe('검증 수준 고지', () => {
  const r = calculateArcFlash(LV_SWITCHGEAR);
  const said = (r.warnings ?? []).join(' ');

  it('경고가 실제로 있다 — 공회전 알람', () => {
    expect((r.warnings ?? []).length).toBeGreaterThan(2);
  });

  it.each([
    ['적용 판', /2002/],
    ['원문 미대조 사실', /원문의 수치 예제와 대조하지\s*않았습니다/],
    ['대조 대상', /공개 문헌/],
    ['다음 행동', /전문 소프트웨어|유자격자/],
  ])('%s 를 말한다', (_label, re) => {
    expect(said).toMatch(re);
  });

  /** 확정형으로 말하지 않는다 — 이 값 하나로 보호구를 정하라고 하면 안 된다. */
  it('보호구를 이 값 하나로 확정하라고 말하지 않는다', () => {
    expect(said).not.toMatch(/이 값으로 확정|충분합니다|보장/);
  });
});
