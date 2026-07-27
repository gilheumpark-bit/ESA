import { calculateArcFlash, type ArcFlashInput } from '../arc-flash';

/**
 * 아크플래시 결과가 **자기 한계를 스스로 밝히는지** 본다.
 *
 * 이 계산기는 IEEE 1584-2018 의 전체 모델이 아니다. 소스가 그렇게 적고
 * 있다 — "전체 모델은 600+ 계수이지만, 여기서는 핵심 경험식만 사용".
 * 실제로 저압 아크전류는 `log(Ia) = K1 + K2·log(Ibf) + K3·(V/1000)` 한
 * 줄이고, 거리 지수 1.641 은 2018 판이 아니라 **2002 판의 MCC·패널보드
 * 행 값과 일치**한다. 2018 판은 전극 구성별 계수 10 개와 함체 크기 보정,
 * 전압 구간 보간을 쓴다.
 *
 * 그런데 결과는 `standardRef: 'IEEE 1584-2018, NFPA 70E'` 를 달고,
 * 경고는 "IEEE 1584-2018 은 경험식으로 정확도 ±25%" 라고 말했다. 그
 * ±25% 는 **표준 자체의 모델 불확실성**이지 이 구현이 표준을 축약해서
 * 생기는 편차가 아니다. 둘을 섞으면 사용자는 "표준 그대로, 정상 오차
 * 범위 안" 으로 읽는다.
 *
 * 입사 에너지는 PPE 등급을 정한다 — 인명 안전 결정이다. 다른 계산기의
 * 잘못된 조항 인용과 같은 결함이지만 대가가 다르다.
 *
 * 값이 맞는지는 여기서 못 본다(IEEE 1584 는 유료 표준이라 known-answer
 * 대조표가 없다). 볼 수 있는 것은 **결과가 무엇인 척하는가**다.
 */

const base: ArcFlashInput = {
  voltage_V: 480,
  boltedFaultCurrent_kA: 20,
  arcDuration_s: 0.2,
  workingDistance_mm: 457,
  electrodeConfig: 'VCB',
  enclosureType: 'box',
};

describe('아크플래시 — 자기 한계 고지', () => {
  const r = calculateArcFlash(base);
  const disclosure = [r.formula, r.standardRef ?? '', ...(r.warnings ?? [])].join(' | ');

  it('전체 모델이 아니라 축약 구현임을 밝힌다', () => {
    expect(disclosure).toMatch(/간략|축약|일부 계수|simplified/);
  });

  it('축약으로 인한 편차가 정량화되지 않았음을 밝힌다', () => {
    // "±25%" 만 적고 끝내면 그 수가 축약까지 덮는 것처럼 읽힌다.
    expect(disclosure).toMatch(/정량화|미측정|편차는 별개|포함하지 않/);
  });

  it('전문 소프트웨어 검증 필요를 밝힌다', () => {
    expect(disclosure).toMatch(/ETAP|SKM|EasyPower|전문 소프트웨어/);
  });

  it('표준 준수를 단정하지 않는다', () => {
    // `IEEE 1584-2018` 만 달랑 적으면 그 표준을 구현했다는 주장이 된다.
    const ref = r.standardRef ?? '';
    if (/IEEE\s*1584/.test(ref)) {
      expect(ref).toMatch(/기반|참고|축약|간략|based/);
    }
  });

  // 위 단언들이 공허하지 않은지 — 결과가 실제로 필드를 채우는지 본다.
  it('결과가 근거 필드를 실제로 채운다', () => {
    expect(r.warnings?.length ?? 0).toBeGreaterThan(0);
    expect(r.formula.length).toBeGreaterThan(0);
    expect(r.incidentEnergy_cal_cm2).toBeGreaterThan(0);
  });
});
