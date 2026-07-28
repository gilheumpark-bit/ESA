import { calculateArcFlash, type ArcFlashInput } from '../arc-flash';

/**
 * 아크플래시 결과가 **자기 한계를 스스로 밝히는지** 본다.
 *
 * 앞선 판의 이 파일은 "축약 구현임을 밝힌다" 를 잠갔다. 그때는 그게
 * 맞았다 — 식이 정말 축약(이라기보다 **날조**)이었다. 저압 아크전류가
 * `K1 + K2·lg Ibf + K3·(V/1000)` 한 줄이었는데 그건 2002 판도 2018 판도
 * 아닌 출처 없는 식이었고, 결과에는 `IEEE 1584-2018 Section 4.3` 이 붙어
 * 나갔다.
 *
 * 2026-07-28 에 식을 IEEE 1584-**2002** 실물로 바꿨다. 그래서 고지해야 할
 * 것이 달라졌다 — 이제 "축약했다" 가 아니라 **"어느 판인가"** 와
 * **"어느 수준으로 검증했는가"** 다. 이 파일은 그쪽을 잠근다.
 *
 * 입사 에너지는 PPE 등급을 정한다 — 인명 안전 결정이다. 판을 잘못 알면
 * 사람이 잘못된 보호구를 입는다.
 */

const base: ArcFlashInput = {
  voltage_V: 480,
  boltedFaultCurrent_kA: 20,
  arcDuration_s: 0.2,
  workingDistance_mm: 457,
  electrodeConfig: 'VCB',
  enclosureType: 'box',
};

const disclosureOf = (input: ArcFlashInput) => {
  const r = calculateArcFlash(input);
  return { r, text: [r.formula, r.standardRef ?? '', ...(r.warnings ?? [])].join(' | ') };
};

describe('아크플래시 — 자기 한계 고지', () => {
  const { r, text } = disclosureOf(base);

  it('어느 판인지 밝힌다 — 2002 이고 현행판이 아니다', () => {
    expect(text).toMatch(/2002/);
    expect(text).toMatch(/현행판|대체됨|2018 판(으로|은)|supersede/);
  });

  it('현행판 준수를 주장하지 않는다', () => {
    // `IEEE 1584-2018 Section 4.3` 처럼 현행판 조항을 인용하면 그 판을
    // 구현했다는 주장이 된다. 실제로 그렇게 나가고 있었다.
    const refs = [r.standardRef ?? '', ...r.steps.map((s) => s.standardRef ?? '')].join(' | ');
    expect(refs).not.toMatch(/1584-2018\s*(Section|Clause|§)/);
    expect(r.source?.some((x) => x.standard.includes('1584') && x.edition === '2018')).toBeFalsy();
  });

  it('검증 수준을 밝힌다 — 표준 원문 대조가 아니다', () => {
    expect(text).toMatch(/표준 원문이 아니|공개 문헌/);
  });

  it('전문 소프트웨어 검증 필요를 밝힌다', () => {
    expect(text).toMatch(/ETAP|SKM|EasyPower|전문 소프트웨어/);
  });

  it('모델 불확실성을 밝힌다', () => {
    expect(text).toMatch(/±25%|불확실성/);
  });

  /**
   * 가정한 입력은 가정했다고 말해야 한다. 전극 간격과 접지는 식에 직접
   * 들어가는 값이라 조용히 기본값을 쓰면 사용자는 자기가 준 값으로
   * 계산된 줄 안다.
   */
  it('전극 간격을 가정하면 그 사실과 값을 밝힌다', () => {
    expect(text).toMatch(/전극 간격.*가정/);
    expect(text).toMatch(/32mm/);
  });

  it('접지를 가정하면 그 사실과 방향을 밝힌다', () => {
    expect(text).toMatch(/접지.*가정/);
    expect(text).toMatch(/에너지가 크게|보수/);
  });

  it('간격·접지를 주면 가정 문구를 붙이지 않는다 — 없는 경고로 겁주지 않는다', () => {
    const { text: given } = disclosureOf({ ...base, conductorGap_mm: 25, grounding: 'grounded' });
    expect(given).not.toMatch(/전극 간격.*가정/);
    expect(given).not.toMatch(/접지.*가정/);
    // 판 고지는 입력과 무관하게 남아야 한다.
    expect(given).toMatch(/2002/);
  });

  // 위 단언들이 공허하지 않은지 — 결과가 실제로 필드를 채우는지 본다.
  it('결과가 근거 필드를 실제로 채운다', () => {
    expect(r.warnings?.length ?? 0).toBeGreaterThan(0);
    expect(r.formula.length).toBeGreaterThan(0);
    expect(r.incidentEnergy_cal_cm2).toBeGreaterThan(0);
    expect(r.steps.length).toBeGreaterThan(0);
  });
});
