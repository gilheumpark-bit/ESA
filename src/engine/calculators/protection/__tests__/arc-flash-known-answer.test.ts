import { calculateArcFlash, type ArcFlashInput } from '../arc-flash';
import { IEEE_1584_2002 } from '@/engine/constants/electrical';

/**
 * IEEE 1584-2002 식이 **실제로 그 식인지** 본다.
 *
 * 검증 수준을 과장하지 않는다. 2002 판 공개 예제를 찾지 못해
 * known-answer 대조표는 없다. 대신 셋으로 잠근다:
 *
 *  ① **손계산 대조** — 식을 이 파일에 독립으로 다시 써서 구현과 맞춘다.
 *     구현이 상수를 옮겨 쓰다 틀리면 여기서 갈린다. 계수는 공개 문헌
 *     2 곳(ecmag · arcadvisor)에서 계수 단위로 일치 확인한 값이다.
 *  ② **물리 제약** — Ia < Ibf. 표준 없이도 참인 것.
 *  ③ **판 간 근접** — 2018 판 공개 예제(ELEK, 400V·7.56kA·32mm·VCB)의
 *     아크 전류 5.071kA 와 같은 입력을 넣어 본다. 판이 다르므로 같을
 *     수 없고, **±20% 안**이면 같은 모델 계열로 본다. 앞선 날조식은
 *     같은 입력에 8.59kA(+69%, 게다가 볼트 단락 7.56kA 초과)를 냈다.
 *
 * ①이 자기 대조 아닌가? 아니다 — 대조본은 **공개 문헌의 식**이고
 * 제시본은 **구현**이다. 둘 사이에 상수 파일과 분기 로직이 있고, 거기서
 * 나는 실수(교차항 누락·계수 자리 바뀜·단위 kV/V 혼동)가 정확히 앞선
 * 판에서 났던 실수다. 다만 문헌 자체가 틀렸다면 ①은 못 잡는다 — 그래서
 * ②③ 을 같이 둔다.
 */

const base: ArcFlashInput = {
  voltage_V: 480,
  boltedFaultCurrent_kA: 20,
  arcDuration_s: 0.2,
  workingDistance_mm: 457,
  electrodeConfig: 'VCB',
  enclosureType: 'box',
  conductorGap_mm: 32,
  grounding: 'ungrounded',
};

/** 공개 문헌의 식을 상수 없이 그대로 옮긴 것 — 구현과 독립. */
function handArcCurrent(V_V: number, Ibf: number, G: number, box: boolean): number {
  const lgIbf = Math.log10(Ibf);
  // 경계 1kV 는 중고압 식으로 — 구현과 같은 규칙(저압 식이 V→1kV 에서 발산).
  if (V_V >= 1000) return Math.pow(10, 0.00402 + 0.983 * lgIbf);
  const V = V_V / 1000;
  const K = box ? -0.097 : -0.153;
  return Math.pow(10,
    K + 0.662 * lgIbf + 0.0966 * V + 0.000526 * G + 0.5588 * V * lgIbf - 0.00304 * G * lgIbf);
}

describe('IEEE 1584-2002 — 식 대조', () => {
  it('① 상수가 공개 문헌 값 그대로다', () => {
    expect(IEEE_1584_2002.ARC_LV).toMatchObject({
      K_OPEN: -0.153, K_BOX: -0.097, LG_IBF: 0.662,
      V: 0.0966, G: 0.000526, V_LG_IBF: 0.5588, G_LG_IBF: -0.00304,
    });
    expect(IEEE_1584_2002.ARC_HV).toMatchObject({ CONST: 0.00402, LG_IBF: 0.983 });
    expect(IEEE_1584_2002.ENERGY_NORMALIZED).toMatchObject({
      K1_OPEN: -0.792, K1_BOX: -0.555, K2_UNGROUNDED: 0, K2_GROUNDED: -0.113,
      LG_IA: 1.081, G: 0.0011,
    });
    expect(IEEE_1584_2002.ENERGY).toMatchObject({ J_PER_CAL: 4.184, CF_LV: 1.5, CF_HV: 1.0 });
  });

  it('① 구현 아크 전류가 손계산과 일치한다 (격자)', () => {
    const rows: string[] = [];
    for (const voltage_V of [208, 240, 380, 400, 480, 600, 1000, 4160, 13800]) {
      // 표준 시험 범위: Ibf 0.7~106kA · 간격 13~152mm. 범위 밖은 계산기가
      // 거부하므로 격자에도 넣지 않는다(거부는 아래 별도 검사).
      for (const boltedFaultCurrent_kA of [0.7, 2, 5, 7.56, 20, 50, 100]) {
        for (const conductorGap_mm of [13, 25, 32, 152]) {
          for (const enclosureType of ['box', 'open'] as const) {
            const r = calculateArcFlash({
              ...base, voltage_V, boltedFaultCurrent_kA, conductorGap_mm, enclosureType,
              electrodeConfig: enclosureType === 'box' ? 'VCB' : 'VOA',
            });
            const want = handArcCurrent(voltage_V, boltedFaultCurrent_kA, conductorGap_mm, enclosureType === 'box');
            if (Math.abs(r.arcingCurrent_kA - Math.round(want * 100) / 100) > 0.02) {
              rows.push(`${voltage_V}V ${boltedFaultCurrent_kA}kA ${conductorGap_mm}mm ${enclosureType}: ${r.arcingCurrent_kA} vs ${want.toFixed(3)}`);
            }
          }
        }
      }
    }
    expect(rows).toEqual([]);
  });

  it('격자가 비어 있지 않다 — 위 검사가 공회전이 아님', () => {
    // 손계산 자체가 값을 내는지. 0 을 0 과 비교하면 언제나 통과한다.
    expect(handArcCurrent(480, 20, 32, true)).toBeGreaterThan(1);
    expect(handArcCurrent(13800, 20, 153, true)).toBeGreaterThan(1);
  });

  /**
   * ③ 2018 판 공개 예제: 400V · Ibf 7.56kA · 간격 32mm · VCB · 함체
   *    → 아크 전류 5.071kA (ELEK, elek.com 단계별 예제).
   */
  it('③ 2018 공개 예제와 같은 계열 안에 있다 (±20%)', () => {
    const r = calculateArcFlash({
      ...base, voltage_V: 400, boltedFaultCurrent_kA: 7.56, conductorGap_mm: 32,
    });
    const ieee2018 = 5.071;
    const deviation = Math.abs(r.arcingCurrent_kA - ieee2018) / ieee2018;
    expect(deviation).toBeLessThan(0.20);
    // 판이 다르므로 같을 수는 없다 — 같으면 오히려 뭔가 잘못됐다.
    expect(r.arcingCurrent_kA).not.toBeCloseTo(ieee2018, 2);
  });

  it('③ 날조식이 내던 값(8.59kA)으로는 돌아가지 않는다', () => {
    const r = calculateArcFlash({
      ...base, voltage_V: 400, boltedFaultCurrent_kA: 7.56, conductorGap_mm: 32,
    });
    expect(r.arcingCurrent_kA).toBeLessThan(7.56); // 볼트 단락 초과 금지
    expect(r.arcingCurrent_kA).toBeLessThan(6);
  });

  /**
   * ② 물리 제약 — 격자 전체에서 Ia < Ibf. 저압 아크는 아크 전압강하가
   *    커서 통상 Ia/Ibf 가 0.3~0.7 이다.
   */
  it('② 저압 본구간에서 Ia < Ibf 다', () => {
    const bad: string[] = [];
    for (const voltage_V of [208, 240, 380, 480, 600]) {
      for (const boltedFaultCurrent_kA of [2, 5, 20, 50, 100]) {
        const r = calculateArcFlash({ ...base, voltage_V, boltedFaultCurrent_kA });
        const ratio = r.arcingCurrent_kA / boltedFaultCurrent_kA;
        if (ratio >= 1 || ratio < 0.2) bad.push(`${voltage_V}V ${boltedFaultCurrent_kA}kA → ${ratio.toFixed(3)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * 본구간 밖에서는 2002 모델 자체가 Ia ≥ Ibf 를 낸다 — 중고압 식이
   * Ibf ≲ 1.7kA 에서 그렇다(10^0.00402·Ibf^0.983 > Ibf). 이건 우리 구현의
   * 버그가 아니라 경험식의 저단 거동이고, **고치지 않는다**(없는 값을
   * 지어내는 것보다 낫다). 대신 그때 PPE 를 내주지 않는 것이 안전 동작이고
   * 그게 여기서 잠긴다.
   */
  it('모델이 물리를 벗어나는 구석에서는 PPE 를 신뢰하지 말라고 말한다', () => {
    const r = calculateArcFlash({ ...base, voltage_V: 4160, boltedFaultCurrent_kA: 0.7 });
    expect(r.arcingCurrent_kA).toBeGreaterThan(0.7);
    expect((r.warnings ?? []).join(' ')).toMatch(/물리적으로 불가능|신뢰할 수 없/);
  });

  it('표준 시험 범위 밖 입력은 계산하지 않는다', () => {
    expect(() => calculateArcFlash({ ...base, boltedFaultCurrent_kA: 0.5 })).toThrow('ESVA-4402');
    expect(() => calculateArcFlash({ ...base, conductorGap_mm: 12 })).toThrow('ESVA-4404');
    expect(() => calculateArcFlash({ ...base, conductorGap_mm: 153 })).toThrow('ESVA-4404');
  });

  /** 접지계통은 에너지가 더 낮다(K2 = −0.113). 방향이 뒤집히면 보수성이 깨진다. */
  it('접지계통이 비접지보다 에너지가 낮다', () => {
    const un = calculateArcFlash({ ...base, grounding: 'ungrounded' }).incidentEnergy_cal_cm2;
    const gr = calculateArcFlash({ ...base, grounding: 'grounded' }).incidentEnergy_cal_cm2;
    expect(gr).toBeLessThan(un);
  });

  /** 간격이 넓으면 에너지가 커진다(+0.0011·G). 항이 빠지면 같아진다. */
  it('전극 간격이 에너지에 실제로 들어간다', () => {
    const narrow = calculateArcFlash({ ...base, conductorGap_mm: 13 }).incidentEnergy_cal_cm2;
    const wide = calculateArcFlash({ ...base, conductorGap_mm: 152 }).incidentEnergy_cal_cm2;
    expect(narrow).not.toBeCloseTo(wide, 2);
  });
});

/**
 * **에너지 절대값 — 위 검사들이 전부 놓친 축.**
 *
 * 위 describe 의 에너지 검사는 전부 *상대적*이다(접지<비접지, 간격 다름).
 * 그래서 **전 구간에 같은 배수를 곱해도 하나도 안 깨진다.** 실제로 그랬다:
 * 식 (5) 의 결과는 J/cm² 인데 코드가 `cal/cm²` 라벨을 달고 cal 기준 PPE
 * 표와 대조해 **전 구간 4.184 배**로 나갔고, 1085 개 green 이 무검출이었다
 * (2026-07-28 독립 심사 도메인 좌석 지적).
 *
 * 그러니 여기 필요한 것은 하나 더 많은 상대 검사가 아니라 **눈금을 박는
 * 절대 앵커**다. 두 개를 박는다 — 하나는 값, 하나는 단위의 정의 자체.
 */
describe('입사 에너지 — 절대 눈금', () => {
  /**
   * 480V·20kA·0.2s·457mm(18") 은 아크플래시 교과서의 표준 예제다. 업계
   * 통상값 ~10 cal/cm²(Category 3). 4.184 를 곱한 J 값(41.55)은 40 을
   * 넘겨 **"작업 금지"** 가 되므로, 이 검사는 단위가 어긋나는 순간 깨진다.
   */
  it('교과서 표준 예제 480V·20kA·0.2s 가 ~10 cal/cm² · Category 3 이다', () => {
    const r = calculateArcFlash(base);
    expect(r.incidentEnergy_cal_cm2).toBeGreaterThan(8);
    expect(r.incidentEnergy_cal_cm2).toBeLessThan(12);
    expect(r.ppeCategory).toBe(3);
  });

  /**
   * **이 검사는 단위를 못 잡는다 — 그렇게 쓰려다 실측으로 걸렀다.**
   *
   * 처음엔 "경계 거리에서 에너지가 1.2 로 수렴하는지 보면 cal 인지 J 인지
   * 안다" 고 적었다. 아니다. 경계는 같은 E 로부터 `D·(E/1.2)^(1/x)` 로
   * 역산되므로 E 에 어떤 배수가 곱해져도 되돌아오면 1.2 다 — **눈금과
   * 자를 같은 오차로 늘린 격**이라 스케일 불변이다(변이 실측: 환산을
   * 제거해도 이 검사만 초록). §2.3 닫힌 순환 그대로다.
   *
   * 그래서 이름과 목적을 바꾼다. 이 검사가 실제로 지키는 것은 **역산의
   * 대수적 정합**이다 — 거리 지수 `x` 를 에너지식과 경계식 중 한 곳에서만
   * 바꾸면 여기서 깨진다. 단위를 잡는 것은 위의 절대 대역 검사뿐이다.
   */
  it('아크 경계 역산이 에너지식과 같은 거리 지수를 쓴다', () => {
    const r = calculateArcFlash(base);
    const atBoundary = calculateArcFlash({
      ...base,
      workingDistance_mm: r.arcFlashBoundary_mm,
    });
    expect(atBoundary.incidentEnergy_cal_cm2).toBeCloseTo(1.2, 1);
  });

  /** 위 두 검사가 실제로 값을 읽는지 — 필드명이 바뀌어 undefined 가 되면 알람. */
  it('읽는 필드가 살아 있다 — 공회전 알람', () => {
    const r = calculateArcFlash(base);
    expect(typeof r.incidentEnergy_cal_cm2).toBe('number');
    expect(typeof r.arcFlashBoundary_mm).toBe('number');
    expect(r.arcFlashBoundary_mm).toBeGreaterThan(base.workingDistance_mm);
  });
});
