/**
 * Known-Answer Accuracy Tests — the 47 calculators without a dedicated
 * accuracy suite (the other 10 are covered by power/voltage-drop/cable-sizing/
 * grounding/short-circuit/solar/transformer/arc-flash/unit-conversion tests).
 *
 * Expected values are HAND-COMPUTED from the governing standard formula
 * (IEC 60364 / 60076 / 60255 / 62305, NEC, KEC, IEEE) — NOT copied from the
 * app's own output. Each case documents the arithmetic so a reviewer can audit
 * it independently. This guards calculator CORRECTNESS (right number), which the
 * param-contract test (right field names, runs without throwing) does not check.
 */

import { CALCULATOR_REGISTRY } from '@/engine/calculators';

function run(id: string, input: Record<string, unknown>) {
  const entry = CALCULATOR_REGISTRY.get(id);
  if (!entry) throw new Error(`calculator not registered: ${id}`);
  const r = entry.calculator(input as never) as {
    value: number;
    steps?: Array<{ step: number; value: number }>;
    judgment?: { pass: boolean; message: string };
    additionalOutputs?: Record<string, { value: number }>;
  };
  const extra: Record<string, number> = {};
  if (r.additionalOutputs) {
    for (const [k, v] of Object.entries(r.additionalOutputs)) extra[k] = v.value;
  }
  // 중간 단계 값이 화면에 보이는데 additionalOutputs 에는 없는 계산기가 있다
  // (vt-sizing 1차 전압). 그 값이 틀려도 최종값이 맞으면 여기서 못 잡는다.
  const step = (n: number) => {
    const s = r.steps?.find((x) => x.step === n);
    if (!s) throw new Error(`${id}: step ${n} 없음`);
    return s.value;
  };
  // 판정(PASS/FAIL)은 숫자와 별개 축이다. 숫자가 다 맞아도 부등호가 뒤집히면
  // 도구가 거짓말을 한다 — 차단용량이 모자란 차단기를 합격시키는 식으로.
  // 실측 2026-07-26: 안전 판정 10 곳 중 6 곳이 뒤집혀도 스위트가 초록이었다.
  const verdict = () => {
    if (!r.judgment) throw new Error(`${id}: judgment 없음`);
    return r.judgment.pass;
  };
  return { value: r.value as number, extra, step, verdict };
}

/** relative tolerance (default 1%) — catches wrong formulas, tolerates rounding */
function close(actual: number, expected: number, relTol = 0.01) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * relTol + 1e-6);
}

describe('power (non-suite)', () => {
  test('power-factor: pf=P/S=80/100=0.8, φ=acos0.8=36.87°, Q=√(100²−80²)=60', () => {
    const { value, extra } = run('power-factor', { activePower: 80, apparentPower: 100 });
    close(value, 0.8);
    close(extra.phaseAngle, 36.87);
    close(extra.reactivePower, 60);
  });
  test('reactive-power: Qc=P(tanφ1−tanφ2)=100(0.75−0)=75 kvar', () => {
    const { value } = run('reactive-power', { activePower: 100, currentPF: 0.8, targetPF: 1.0 });
    close(value, 75);
  });
  test('power-loss 3φ: 3·I²·R=3·100²·1Ω=30 kW', () => {
    const { value } = run('power-loss', { current: 100, resistance: 1, length: 1, phase: 3 });
    close(value, 30);
  });
  test('demand-diversity: div=Σ/comb=150/120=1.25, demand=120/200=0.6', () => {
    const { value, extra } = run('demand-diversity', { individualMaxDemands: [50, 50, 50], combinedMaxDemand: 120, totalInstalled: 200 });
    close(value, 1.25);
    close(extra.demandFactor, 0.6);
    // load factor omitted when averageDemand absent (no longer duplicates demandFactor)
    expect(extra.loadFactor).toBeUndefined();
    expect((extra as Record<string, unknown>).utilizationFactor).toBeUndefined();
  });
  test('demand-diversity load factor: avg 90 / peak 120 = 0.75 (부하율, 공식 기준)', () => {
    const { extra } = run('demand-diversity', { individualMaxDemands: [50, 50, 50], combinedMaxDemand: 120, totalInstalled: 200, averageDemand: 90 });
    close(extra.loadFactor, 0.75);
  });
  test('max-demand: Σ(P·D)/div=(80+50)/1.25=104 kW', () => {
    const { value } = run('max-demand', { loads: [{ name: 'a', ratedPower: 100, demandFactor: 0.8 }, { name: 'b', ratedPower: 100, demandFactor: 0.5 }], diversityFactor: 1.25 });
    close(value, 104);
  });
});

describe('lighting / energy', () => {
  test('illuminance: N=(E·A)/(F·U·M)=(500·100)/(3000·0.5·0.8)=41.67→42', () => {
    const { value, extra } = run('illuminance', { area: 100, requiredLux: 500, luminousFlux: 3000, utilizationFactor: 0.5, maintenanceFactor: 0.8, fixtureWattage: 40 });
    close(value, 42);
    close(extra.achievedLux, 504);
  });
  test('energy-saving: (10−6)·10·300=12000 kWh; CO2=12000·0.4594=5512.8', () => {
    const { value, extra } = run('energy-saving', { beforePower: 10, afterPower: 6, dailyHours: 10, annualDays: 300, electricityRate: 100 });
    close(value, 12000);
    close(extra.co2Reduction, 5512.8);
  });
  test('ups-capacity: S=(10/(0.8·0.95))·1.25=16.45 kVA; cells=ceil(384/12)=32', () => {
    const { value, extra } = run('ups-capacity', { loadPower: 10, loadPF: 0.8, backupMinutes: 15, inputVoltage: 380, batteryVoltage: 384, efficiency: 0.95, safetyFactor: 1.25, depthOfDischarge: 0.8, cellVoltage: 12 });
    close(value, 16.45);
    expect(extra.batteryCount).toBe(32);
    // Ah = (16447·15)/(384·0.95·0.8·60) = 246711/17510 = 14.09.
    // 위 두 줄은 kVA→VA 환산 이전 값이라, 이 줄이 없으면 배터리 뱅크가 10 배
    // 틀려도 초록이다(실측 2026-07-26: ×1000→×100 변이 무검출).
    close(extra.batteryAh, 14.09);
  });
  test('emergency-generator: 100/0.8·1.25=156.25→select 200 kVA', () => {
    const { value } = run('emergency-generator', { emergencyLoads: [{ name: 'a', kW: 100, pf: 0.8, isMotor: false }], safetyFactor: 1.25, requiredRuntime: 8 });
    close(value, 200);
  });
});

describe('substation / load', () => {
  test('substation-capacity: S=125 kVA; TR 150; LV bus@380=189.9A; HV in@22.9k=3.15A', () => {
    const { value, extra } = run('substation-capacity', { loads: [{ name: 'a', kW: 100, pf: 0.8, demandFactor: 1.0 }], futureGrowth: 0, redundancy: 'N', systemVoltage: 22900, secondaryVoltage: 380 });
    close(value, 125);
    expect(extra.transformerSize).toBe(150);
    close(extra.busRating, 189.9, 0.02);        // LV bus at secondaryVoltage 380V
    close(extra.incomingCurrent, 3.15, 0.03);   // HV incoming at systemVoltage 22.9kV (was ignored)
  });
  test('nec-load-calc dwelling: (3300+3000+1500) → 3000+4800·0.35=4680 VA', () => {
    const { value } = run('nec-load-calc', { occupancyType: 'dwelling', area: 100, smallApplianceCircuits: 2, laundryCircuits: 1, hvacLoad: 0, serviceVoltage: 240, phases: 1 });
    close(value, 4680);
  });
  // 3상 인입은 I = VA/(V·√3) 로 갈라진다. 위 케이스가 phases:1 뿐이라 이 분기는
  // 아무도 밟지 않았고, √3 이 틀려도 스위트가 초록이었다(실측 2026-07-26).
  // office 1000m² = 39 VA/m² × 1000 = 39,000 VA, 상업용은 수요율 100%.
  test('nec-load-calc 3상 office: 39,000VA / (208·√3) = 108.25 A', () => {
    const { extra } = run('nec-load-calc', { occupancyType: 'office', area: 1000, smallApplianceCircuits: 0, laundryCircuits: 0, hvacLoad: 0, serviceVoltage: 208, phases: 3 });
    close(extra.serviceSize, 108.25);
  });
  // 창고 3 VA/m² × 8000 = 24,000 VA (상업용 수요율 100%), 240V 1상 → 정확히 100 A.
  test('nec-load-calc 경계: 24,000VA/240V = 100.0A → 100A 인입 (125 아님)', () => {
    const { extra } = run('nec-load-calc', { occupancyType: 'warehouse', area: 8000, smallApplianceCircuits: 0, laundryCircuits: 0, hvacLoad: 0, serviceVoltage: 240, phases: 1 });
    close(extra.serviceSize, 100);
    expect(extra.selectedService).toBe(100);
  });
  test('nec-load-calc 1상 대조: 같은 부하·같은 전압이면 √3 배인 187.5 A', () => {
    const { extra } = run('nec-load-calc', { occupancyType: 'office', area: 1000, smallApplianceCircuits: 0, laundryCircuits: 0, hvacLoad: 0, serviceVoltage: 208, phases: 1 });
    close(extra.serviceSize, 187.5);
  });
});

describe('motor', () => {
  // 직선 부하는 P=(F·v)/(η·1000) 이고 여기엔 효율이 다시 곱해지지 않는다.
  // 15000N × 0.9m/s / (0.9·1000) = 정확히 15 kW = 표준 규격 그 자체.
  test('motor-capacity 경계: 입력 15.0kW → 15kW 전동기 (18.5 아님)', () => {
    const { value, extra } = run('motor-capacity', { loadType: 'linear', torqueOrForce: 15000, speedOrVelocity: 0.9, efficiency: 0.9, voltage: 380, powerFactor: 0.85 });
    close(value, 15);
    expect(extra.motorPower).toBe(15);
  });
  test('motor-capacity: P=T·n/9550/η=(100·1800/9550)/0.9=20.94 kW; I(22kW)=43.69A', () => {
    const { value, extra } = run('motor-capacity', { loadType: 'rotary', torqueOrForce: 100, speedOrVelocity: 1800, efficiency: 0.9, voltage: 380, powerFactor: 0.85 });
    close(value, 20.9424);
    close(extra.ratedCurrent, 43.69);
  });
  test('motor-pf-correction: Qc=100(tan(acos0.8)−0)=75 kvar; I2=100k/(√3·380)=151.93A', () => {
    const { value, extra } = run('motor-pf-correction', { motorPower: 100, motorPF: 0.8, targetPF: 1.0, motorVoltage: 380 });
    close(value, 75);
    close(extra.correctedCurrent, 151.93);
  });
  test('starting-current DOL: I=11k/(√3·380·0.9·0.85)=21.85A; Ist=×7=152.93A', () => {
    const { value, extra } = run('starting-current', { ratedPower: 11, voltage: 380, efficiency: 0.9, powerFactor: 0.85, startingMethod: 'DOL' });
    close(value, 152.93);
    close(extra.ratedCurrent, 21.85);
  });
  test('inverter-capacity: S=100/(0.9·0.85)·1.25=163.4 kVA → select 200', () => {
    const { value, extra } = run('inverter-capacity', { motorPower: 100, motorVoltage: 380, powerFactor: 0.85, efficiency: 0.9, safetyFactor: 1.25 });
    close(value, 200);
    close(extra.requiredCapacity, 163.4);
    // I = S/(√3·V) = 163399/(1.732·380). 이 줄이 없으면 3상 계수가 틀려도 초록이다.
    close(extra.ratedCurrent, 248.26);
  });
  test('braking-resistor: R=Vdc²/P=700²/10000=49 Ω', () => {
    const { value, extra } = run('braking-resistor', { dcBusVoltage: 700, brakingPower: 10, brakingTime: 5, dutyCycle: 10 });
    close(value, 49);
    // 저항값은 듀티사이클 이전 값이라 그것만 보면 dutyCycle/100 이 틀려도 초록이다
    // (실측 2026-07-26: /100→/10 변이 무검출). 정작 저항기를 그 값으로 사는
    // 연속 정격이 여기 걸려 있다.
    close(extra.peakPower, 10);        // Vdc²/R = 490000/49 = 10 kW
    close(extra.energy, 50);           // 10kW × 5s = 50 kJ
    close(extra.resistorRating, 1);    // 10kW × (10/100) = 1 kW
  });
  // 고정손/가변손 모델. IE3 11kW 정격 η=0.921(표) →
  //   ratedLoss = (1−0.921)/0.921 = 0.085776 pu, fixed = 0.4×= 0.034310, var = 0.6×= 0.051466
  //   k=0.75: losses = 0.034310 + 0.051466×0.5625 = 0.063260
  //           η = 0.75/(0.75+0.063260) = 0.92223 → 92.2%
  test('motor-efficiency: IE3 11kW @75% → 92.2% (고정손/가변손 전개), savingsVsIE1 > 0', () => {
    const { value, extra } = run('motor-efficiency', { ratedPower: 11, loadRatio: 0.75, ieClass: 'IE3', annualHours: 4000, electricityRate: 120 });
    close(value, 92.2, 0.002);
    expect(extra.savingsVsIE1).toBeGreaterThan(0);
  });
  // η² 회귀 가드: 정격부하에서는 표의 정격효율을 그대로 반환해야 한다.
  // 구 모델은 k=1에서 η_r²(0.921²=84.8%)을 반환했고, 부하가 오를수록 효율이
  // 떨어지는 물리 역전을 만들었다.
  test('motor-efficiency: 정격부하(k=1)에서 표 정격효율 92.1% 반환 (η² 아님)', () => {
    const { value } = run('motor-efficiency', { ratedPower: 11, loadRatio: 1.0, ieClass: 'IE3', annualHours: 4000, electricityRate: 120 });
    close(value, 92.1, 0.002);
    expect(value).toBeGreaterThan(0.921 * 0.921 * 100 + 5); // η²=84.8% 회귀 차단
  });
  // 효율 곡선이 경부하 → 정격으로 갈수록 상승해야 한다(구 모델은 단조 감소).
  test('motor-efficiency: 25% 부하 < 75% 부하 (물리 방향)', () => {
    const light = run('motor-efficiency', { ratedPower: 11, loadRatio: 0.25, ieClass: 'IE3', annualHours: 4000, electricityRate: 120 }).value;
    const near = run('motor-efficiency', { ratedPower: 11, loadRatio: 0.75, ieClass: 'IE3', annualHours: 4000, electricityRate: 120 }).value;
    expect(light).toBeLessThan(near);
  });
  test('motor-efficiency: IE1 vs IE1 baseline → savings ≈ 0 (self-consistent)', () => {
    const { extra } = run('motor-efficiency', { ratedPower: 11, loadRatio: 0.75, ieClass: 'IE1', annualHours: 4000, electricityRate: 120 });
    expect(Math.abs(extra.savingsVsIE1)).toBeLessThan(1);
  });
});

describe('voltage-drop variants', () => {
  // Vd = √3·I·(L/1000)·(R·cosφ + X·sinφ); cosφ=0.85, sinφ=0.5268
  // = √3·100·0.1·(0.5·0.85+0.08·0.5268) = √3·100·0.1·0.046715 = 8.09 V → 2.13%
  test('three-phase-vd: 8.09 V → 2.13%', () => {
    const { value, extra } = run('three-phase-vd', { voltage: 380, current: 100, length: 100, resistance: 0.5, reactance: 0.08, powerFactor: 0.85 });
    close(value, 2.13, 0.02);
    close(extra.steadyStateDropVolts, 8.09, 0.02);
  });
  test('complex-voltage-drop: two 50 m sections = 100 m → 2.13%', () => {
    const { value } = run('complex-voltage-drop', { voltage: 380, current: 100, powerFactor: 0.85, phase: 3, sections: [{ length: 50, resistance: 0.5, reactance: 0.08 }, { length: 50, resistance: 0.5, reactance: 0.08 }] });
    close(value, 2.13, 0.02);
  });
  test('busbar-vd: √3·100·0.01·(0.1·0.85+0.05·0.5268)=0.19 V → 0.05%', () => {
    const { value, extra } = run('busbar-vd', { voltage: 380, powerFactor: 0.85, sections: [{ name: 's', current: 100, length: 10, resistance: 0.1, reactance: 0.05 }] });
    close(value, 0.05, 0.05);
    close(extra.totalDropVolts, 0.19, 0.05);
  });
  test('country-compare-vd: base VD 2.13%, compares 4 countries', () => {
    const { value, extra } = run('country-compare-vd', { voltage: 380, current: 100, length: 100, resistance: 0.5, reactance: 0.08, powerFactor: 0.85, phase: 3 });
    close(value, 2.13, 0.02);
    expect(extra.countryResultCount).toBe(4);
  });
  test('cable-impedance: 25mm² Cu@75°C → R/km=0.017241·1000/25·1.216=0.839 Ω/km', () => {
    const { value, extra } = run('cable-impedance', { cableSize: 25, conductor: 'Cu', length: 100, frequency: 60, temperature: 75 });
    close(extra.resistancePerKm, 0.8387, 0.02);
    close(value, 0.0845, 0.02);
  });
});

describe('cable / ampacity', () => {
  test('temp-correction: k=√((90−40)/(90−30))=√0.8333=0.9129; 100·k=91.3A', () => {
    const { value, extra } = run('temp-correction', { baseAmpacity: 100, referenceTemp: 30, actualTemp: 40, maxConductorTemp: 90 });
    close(value, 0.9129);
    close(extra.correctedAmpacity, 91.3);
  });
  test('awg-converter: AWG10 → 0.127·92^((36−10)/39) → A=(π/4)d²=5.26 mm²', () => {
    const { value, extra } = run('awg-converter', { direction: 'awg-to-mm2', awg: 10, mm2: 25 });
    close(value, 5.26, 0.01);
    close(extra.kcmil, 10.4, 0.02);
  });
  test('awg-converter-full: AWG10 → 5.261 mm², 10.38 kcmil', () => {
    const { value, extra } = run('awg-converter-full', { value: 10, fromUnit: 'awg' });
    close(value, 5.261, 0.01);
    close(extra.kcmil, 10.38, 0.02);
  });
  // 위 케이스는 AWG 입력 방향뿐이다. kcmil 입력 분기(kcmil = 천 circular mil,
  // d[mil] = √(kcmil×1000))는 아무도 밟지 않아 ×1000 이 틀려도 초록이었다.
  // unit-conversion 스위트의 kcmilToMm2() 는 다른 모듈의 다른 함수라 안 덮는다.
  // 250 kcmil: d = √250000 = 500 mil = 12.7 mm, A = π/4·12.7² = 126.68 mm²
  // (업계 표준표의 250 kcmil = 126.7 mm² 와 일치).
  test('awg-converter-full kcmil 입력: 250 kcmil → 126.68 mm²', () => {
    const { value, extra } = run('awg-converter-full', { value: 250, fromUnit: 'kcmil' });
    close(value, 126.68, 0.01);
    close(extra.kcmil, 250);
  });
  // NEC/IEC는 KEC×배율 추정이 아니라 각 표준 실표에서 온다.
  // NEC: 25mm² → 보수 하향 스냅 4 AWG(21.15mm²) @90°C = 95A (NEC 310.16)
  // IEC: 25mm² XLPE Cu = 133A (IEC 60364-5-52)
  // (구 구현은 NEC=138×0.98=135, IEC=138×1.02=141로 날조 — 허용전류 과대 = 화재 방향)
  test('ampacity-compare 25mm² Cu XLPE: KEC free-air 133, NEC 실표 95, IEC 실표 133', () => {
    const { value, extra } = run('ampacity-compare', { cableSize: 25, conductor: 'Cu', insulation: 'XLPE', ambientTemp: 30 });
    close(value, 133);
    close(extra.necAmpacity, 95);
    close(extra.iecAmpacity, 133);
    // 회귀 방지: 다시 KEC 배율 추정으로 돌아가면 실패한다
    expect(extra.necAmpacity).not.toBe(Math.round(133 * 0.98));
    expect(extra.iecAmpacity).not.toBe(Math.round(133 * 1.02));
  });
  test('ampacity-compare는 표에 없는 NEC 조합을 0A로 위장하지 않는다', () => {
    expect(() => run('ampacity-compare', {
      cableSize: 2.5,
      conductor: 'Al',
      insulation: 'PVC',
      ambientTemp: 30,
    })).toThrow(/NEC.*not available|not available.*NEC/i);
  });
  test('ampacity-global-compare 25mm² XLPE: min=AS 110·√(60/50)=120.5A', () => {
    const { value, extra } = run('ampacity-global-compare', { cableSize: 25, conductor: 'copper', insulation: 'XLPE', ambientTemp: 30 });
    close(value, 120.5, 0.02);
    close(extra.maxAmpacity, 130);
  });
  // BUG FIX (계산기군 #7): k was 226(Cu)/148(Al) — near-melting constants that UNDER-size
  // the protective conductor. IEC 60364-5-54 k is insulation-dependent (initial 30°C):
  //   PVC  Cu 143 / Al 95   XLPE/EPR Cu 176 / Al 116   bare Cu 159 / Al 105.
  // A = I√t/k. I√t = 5000·√0.5 = 3535.53. Default insulation is PVC (conservative).
  //   PVC Cu:  3535.53/143 = 24.72 → 25    (was 15.64/16 with the wrong k=226)
  //   XLPE Cu: 3535.53/176 = 20.09 → 25
  //   PVC Al:  3535.53/95  = 37.22 → 50
  // A = I√t/k. Cu/PVC 는 k=143 이므로 I=2288A, t=1s 면 2288/143 = 정확히 16 mm².
  test('ground-conductor 경계: Amin 16.0 mm² → 16 mm² 선정 (25 아님)', () => {
    const { value, extra } = run('ground-conductor', { faultCurrent: 2288, clearingTime: 1, conductor: 'Cu', insulation: 'PVC' });
    close(value, 16);
    expect(extra.selectedSize).toBe(16);
  });
  test('ground-conductor PVC Cu (default): 3535.53/143=24.72 mm² → select 25 (IEC 60364-5-54)', () => {
    const { value, extra } = run('ground-conductor', { faultCurrent: 5000, clearingTime: 0.5, conductor: 'Cu' });
    close(value, 24.72, 0.02);
    expect(extra.selectedSize).toBe(25);
    // regression guard: must NOT return to the near-melting k=226 (would give 15.64 → 16)
    expect(value).toBeGreaterThan(20);
  });
  test('ground-conductor XLPE Cu: 3535.53/176=20.09 mm²; k_XLPE(176) > k_PVC(143)', () => {
    const pvc = run('ground-conductor', { faultCurrent: 5000, clearingTime: 0.5, conductor: 'Cu', insulation: 'PVC' }).value;
    const xlpe = run('ground-conductor', { faultCurrent: 5000, clearingTime: 0.5, conductor: 'Cu', insulation: 'XLPE' }).value;
    close(xlpe, 20.09, 0.02);
    // higher final temp → higher k → smaller required area
    expect(xlpe).toBeLessThan(pvc);
  });
  test('ground-conductor PVC Al: 3535.53/95=37.22 mm² → select 50', () => {
    const { value, extra } = run('ground-conductor', { faultCurrent: 5000, clearingTime: 0.5, conductor: 'Al', insulation: 'PVC' });
    close(value, 37.22, 0.02);
    expect(extra.selectedSize).toBe(50);
  });
  test('solar-cable: Vsys=900V, Idesign=1.25·11=13.75A, minA=2ρLI/ΔV=3.26→4mm²', () => {
    const { value, extra } = run('solar-cable', { moduleVoc: 45, stringCount: 20, isc: 11, length: 100, maxVoltageDrop: 2 });
    expect(value).toBe(4);
    close(extra.actualVD, 1.63, 0.03);
  });
});

describe('protection', () => {
  test('breaker-sizing: In≥100, ≤Iz150 → 100A; Icu≥10kA', () => {
    const { value, extra } = run('breaker-sizing', { loadCurrent: 100, shortCircuitCurrent: 10, voltage: 380, cableAmpacity: 150 });
    expect(value).toBe(100);
    close(extra.selectedBreakingCapacity, 10);
  });
  test('rcd-sizing socket: 30mA; Rmax=50/0.03=1666.67Ω; Vt=0.03·10=0.3V', () => {
    const { value, extra } = run('rcd-sizing', { circuitType: 'socket', loadCurrent: 16, earthResistance: 10 });
    expect(value).toBe(16);
    close(extra.sensitivity, 30);
    close(extra.maxEarthResistance, 1666.67);
  });
  test('earth-fault solid: Vph=380/√3=219.4; Ig=219.4/(0.5+0.5)=219.39A', () => {
    const { value, extra } = run('earth-fault', { systemVoltage: 380, groundingType: 'solid', groundImpedance: 0.5, sourceImpedance: 0.5 });
    close(value, 219.39, 0.01);
    close(extra.touchVoltage, 109.7, 0.01);
  });
  test('ct-sizing: primary≥200·1.25=250 → 250/5; burden 16.95→30VA', () => {
    const { value, extra } = run('ct-sizing', { maxLoadCurrent: 200, relayBurden: 10, leadLength: 20, leadSize: 4, accuracyClass: '0.5' });
    expect(value).toBe(250);
    close(extra.ratedBurden, 30);
  });
  test('vt-sizing L-L: ratio=22900/110=208.18; burden 27→30VA', () => {
    const { value, extra } = run('vt-sizing', { systemVoltage: 22900, secondaryVoltage: 110, meterBurden: 15, relayBurden: 10, wireBurden: 2, accuracyClass: '0.5', connectionType: 'line-to-line' });
    close(value, 208.18, 0.01);
    close(extra.totalBurden, 27);
  });
  // L-G(Y결선) VT 는 1·2차를 함께 √3 으로 나눠 `22900/√3 : 110/√3` 으로 규격한다.
  // 그래서 **변성비는 L-L 과 같다** — √3 이 약분되는 것이 정상이다. 뒤집으면,
  // 변성비만 보는 검사는 이 분기의 √3 이 틀려도 영원히 초록이다(실측 2026-07-26:
  // √3→√2 변이가 무검출). 화면에 나오는 1차 상전압을 같이 잠근다.
  test('vt-sizing L-G 22.9kV: 1차=22900/√3=13221V; 비는 L-L 과 같은 208.18', () => {
    const { value, step } = run('vt-sizing', { systemVoltage: 22900, secondaryVoltage: 110, meterBurden: 15, relayBurden: 10, wireBurden: 2, accuracyClass: '0.5', connectionType: 'line-to-ground' });
    close(step(1), 13221.3);
    close(value, 208.18, 0.01);
  });
  // 규격 선정은 `find(s => s >= x)` — 값이 표준값과 **정확히 일치**할 때만 경계가
  // 드러난다. 기존 케이스는 전부 중간값이라 `>=` 를 `>` 로 바꿔도 여섯 곳 중
  // 다섯이 초록이었다(실측 2026-07-26). 딱 맞는 규격이 있으면 그것을 골라야지
  // 한 단계 큰 것을 집으면 과설계다. 아래는 전부 경계에 정확히 떨어지는 입력이다.
  test('vt-sizing 경계: 부담 15+12+3=30VA → 30VA VT (50 아님)', () => {
    const { extra } = run('vt-sizing', { systemVoltage: 22900, secondaryVoltage: 110, meterBurden: 15, relayBurden: 12, wireBurden: 3, accuracyClass: '0.5', connectionType: 'line-to-line' });
    close(extra.totalBurden, 30);
    expect(extra.selectedVT).toBe(30);
  });
  test('vt-sizing L-G 154kV: 1차=154000/√3=88912V; 비 1400', () => {
    const { value, step } = run('vt-sizing', { systemVoltage: 154000, secondaryVoltage: 110, meterBurden: 15, relayBurden: 10, wireBurden: 2, accuracyClass: '0.5', connectionType: 'line-to-ground' });
    close(step(1), 88911.9);
    close(value, 1400, 0.01);
  });
  test('relay-basic SI: Ip=1.3·100=130A; IEC t=TDS·0.14/(M^0.02−1)≈0.3s', () => {
    const { value, extra } = run('relay-basic', { loadCurrent: 100, faultCurrent: 2000, ctRatio: 200, curveType: 'SI' });
    close(value, 130);
    close(extra.tripTime, 0.3, 0.05);
  });
  test('surge-arrester 22.9kV solid: Uc=1.05·22.9/√3=13.88; Ur=×1.25=17.35kV', () => {
    const { value, extra } = run('surge-arrester', { systemVoltage: 22900, neutralGrounding: 'solid', pollutionLevel: 'medium' });
    close(value, 17.35, 0.01);
    close(extra.mcov, 13.88, 0.01);
  });
  test('lightning-protection LPL III sphere: rolling radius 45 m (IEC 62305)', () => {
    const { value } = run('lightning-protection', { buildingHeight: 20, lplClass: 'III', method: 'sphere' });
    expect(value).toBe(45);
  });
  // PE 50 → 절반 25 → 상한 25 에 정확히 걸린다. 상한값 자체가 표준 규격이므로
  // 경계가 틀리면 불필요하게 35 로 올라간다.
  test('equipotential-bonding 경계: 상한 25 mm² 정확히 → 25 선정 (35 아님)', () => {
    const { value, extra } = run('equipotential-bonding', { largestPE: 50 });
    close(value, 25);
    expect(extra.selectedBonding).toBe(25);
  });
  test('equipotential-bonding: max(0.5·16,6)=8 mm² → select 10 (IEC 60364-5-54, PE only)', () => {
    const { value, extra } = run('equipotential-bonding', { largestPE: 16 });
    close(value, 8);
    expect(extra.selectedBonding).toBe(10);
  });
  // BUG FIX regression: %Z = (In/Isc)·100. In=500k/(√3·380)=759.67A;
  // Isc=15000A → %Z=759.67/15000·100=5.06%. Pre-fix formula gave ~1140%.
  test('impedance-voltage: 500kVA/380V, Isc=15000A → %Z ≈ 5.06% (was 1140%)', () => {
    const { value, extra } = run('impedance-voltage', { ratedCapacity: 500, ratedVoltage: 380, shortCircuitCurrent: 15000 });
    close(value, 5.06, 0.02);
    close(extra.ratedCurrent, 759.67, 0.01);
    expect(value).toBeLessThan(15); // sanity: transformer %Z is single/double digit
  });
});

describe('transformer / renewable', () => {
  test('transformer-loss: Pfe+Pcu·k²=500+3000·0.75²=2187.5 W', () => {
    const { value } = run('transformer-loss', { noLoadLoss: 500, ratedLoadLoss: 3000, loadRatio: 0.75 });
    close(value, 2187.5);
  });
  test('transformer-efficiency: 318750/(318750+2187.5)·100=99.318%', () => {
    const { value, extra } = run('transformer-efficiency', { capacity: 500, noLoadLoss: 500, loadLoss: 3000, loadRatio: 0.75, powerFactor: 0.85 });
    close(value, 99.3184, 0.001);
    close(extra.optimalLoadRatio, 0.4082, 0.01);
  });
  test('parallel-operation: 2×500kVA@5% equal → compatible, 50/50, total 1000', () => {
    const { value, extra } = run('parallel-operation', { transformers: [{ capacity: 500, impedancePercent: 5, voltageRatio: '22900/380', vectorGroup: 'Dyn11' }, { capacity: 500, impedancePercent: 5, voltageRatio: '22900/380', vectorGroup: 'Dyn11' }] });
    expect(value).toBe(1);
    close(extra.totalCapacity, 1000);
    close(extra.loadShare_T1, 50);
  });
  test('inrush-current distribution: In=500k/(√3·380)=759.67; ×7=5317.7A', () => {
    const { value, extra } = run('inrush-current', { ratedCapacity: 500, ratedVoltage: 380, transformerType: 'distribution' });
    close(value, 5317.7, 0.01);
    close(extra.ratedCurrent, 759.67, 0.01);
  });
  test('pcs-capacity: P=100·0.5=50kW; Ppcs=50/0.95=52.63 kW', () => {
    const { value, extra } = run('pcs-capacity', { batteryCapacity: 100, maxChargeRate: 0.5, maxDischargeRate: 0.5, efficiency: 0.95, gridVoltage: 380 });
    close(value, 52.63);
    close(extra.chargeCurrent, 75.97);   // 50000/(1.732·380)
  });
  // 충·방전율을 다르게 준다. 같은 값이면 두 전류가 뒤바뀌어도 통과한다.
  test('pcs-capacity 비대칭 0.5C/1.0C: Ich=151.93A, Idis=303.87A, Ppcs=210.53kW', () => {
    const { value, extra } = run('pcs-capacity', { batteryCapacity: 200, maxChargeRate: 0.5, maxDischargeRate: 1.0, efficiency: 0.95, gridVoltage: 380 });
    close(value, 210.53);
    close(extra.chargeCurrent, 151.93);
    close(extra.dischargeCurrent, 303.87);
  });
  test('grid-connect: maxExport=min(100,100)=100 kW', () => {
    const { value, step } = run('grid-connect', { pvCapacity: 100, batteryCapacity: 0, gridVoltage: 380, contractDemand: 100 });
    close(value, 100);
    close(step(3), 151.93);   // I = 100000/(1.732·380) — 저압 380V 연계
  });
  // 100kW 초과는 22.9kV 고압 연계로 갈린다. 저압 케이스만으로는 이 분기가 안 밟힌다.
  test('grid-connect 고압 500kW: 22.9kV 연계, I=500000/(1.732·22900)=12.61A', () => {
    const { value, step } = run('grid-connect', { pvCapacity: 500, batteryCapacity: 0, gridVoltage: 380, contractDemand: 1000 });
    close(value, 500);
    close(step(3), 12.61);
  });
  test('frequency-compare motor 60→50Hz: ratio 0.833, speed −16.67%, flux +20%', () => {
    const { value, extra } = run('frequency-compare', { equipmentType: 'motor', ratedPower: 100, ratedFreq: 60, targetFreq: 50, motorPoles: 4 });
    close(value, 0.8333);
    close(extra.speedChange, -16.67, 0.02);
    close(extra.coreFluxChange, 20, 0.02);
  });
});

/**
 * 판정 방향 — 숫자와 별개 축이다.
 *
 * 합격 조건의 부등호를 뒤집는 변이를 안전 직결 판정 열 곳에 넣어 보니 여섯 곳이
 * 통과했다(실측 2026-07-26). 차단용량이 사고전류보다 작은 차단기를 합격시키고,
 * 접촉전압이 안전한계를 넘어도 합격시키는 상태가 1,956 개 테스트를 뚫었다.
 * 숫자만 보는 케이스로는 이 축이 잡히지 않는다 — 판정 자체를 봐야 한다.
 *
 * 각 항목은 합격·불합격 양방향을 잠근다. 한쪽만 있으면 뒤집힌 부등호가 그
 * 방향에서만 우연히 맞을 수 있다.
 */
describe('판정 방향', () => {
  describe('breaker-sizing', () => {
    it('정상 선정은 합격', () => {
      expect(run('breaker-sizing', { loadCurrent: 100, shortCircuitCurrent: 10, voltage: 380, cableAmpacity: 150 }).verdict()).toBe(true);
    });
    it('차단용량이 사고전류에 못 미치면 불합격 — 표준 최대 100kA < 120kA', () => {
      expect(run('breaker-sizing', { loadCurrent: 100, shortCircuitCurrent: 120, voltage: 380, cableAmpacity: 2000 }).verdict()).toBe(false);
    });
    it('정격이 부하전류에 못 미치면 불합격 — MCCB 최대 800A < 1000A', () => {
      expect(run('breaker-sizing', { loadCurrent: 1000, shortCircuitCurrent: 10, voltage: 380, cableAmpacity: 2000 }).verdict()).toBe(false);
    });
  });

  describe('earth-fault', () => {
    // Vph = 380/√3 = 219.39 V, Vt = Ig·Zg, 한계 50 V (KEC 142)
    it('접촉전압 36.57V 는 50V 한계 이내 — 합격', () => {
      const r = run('earth-fault', { systemVoltage: 380, groundingType: 'solid', groundImpedance: 0.1, sourceImpedance: 0.5 });
      close(r.extra.touchVoltage, 36.57);
      expect(r.verdict()).toBe(true);
    });
    it('접촉전압 109.70V 는 50V 한계 초과 — 불합격', () => {
      const r = run('earth-fault', { systemVoltage: 380, groundingType: 'solid', groundImpedance: 0.5, sourceImpedance: 0.5 });
      close(r.extra.touchVoltage, 109.7);
      expect(r.verdict()).toBe(false);
    });
  });

  describe('ground-conductor', () => {
    it('선정 단면적이 최소치 이상이면 합격', () => {
      expect(run('ground-conductor', { faultCurrent: 5000, clearingTime: 0.5, conductor: 'Cu', insulation: 'PVC' }).verdict()).toBe(true);
    });
    it('최소치가 표준 최대(300mm²)를 넘으면 불합격 — 50000/143 = 349.65', () => {
      const r = run('ground-conductor', { faultCurrent: 50000, clearingTime: 1, conductor: 'Cu', insulation: 'PVC' });
      close(r.value, 349.65);
      expect(r.verdict()).toBe(false);
    });
  });

  describe('transformer-efficiency', () => {
    it('99.3% 는 95% 기준 이상 — 합격', () => {
      expect(run('transformer-efficiency', { capacity: 500, noLoadLoss: 500, loadLoss: 3000, loadRatio: 0.75, powerFactor: 0.85 }).verdict()).toBe(true);
    });
    // Pout = 100·0.85·0.75·1000 = 63,750 W, 손실 = 5000 + 10000·0.75² = 10,625 W
    it('85.71% 는 95% 기준 미만 — 불합격', () => {
      const r = run('transformer-efficiency', { capacity: 100, noLoadLoss: 5000, loadLoss: 10000, loadRatio: 0.75, powerFactor: 0.85 });
      close(r.value, 85.71);
      expect(r.verdict()).toBe(false);
    });
  });

  // 기동배수는 최대가 DOL 7 배이고 전압강하 = 배수 × 2 이므로 상한이 14% 다.
  // 한계는 15% — 즉 이 판정은 **어떤 입력으로도 불합격이 나오지 않는다**.
  // 잠금은 합격 방향만 걸 수 있다. 도달 불가 자체는 별도 안건이다.
  it('starting-current DOL 14% 는 15% 한계 이내 — 합격', () => {
    const r = run('starting-current', { ratedPower: 11, voltage: 380, efficiency: 0.9, powerFactor: 0.85, startingMethod: 'DOL' });
    expect(r.verdict()).toBe(true);
  });
});

/**
 * **영수증 '풀이 과정' 값에도 눈금을 박는다 — vt-sizing.**
 *
 * 이 파일 머리말(run 헬퍼 주석)이 예고한 구멍을 실측으로 확인했다.
 * 변이(2026-07-29 · 표시 단계 값에 배수를 곱함):
 *
 *   vt-sizing 변성비·총부담·표준정격·등급한계 → 전체 3,359 개 초록
 *   ct-sizing · breaker-sizing · cable-impedance 1단계 → 전체 3,359 개 초록
 *
 * 즉 화면에 뜨는 풀이 값은 대체로 **아무도 재지 않는다.** 최종 `value` 와
 * `additionalOutputs` 만 잠겨 있어, 중간 표시가 틀려도 총합만 맞으면 통과한다.
 * 실무자는 그 중간값으로 검산하고, 표준 VT 정격은 발주 값이기도 하다.
 *
 * 기대값은 손계산이다:
 *   V₁ = 22,900 V (L-L) · n = 22900/110 = 208.18
 *   ΣB = 15+10+2 = 27 VA · 표준 정격 = 27 이상 최소값 = 30 VA
 *   등급 0.5 부담 한계 = 50 VA
 *
 * L-G 결선(1차 상전압 13,221.3 V·변성비)은 위쪽 'vt-sizing L-G 22.9kV'
 * 케이스가 이미 잠근다 — 되풀이하지 않는다.
 *
 * 남은 잔여: 나머지 계산기의 표시 단계는 아직 눈금이 없다. 표본 3종을 변이로
 * 확인했고, 전수는 손계산 값이 그만큼 필요해 이번 배치에 넣지 않았다.
 */
describe('vt-sizing — 풀이 단계의 절대 눈금', () => {
  const base = {
    systemVoltage: 22900,
    secondaryVoltage: 110,
    meterBurden: 15,
    relayBurden: 10,
    wireBurden: 2,
    accuracyClass: '0.5',
    connectionType: 'line-to-line',
  };

  it.each([
    [1, 22900, 'VT 1차 전압'],
    [2, 208.18, '변성비'],
    [3, 27, '총 부담'],
    [4, 30, '표준 VT 정격'],
    [5, 50, '등급 0.5 부담 한계'],
  ])('step %d = %s (%s)', (n, expected) => {
    const { step } = run('vt-sizing', base);
    expect(step(n as number)).toBeCloseTo(expected as number, 1);
  });
});

/**
 * **ct-sizing — 풀이 6 단계 전부 손계산으로 잠근다.**
 *
 * 앞 배치에서 이 계산기의 1 단계 표시값을 오염시켜도 전체 스위트가 초록인 것을
 * 확인했다. CT 정격부담은 보호계전기가 포화 없이 동작하느냐를 가르고, 리드선
 * 부담은 현장에서 케이블 길이로 실제 조정하는 값이다 — 화면에 뜨는 그 숫자를
 * 실무자가 그대로 검산에 쓴다.
 *
 * 손계산(ρ_Cu = 0.0178 Ω·mm²/m · I₂ = 5 A · 왕복 2배):
 *   R_lead = 2ρL/A = 2×0.0178×20/4 = 0.1780 Ω
 *   VA_lead = I₂²·R = 25 × 0.1780 = 4.45 VA
 *   VA_contact = 25 × 0.1 = 2.50 VA
 *   ΣVA = 10 + 4.45 + 2.50 = 16.95 VA
 *   정격부담 = 0.5 급 [2.5, 5, 10, 15, 30] 중 16.95 이상 최소 = 30 VA
 *   여유율 = (30 − 16.95)/30 × 100 = 43.5 %
 */
describe('ct-sizing — 풀이 단계의 절대 눈금', () => {
  const input = {
    maxLoadCurrent: 200,
    relayBurden: 10,
    leadLength: 20,
    leadSize: 4,
    accuracyClass: '0.5',
  };

  it.each([
    [2, 4.45, '리드선 부담 (VA)'],
    [3, 2.50, '접촉저항 부담 (VA)'],
    [4, 16.95, '총 실제 부담 (VA)'],
    [5, 30, 'CT 정격부담 (VA)'],
    [6, 43.5, '여유율 (%)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('ct-sizing', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  /** 1 단계는 CT 비 문자열이라 숫자 단언 대상이 아니다 — 최종 value 가 잠근다. */
  it('CT 1차는 200×1.25=250 이상 최소 표준값 250', () => {
    const { value } = run('ct-sizing', input);
    expect(value).toBe(250);
  });
});

/**
 * **breaker-sizing — 협조 조건 Ib ≤ In ≤ Iz 를 단계별로 잠근다.**
 *
 * 이 계산기의 표시 단계도 오염 변이에 전체 스위트가 초록이었다. 여기서 화면에
 * 뜨는 값은 **차단기 발주 사양**이다: 정격전류·차단용량 둘 다 그대로 주문서로
 * 간다. 차단용량이 모자란 차단기는 사고 시 스스로 파괴된다.
 *
 * 손계산(부하 100 A · Isc 10 kA · 380 V · 케이블 허용 150 A):
 *   step1 최소 정격 = Ib = 100 A
 *   step2 표준 MCCB = [15…800] 중 100 이상 최소 = 100 A
 *   step3 협조 확인 = 케이블 허용전류 Iz = 150 A (100 ≤ 100 ≤ 150 → 성립)
 *   step4 필요 차단용량 = 10 kA
 *   step5 표준 차단용량 = [10,16,25,36,50,65,85,100] 중 10 이상 최소 = 10 kA
 *
 * 경계에 정확히 걸리는 입력이다 — `>=` 를 `>` 로 바꾸면 한 단계 큰 규격을
 * 집어 과설계가 되고, 그 회귀가 여기서 드러난다.
 */
describe('breaker-sizing — 풀이 단계의 절대 눈금', () => {
  const input = { loadCurrent: 100, shortCircuitCurrent: 10, voltage: 380, cableAmpacity: 150 };

  it.each([
    [1, 100, '최소 정격전류 (A)'],
    [2, 100, '표준 MCCB 정격 (A)'],
    [3, 150, '케이블 허용전류 Iz (A)'],
    [4, 10, '필요 차단용량 (kA)'],
    [5, 10, '표준 차단용량 (kA)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('breaker-sizing', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  /** Iz 를 안 주면 협조 단계가 빠지고 번호가 당겨진다 — 그 분기도 고정한다. */
  it('케이블 허용전류가 없으면 협조 단계 없이 4단계다', () => {
    const { step } = run('breaker-sizing', { loadCurrent: 100, shortCircuitCurrent: 10, voltage: 380 });
    expect(step(3)).toBeCloseTo(10, 2);  // 필요 차단용량이 3단계로 당겨진다
    expect(step(4)).toBeCloseTo(10, 2);  // 표준 차단용량
  });
});

/**
 * **short-circuit — 임피던스 사슬 5 단계를 손계산으로 잠근다.**
 *
 * 이 값은 차단기 차단용량 선정의 근거다. 중간 임피던스가 틀리면 최종 kA 가
 * 맞아 보여도 다른 조건에서 무너진다 — 특히 케이블 저항과 리액턴스는 길이·
 * 굵기에 따라 현장에서 매번 바뀌는 항이다.
 *
 * 손계산(380 V · TR 1000 kVA · %Z 5 · Cu 95 sq · 50 m ·
 *        ρ = 0.017241 Ω·mm²/m · X = 0.08 Ω/km · κ_LV = 1.8):
 *   Z_source = (380²/1,000,000) × 0.05          = 0.007220 Ω
 *   R_cable  = (0.017241×1000/95) × 0.050       = 0.009074 Ω
 *   X_cable  = 0.08 × 0.050                     = 0.004000 Ω
 *   Z_cable  = √(0.009074² + 0.004²)            = 0.009917 Ω
 *   Z_total                                     = 0.017137 Ω
 *   I_sc = 380/(√3 × 0.017137)                  = 12,802.5 A = 12.80 kA
 *   i_p  = κ√2·I_k = 1.8 × 1.41421 × 12.8025    = 32.59 kA
 *
 * 차단기는 대칭 실효값(12.80 kA)이 아니라 **피크값(32.59 kA)** 도 견뎌야
 * 한다 — 그 값이 화면에 뜨는데 아무도 재지 않고 있었다.
 */
describe('short-circuit — 임피던스 사슬의 절대 눈금', () => {
  const input = {
    systemVoltage: 380,
    transformerCapacity: 1000,
    impedancePercent: 5,
    cableLength: 50,
    cableSize: 95,
    conductor: 'Cu',
  };

  it.each([
    [1, 0.007220, 'TR 임피던스 (Ω)'],
    [2, 0.009917, '케이블 임피던스 (Ω)'],
    [3, 0.017137, '합성 임피던스 (Ω)'],
    [4, 12802.5, '단락전류 (A)'],
    [5, 12.80, '단락전류 (kA)'],
    [6, 32.59, '피크 단락전류 (kA)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('short-circuit', input);
    expect(step(n as number)).toBeCloseTo(expected as number, expected as number < 1 ? 5 : 1);
  });
});

/**
 * **cable-sizing — 5 단계 전부. 표를 베끼지 않는 눈금으로 잠근다.**
 *
 * 변이 실측: 다섯 단계 값을 각각 오염시켜도 전체 3,382 개가 초록이었다.
 * 화면에 뜨는 보정계수는 실무자가 "왜 이 굵기냐" 를 따질 때 보는 값이고,
 * 굵기 자체는 발주 수량이 된다.
 *
 * 기대값의 근거를 셋으로 나눈다 — 구현의 표를 그대로 옮겨 적지 않기 위해서다:
 *
 *  ① **정의**: 기준 조건(주위 30 ℃ · 단독 포설)에서 보정계수는 1.00 이다.
 *     표를 몰라도 참이다. 어긋나면 기준점 자체가 틀린 것이다.
 *  ② **항등식**: I_required = I / (Kt × Kg). 표 값이 무엇이든 성립해야 한다.
 *     그래서 감온·다조 조건에서도 잰다.
 *  ③ **공개 표 + 손계산**: 100 A · Cu · XLPE · 공사방법 C → 25 mm²
 *     (IEC 60364-5-52 Table B.52.4, 3 심 XLPE Cu C 법 25 mm² ≈ 101 A).
 *     전압강하는 손계산이다:
 *       R = 0.017241×1000/25 = 0.68964 Ω/km
 *       Z = 0.68964×0.9 + 0.08×0.43589 = 0.65555
 *       e = √3×100×50×0.65555/1000 = 5.6772 V → 5.6772/380 = 1.494 %
 */
describe('cable-sizing — 풀이 단계의 절대 눈금', () => {
  const base = {
    current: 100,
    length: 50,
    voltage: 380,
    conductor: 'Cu',
    insulation: 'XLPE',
    installation: 'C',
    powerFactor: 0.9,
    phase: 3,
  };

  it.each([
    [1, 1, '온도 보정계수 (기준 30 ℃ → 1.00)'],
    [2, 1, '다조 보정계수 (단독 → 1.00)'],
    [3, 100, '보정 전 필요 허용전류 = I/(Kt·Kg) = 100 A'],
    [4, 25, '최소 굵기 (IEC 60364-5-52 C 법)'],
    [5, 1.494, '전압강하 % (손계산)'],
  ])('기준 조건 step %d = %s — %s', (n, expected) => {
    const { step } = run('cable-sizing', { ...base, ambientTemp: 30, groupCount: 1 });
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  /**
   * ② 항등식 — 표 값이 무엇이든 성립한다. 보정계수를 곱셈이 아니라 덧셈으로
   * 잘못 쓰거나 한쪽을 빠뜨리면 여기서 깨진다.
   */
  it('감온·다조 조건에서 I_required = I / (Kt × Kg) 가 성립한다', () => {
    const { step } = run('cable-sizing', { ...base, ambientTemp: 45, groupCount: 4 });
    const Kt = step(1);
    const Kg = step(2);
    expect(Kt).toBeLessThan(1);           // 주위온도가 높으면 내려간다
    expect(Kg).toBeLessThan(1);           // 다조 포설이면 내려간다
    expect(step(3)).toBeCloseTo(100 / (Kt * Kg), 2);
  });

  /** 보정이 걸리면 굵기는 절대 얇아지지 않는다 — 방향만 보는 안전 불변식. */
  it('보정 조건이 나빠지면 굵기가 얇아지지 않는다', () => {
    const easy = run('cable-sizing', { ...base, ambientTemp: 30, groupCount: 1 });
    const hard = run('cable-sizing', { ...base, ambientTemp: 45, groupCount: 4 });
    expect(hard.step(4)).toBeGreaterThanOrEqual(easy.step(4));
  });
});

/**
 * **earth-fault — 접촉전압까지 4 단계. 사람이 감전되느냐를 가르는 값이다.**
 *
 * 변이 실측: 네 단계를 각각 오염시켜도 전체 3,389 개가 초록이었다.
 * 접촉전압은 KEC 142 의 50 V(일반)·25 V(습윤) 한계와 직접 비교되는 값이고,
 * 보폭전압은 접지망 설계를 바꾸는 근거다.
 *
 * 손계산(380 V · Zs 0.05 Ω · Zg 0.5 Ω):
 *   V_ph = 380/√3 = 219.39 V
 *   [직접접지] Z = Zs + Zg = 0.55        → I_g = 219.39/0.55   = 398.90 A
 *   [저항접지] Z = √(0.05² + 0.5²) = 0.50249 → I_g = 219.39/0.50249 = 436.61 A
 *   V_touch = I_g × Zg · V_step = V_touch × 0.2
 *
 * 두 접지 방식의 합성이 **직렬합 vs 제곱합**으로 갈린다는 점이 핵심이다.
 * 한쪽 식을 다른 쪽에 쓰면 값이 9% 어긋나는데, 최종 판정이 같은 구간에
 * 떨어지면 아무도 모른다.
 */
describe('earth-fault — 풀이 단계의 절대 눈금', () => {
  const base = { systemVoltage: 380, groundImpedance: 0.5, sourceImpedance: 0.05 };

  it.each([
    [1, 219.39, '상전압 (V)'],
    [2, 398.90, '지락전류 — 직접접지 Zs+Zg (A)'],
    [3, 199.45, '접촉전압 = Ig×Zg (V)'],
    [4, 39.89, '보폭전압 = 접촉전압×0.2 (V)'],
  ])('직접접지 step %d = %s — %s', (n, expected) => {
    const { step } = run('earth-fault', { ...base, groundingType: 'solid' });
    expect(step(n as number)).toBeCloseTo(expected as number, 1);
  });

  it.each([
    [2, 436.61, '지락전류 — 저항접지 √(Zs²+Zg²) (A)'],
    [3, 218.30, '접촉전압 (V)'],
  ])('저항접지 step %d = %s — %s', (n, expected) => {
    const { step } = run('earth-fault', { ...base, groundingType: 'resistance' });
    expect(step(n as number)).toBeCloseTo(expected as number, 1);
  });

  /**
   * 두 방식이 **같은 값을 내면** 한쪽 분기가 죽은 것이다 — 실제로는 직렬합이
   * 제곱합보다 크므로 직접접지 쪽 전류가 더 작아야 한다.
   */
  it('직접접지와 저항접지가 서로 다른 식을 쓴다', () => {
    const solid = run('earth-fault', { ...base, groundingType: 'solid' }).step(2);
    const res = run('earth-fault', { ...base, groundingType: 'resistance' }).step(2);
    expect(solid).not.toBeCloseTo(res, 1);
    expect(solid).toBeLessThan(res);
  });
});
