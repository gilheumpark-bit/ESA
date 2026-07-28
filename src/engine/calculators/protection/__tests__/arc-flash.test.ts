import { calculateArcFlash, type ArcFlashInput } from '../arc-flash';

describe('Arc Flash Calculator (IEEE 1584-2002)', () => {
  const baseInput: ArcFlashInput = {
    voltage_V: 480,
    boltedFaultCurrent_kA: 25,
    arcDuration_s: 0.5,
    workingDistance_mm: 457,
    electrodeConfig: 'VCB',
    enclosureType: 'box',
  };

  test('returns positive incident energy for valid input', () => {
    const result = calculateArcFlash(baseInput);
    expect(result.incidentEnergy_cal_cm2).toBeGreaterThan(0);
    expect(result.arcingCurrent_kA).toBeGreaterThan(0);
    expect(result.arcFlashBoundary_mm).toBeGreaterThan(0);
    expect(result.unit).toBe('cal/cm²');
  });

  test('arcing current is calculated from bolted fault current', () => {
    const result = calculateArcFlash(baseInput);
    // IEEE 1584: 아크 전류는 볼트 단락전류와 다른 값 (LV box에서 증폭 가능)
    expect(result.arcingCurrent_kA).toBeGreaterThan(0);
    expect(result.arcingCurrent_kA).not.toEqual(baseInput.boltedFaultCurrent_kA);
  });

  test('PPE category 0 for low energy', () => {
    // 0.5kA 는 표준 시험 하한(700A) 밖이라 이제 거부된다 — 하한값으로 올린다.
    const low: ArcFlashInput = { ...baseInput, boltedFaultCurrent_kA: 0.7, arcDuration_s: 0.02 };
    const result = calculateArcFlash(low);
    expect(result.ppeCategory).toBe(0);
    expect(result.hazardLabel).toBe('green');
  });

  test('PPE category increases with energy', () => {
    const high: ArcFlashInput = { ...baseInput, boltedFaultCurrent_kA: 50, arcDuration_s: 2 };
    const result = calculateArcFlash(high);
    // 50kA + 2s = 매우 높은 에너지 → PPE -1 (40 cal/cm² 초과, 작업 금지) 포함
    expect(result.ppeCategory).not.toBe(0);
    expect(result.incidentEnergy_cal_cm2).toBeGreaterThan(4);
  });

  test('higher voltage produces higher energy', () => {
    const lv = calculateArcFlash({ ...baseInput, voltage_V: 208 });
    const hv = calculateArcFlash({ ...baseInput, voltage_V: 480 });
    expect(hv.incidentEnergy_cal_cm2).toBeGreaterThan(lv.incidentEnergy_cal_cm2);
  });

  test('open air has different distance exponent than box', () => {
    const box = calculateArcFlash({ ...baseInput, enclosureType: 'box' });
    const open = calculateArcFlash({ ...baseInput, enclosureType: 'open', electrodeConfig: 'VOA' });
    expect(box.incidentEnergy_cal_cm2).not.toEqual(open.incidentEnergy_cal_cm2);
  });

  test('boundary distance increases with energy', () => {
    const low = calculateArcFlash({ ...baseInput, arcDuration_s: 0.1 });
    const high = calculateArcFlash({ ...baseInput, arcDuration_s: 1.0 });
    expect(high.arcFlashBoundary_mm).toBeGreaterThan(low.arcFlashBoundary_mm);
  });

  test('5 calculation steps', () => {
    const result = calculateArcFlash(baseInput);
    expect(result.steps).toHaveLength(5);
    expect(result.steps[0].title).toContain('아크 전류');
    // 앞서 'PPE' 였다. 5 단계는 보호구 선정이고, 그 정본은 입사 에너지
    // 분석 경로의 Table 130.5(G)(최소 내아크 정격)다 — NFPA 70E 130.5(F)
    // 가 130.7(C)(15)(c) 의 '등급' 을 이 경로에서 쓰지 못하게 한다.
    expect(result.steps[4].title).toMatch(/보호구 선정|화상 경계 이하/);
  });

  test('throws on voltage out of range', () => {
    expect(() => calculateArcFlash({ ...baseInput, voltage_V: 100 })).toThrow('ESVA-4401');
    expect(() => calculateArcFlash({ ...baseInput, voltage_V: 20000 })).toThrow('ESVA-4401');
  });

  test('throws on fault current out of range', () => {
    expect(() => calculateArcFlash({ ...baseInput, boltedFaultCurrent_kA: 0.1 })).toThrow('ESVA-4402');
    // 하한이 0.2 가 아니라 0.7kA 다(IEEE 1584-2002 시험 범위).
    expect(() => calculateArcFlash({ ...baseInput, boltedFaultCurrent_kA: 0.5 })).toThrow('ESVA-4402');
    expect(() => calculateArcFlash({ ...baseInput, boltedFaultCurrent_kA: 200 })).toThrow('ESVA-4402');
  });

  test('throws on arc duration out of range', () => {
    expect(() => calculateArcFlash({ ...baseInput, arcDuration_s: -1 })).toThrow('ESVA-4403');
    expect(() => calculateArcFlash({ ...baseInput, arcDuration_s: 15 })).toThrow('ESVA-4403');
  });

  test('medium voltage (>1000V) uses different formula', () => {
    const mv: ArcFlashInput = { ...baseInput, voltage_V: 4160, boltedFaultCurrent_kA: 10, electrodeConfig: 'VOA', enclosureType: 'open' };
    const result = calculateArcFlash(mv);
    expect(result.arcingCurrent_kA).toBeGreaterThan(0);
    expect(result.incidentEnergy_cal_cm2).toBeGreaterThan(0);
  });
});
