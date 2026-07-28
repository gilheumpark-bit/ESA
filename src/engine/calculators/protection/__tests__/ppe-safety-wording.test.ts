import { calculateArcFlash, type ArcFlashInput } from '../arc-flash';

/**
 * PPE 안내 문구가 **사람이 입을 옷**을 말한다. 계산 결과 중 유일하게
 * 사용자가 그대로 따라 하는 부분이라 따로 잠근다.
 *
 * 2026-07-28 적출 둘:
 *
 *  ① 1.2 cal/cm² 이하 구간 안내가 `'일반 작업복 (면 또는 합성섬유)'` 였다.
 *     **합성섬유는 금지다** — NFPA 70E 130.7(C)(9) 는 315°C 미만에서 녹는
 *     섬유(아세테이트·아크릴·나일론·폴리에스터·폴리에틸렌·폴리프로필렌·
 *     스판덱스)를 단독·혼방 모두 금한다. 녹아서 피부에 들러붙어 화상을
 *     키운다. 계산기가 **정확히 금지된 옷을 권하고 있었다.**
 *  ② 그 구간을 "Category 0" 이라 불렀는데 **Category 0 은 2015 판에서
 *     삭제됐다.** 표는 1 부터 시작한다. 1.2 는 등급 경계가 아니라 2도 화상
 *     경계다(Stoll curve).
 *
 * 등급이 **낮게** 나올 때가 오히려 위험하다 — "이 정도면 평상복" 으로
 * 읽힌다. 그래서 아래 검사는 저에너지 경로를 먼저 본다.
 */

function input(over: Partial<ArcFlashInput> = {}): ArcFlashInput {
  return {
    voltage_V: 480,
    boltedFaultCurrent_kA: 20,
    arcDuration_s: 0.2,
    workingDistance_mm: 457,
    electrodeConfig: 'VCB',
    enclosureType: 'box',
    conductorGap_mm: 32,
    grounding: 'ungrounded',
    ...over,
  };
}

/** 화상 경계 아래로 떨어지는 입력 — 지속시간을 아주 짧게. */
const lowEnergy = calculateArcFlash(input({ boltedFaultCurrent_kA: 0.7, arcDuration_s: 0.01 }));
// 등급이 실제로 나오는 중간대. 480V·5kA·100ms → 5.96 cal/cm² · Cat 2 (실측).
// 20kA·200ms 로 잡았다가 40 cal/cm² 를 넘겨 -1(작업 금지)이 나왔다 —
// 480V 반의 실제 입사 에너지가 그만큼 크다.
const highEnergy = calculateArcFlash(input({ boltedFaultCurrent_kA: 5, arcDuration_s: 0.1 }));

describe('PPE 안내 — 안전 문구', () => {
  it('저에너지 경로가 실제로 화상 경계 아래다 — 이 검사가 헛돌지 않는지', () => {
    expect(lowEnergy.incidentEnergy_cal_cm2).toBeLessThanOrEqual(1.2);
    expect(highEnergy.incidentEnergy_cal_cm2).toBeGreaterThan(1.2);
  });

  it('① 어느 경로에서도 합성섬유를 권하지 않는다', () => {
    for (const r of [lowEnergy, highEnergy]) {
      const said = [r.ppeDescription, ...(r.warnings ?? [])].join(' ');
      // "합성섬유" 가 나오되 **금지** 맥락이어야 한다. 권유 맥락이면 잡는다.
      expect(said).not.toMatch(/면 또는 합성섬유|합성섬유 (착용 )?가능|합성섬유 허용/);
    }
  });

  /**
   * 두 표면을 **따로** 본다. 합쳐서 보면 한쪽을 지워도 다른 쪽이 대신
   * 만족시킨다 — 변이 실측에서 이름 제거·경고 줄 삭제가 둘 다 초록이었다
   * (2026-07-28). 서로가 서로의 알리바이가 되면 검사가 아니다.
   */
  it('① 경고가 등급과 무관하게 녹는 섬유 금지를 이름까지 말한다', () => {
    for (const r of [lowEnergy, highEnergy]) {
      const warned = (r.warnings ?? []).join(' ');
      expect(warned).toMatch(/합성섬유/);
      expect(warned).toMatch(/금지/);
      // 이름이 없으면 "합성섬유" 가 무엇인지 몰라 지켜지지 않는다.
      expect(warned).toMatch(/나일론/);
      expect(warned).toMatch(/폴리에스터/);
      expect(warned).toMatch(/스판덱스/);
    }
  });

  it('① 저에너지 안내문 자체도 금지를 적는다 — 경고를 안 읽는 사람이 보는 줄', () => {
    expect(lowEnergy.ppeDescription).toMatch(/합성섬유/);
    expect(lowEnergy.ppeDescription).toMatch(/금지/);
    expect(lowEnergy.ppeDescription).toMatch(/나일론/);
  });

  it('② 없어진 Category 0 을 등급으로 부르지 않는다', () => {
    expect(lowEnergy.ppeDescription).not.toMatch(/Category\s*0|등급\s*0|카테고리\s*0/);
    expect(lowEnergy.ppeDescription).toMatch(/등급 없음|2015/);
    const step = lowEnergy.steps.find((s) => /PPE/.test(s.title));
    expect(step?.title).not.toMatch(/Category\s*0/);
  });

  it('② 입사 에너지 기반 표를 인용한다 — 작업 기반 표 (a) 가 아니다', () => {
    const step = highEnergy.steps.find((s) => /PPE/.test(s.title));
    expect(step?.standardRef).toMatch(/130\.7\(C\)\(15\)\(c\)/);
    expect(step?.standardRef).not.toMatch(/130\.7\(C\)\(15\)\(a\)/);
    // 판이 붙어야 한다 — Category 0 삭제가 판 차이다.
    expect(step?.standardRef).toMatch(/20\d\d/);
  });

  it('높은 에너지에서는 등급과 최소 정격이 함께 나온다', () => {
    expect(highEnergy.ppeCategory).toBeGreaterThan(0);
    expect(highEnergy.ppeDescription).toMatch(/내아크/);
  });

  it('40 cal/cm² 초과는 등급이 아니라 작업 금지다', () => {
    const extreme = calculateArcFlash(input({ boltedFaultCurrent_kA: 100, arcDuration_s: 2 }));
    expect(extreme.incidentEnergy_cal_cm2).toBeGreaterThan(40);
    expect(extreme.ppeCategory).toBe(-1);
    expect(extreme.ppeDescription).toMatch(/작업 금지/);
  });
});
