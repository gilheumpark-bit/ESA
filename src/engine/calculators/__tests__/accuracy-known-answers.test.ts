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

/**
 * **lightning-protection — IEC 62305-3 표를 공표값으로 잠근다.**
 *
 * 변이 실측: 네 단계를 각각 오염시켜도 전체 3,396 개가 초록이었다.
 * 회전구체 반경과 메시 간격은 **표에서 그대로 읽는 값**이라 오타 한 글자가
 * 곧 오답이고, 검사가 없으면 영원히 안 드러난다.
 *
 * 기대값은 IEC 62305-3 공표값이다(구현 표를 옮겨 적은 것이 아니다):
 *   LPL   회전구체 r   메시 간격
 *    I      20 m        5 m
 *    II     30 m       10 m
 *    III    45 m       15 m
 *    IV     60 m       20 m
 *
 * 보호각은 사정이 다르다. IEC Fig 3 은 곡선인데 구현은 직선 근사
 * `α = α_base × (1 − 0.8·h/h_limit)` 를 쓴다고 주석에 선언한다. 그래서 이
 * 검사는 **선언된 근사식을 고정할 뿐 표준값을 승인하지 않는다** — 곡선으로
 * 바꿀지는 개발자 판단이다.
 *   LPL II · h 15 m: α = 35 × (1 − 0.8×0.5) = 21.0°
 */
describe('lightning-protection — IEC 62305-3 표와 근사식', () => {
  it.each([
    ['I', 20, 5],
    ['II', 30, 10],
    ['III', 45, 15],
    ['IV', 60, 20],
  ])('LPL %s — 회전구체 %d m · 메시 %d m (IEC 62305-3)', (lpl, radius, mesh) => {
    const { step } = run('lightning-protection', {
      buildingHeight: 15, lplClass: lpl, method: 'sphere',
    });
    expect(step(1)).toBeCloseTo(radius as number, 2);
    expect(step(3)).toBeCloseTo(mesh as number, 2);
  });

  it('보호각은 선언된 직선 근사를 따른다 — LPL II · h 15 m → 21.0°', () => {
    const { step } = run('lightning-protection', {
      buildingHeight: 15, lplClass: 'II', method: 'angle',
    });
    expect(step(1)).toBeCloseTo(35, 1);    // 기준 보호각
    expect(step(2)).toBeCloseTo(21.0, 1);  // 높이 보정 후
  });

  /**
   * 높이가 한계에 닿으면 보정이 멈춘다(`min(h/limit, 1)`). 상한을 안 걸면
   * 보호각이 음수로 내려가 "보호 범위 없음" 이 아니라 헛값이 된다.
   */
  it('높이가 한계를 넘어도 보호각이 음수로 가지 않는다', () => {
    const { step } = run('lightning-protection', {
      buildingHeight: 200, lplClass: 'II', method: 'angle',
    });
    expect(step(2)).toBeCloseTo(7.0, 1);   // 35 × (1 − 0.8×1) = 7
    expect(step(2)).toBeGreaterThanOrEqual(0);
  });
});

/**
 * **rcd-sizing — 감전 보호 4 단계.**
 *
 * 변이 실측: 네 단계를 오염시켜도 전체 3,402 개가 초록이었다.
 * 최대 허용 접지저항은 "이 접지로 이 RCD 를 쓸 수 있는가" 를 가르는 값이고,
 * 습윤 장소(욕실·옥외)는 한계가 50 V 가 아니라 **25 V** 라 절반으로 떨어진다.
 * 그 분기가 뒤바뀌면 욕실에 두 배 느슨한 기준이 적용된다.
 *
 * 손계산:
 *   socket  : 감도 30 mA · 한계 50 V → R_max = 50/0.03  = 1,666.67 Ω
 *   outdoor : 감도 30 mA · 한계 25 V → R_max = 25/0.03  =   833.33 Ω
 *   motor   : 감도 100 mA · 한계 50 V → R_max = 50/0.10 =   500.00 Ω
 *   접촉전압 V_t = (감도/1000) × R_e — socket · R_e 10 Ω → 0.30 V
 */
describe('rcd-sizing — 풀이 단계의 절대 눈금', () => {
  it.each([
    ['socket', 30, 0.30, 1666.67],
    ['outdoor', 30, 0.30, 833.33],
    ['motor', 100, 1.00, 500.00],
  ])('%s: 감도 %d mA · 접촉전압 %s V · R_max %s Ω', (circuit, mA, vt, rmax) => {
    const { step } = run('rcd-sizing', { circuitType: circuit, loadCurrent: 16, earthResistance: 10 });
    expect(step(1)).toBeCloseTo(mA as number, 2);
    expect(step(3)).toBeCloseTo(vt as number, 2);
    expect(step(4)).toBeCloseTo(rmax as number, 1);
  });

  /** 습윤 장소가 일반과 같은 한계를 쓰면 이 검사가 깨진다. */
  it('습윤 장소(옥외·욕실)는 일반보다 허용 접지저항이 낮다', () => {
    const dry = run('rcd-sizing', { circuitType: 'socket', loadCurrent: 16, earthResistance: 10 }).step(4);
    const wet = run('rcd-sizing', { circuitType: 'bathroom', loadCurrent: 16, earthResistance: 10 }).step(4);
    expect(wet).toBeLessThan(dry);
    expect(wet).toBeCloseTo(dry / 2, 1);   // 25 V 대 50 V
  });

  it('정격은 부하전류 이상 최소 표준값 — 16 A 부하 → 16 A', () => {
    const { step } = run('rcd-sizing', { circuitType: 'socket', loadCurrent: 16, earthResistance: 10 });
    expect(step(2)).toBeCloseTo(16, 2);
  });
});

/**
 * **motor-capacity — 축동력에서 정격전류까지 4 단계.**
 *
 * 변이 실측: 네 단계를 오염시켜도 전체 3,402 개가 초록이었다.
 * 선정 kW 는 발주 사양이고, 정격전류는 그 뒤 차단기·케이블 굵기의 입력이 된다.
 *
 * 손계산(회전형 · T 100 N·m · n 1750 rpm · η 0.9 · 380 V · pf 0.85):
 *   P_shaft = T·n/9550 = 100×1750/9550       = 18.3246 kW
 *   P_input = P/η      = 18.3246/0.9          = 20.3607 kW
 *   표준 정격 = 20.3607 이상 최소값            = 22 kW
 *   I = 22,000/(√3×380×0.85×0.9)              = 43.69 A
 *
 * 상수 9550 은 `P[kW] = T[N·m]·n[rpm]/9550` 의 단위 환산항이다
 * (= 60,000/2π). 이 값이 흔들리면 모든 회전 부하 계산이 함께 틀어진다.
 */
describe('motor-capacity — 풀이 단계의 절대 눈금', () => {
  const input = {
    loadType: 'rotary',
    torqueOrForce: 100,
    speedOrVelocity: 1750,
    efficiency: 0.9,
    voltage: 380,
    powerFactor: 0.85,
  };

  it.each([
    [1, 18.3246, '축동력 (kW)'],
    [2, 20.3607, '입력 동력 = P/η (kW)'],
    [3, 22, '표준 정격 (kW)'],
    [4, 43.69, '정격전류 (A)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('motor-capacity', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  /** 9550 은 60,000/2π 다 — 환산항이 흔들리면 회전 부하 전체가 틀어진다. */
  it('환산 상수가 60000/2π 와 일치한다', () => {
    const { step } = run('motor-capacity', input);
    expect(step(1)).toBeCloseTo((100 * 1750) / (60_000 / (2 * Math.PI)), 2);
  });
});

/**
 * **ground-conductor — 보호도체 굵기(IEC 60364-5-54 단열식).**
 *
 * 변이 실측: 세 단계를 오염시켜도 전체 3,412 개가 초록이었다.
 * 보호도체가 가늘면 지락 시 도체가 먼저 녹아 **접지가 끊긴 채로 기기가
 * 충전된다.** 굵기는 그대로 발주 값이기도 하다.
 *
 * k 계수는 IEC 60364-5-54 공표값이다(구현 표를 옮겨 적은 것이 아니다):
 *   PVC  Cu 143 · Al 95      XLPE/EPR Cu 176 · Al 116      나도체 Cu 159 · Al 105
 *
 * 손계산(지락 5,000 A · 차단 0.4 s · Cu · PVC):
 *   A_min = I√t/k = 5000 × 0.63246 / 143 = 22.11 mm² → 표준 25 mm²
 */
describe('ground-conductor — IEC 60364-5-54 단열식', () => {
  it.each([
    ['PVC', 143, 22.11, 25],
    ['XLPE', 176, 17.97, 25],
    ['bare', 159, 19.89, 25],
  ])('Cu · %s: k=%d → A_min %s mm² → 표준 %d mm²', (ins, k, amin, sel) => {
    const { step } = run('ground-conductor', {
      faultCurrent: 5000, clearingTime: 0.4, conductor: 'Cu', insulation: ins,
    });
    expect(step(1)).toBeCloseTo(k as number, 2);
    expect(step(2)).toBeCloseTo(amin as number, 1);
    expect(step(3)).toBeCloseTo(sel as number, 2);
  });

  /** 알루미늄은 k 가 작아 같은 조건에서 더 굵어야 한다 — 방향 불변식. */
  it('알루미늄은 구리보다 굵어야 한다', () => {
    const cu = run('ground-conductor', { faultCurrent: 5000, clearingTime: 0.4, conductor: 'Cu' }).step(2);
    const al = run('ground-conductor', { faultCurrent: 5000, clearingTime: 0.4, conductor: 'Al' }).step(2);
    expect(al).toBeGreaterThan(cu);
  });

  /** 차단시간이 4 배면 굵기는 2 배다(√t) — 지수를 1 로 바꾸면 깨진다. */
  it('A_min 은 차단시간의 제곱근에 비례한다', () => {
    const t1 = run('ground-conductor', { faultCurrent: 5000, clearingTime: 0.1, conductor: 'Cu' }).step(2);
    const t4 = run('ground-conductor', { faultCurrent: 5000, clearingTime: 0.4, conductor: 'Cu' }).step(2);
    expect(t4).toBeCloseTo(t1 * 2, 1);
  });
});

/**
 * **surge-arrester — MCOV·정격전압·공칭방전전류.**
 *
 * 변이 실측: 네 단계를 오염시켜도 전체 3,412 개가 초록이었다.
 * MCOV 가 낮으면 피뢰기가 상시 전압에서 열폭주로 파괴되고, 높으면 보호가
 * 안 된다. 중성점 접지 방식에 따라 √3 이 붙느냐가 갈리는 것이 핵심이다.
 *
 * 손계산(22.9 kV):
 *   유효(solid)     U_c = 1.05 × 22.9/√3 = 13.88 kV → U_r = ×1.25 = 17.35 kV
 *   임피던스        U_c = 1.25 × 22.9/√3 = 16.53 kV → U_r =        20.66 kV
 *   비접지          U_c = 1.05 × 22.9    = 24.04 kV → U_r =        30.06 kV
 *   공칭방전전류: 22.9 ≤ 36 kV 구간 → 5 kA
 *   창거리 계수(IEC 60815): 중오염 25 mm/kV
 *
 * **비접지는 √3 을 나누지 않는다** — 1선 지락 시 건전상이 선간전압까지
 * 올라가기 때문이다. 이 분기가 뒤집히면 MCOV 를 1/√3 로 과소 산정한다.
 */
describe('surge-arrester — 중성점 접지 방식별 MCOV', () => {
  const base = { systemVoltage: 22900, pollutionLevel: 'heavy' };

  it.each([
    ['solid', 13.88, 17.35],
    ['impedance', 16.53, 20.66],
    ['ungrounded', 24.04, 30.06],
  ])('%s: MCOV %s kV → 정격 %s kV', (grounding, mcov, ur) => {
    const { step } = run('surge-arrester', { ...base, neutralGrounding: grounding });
    expect(step(1)).toBeCloseTo(mcov as number, 1);
    expect(step(2)).toBeCloseTo(ur as number, 1);
  });

  it('공칭방전전류 5 kA(≤36 kV) · 창거리 25 mm/kV(중오염)', () => {
    const { step } = run('surge-arrester', { ...base, neutralGrounding: 'solid' });
    expect(step(3)).toBeCloseTo(5, 2);
    expect(step(4)).toBeCloseTo(25, 2);
  });

  /** 비접지가 유효접지와 같은 값을 내면 √3 분기가 죽은 것이다. */
  it('비접지는 유효접지보다 MCOV 가 √3 배 높다', () => {
    const solid = run('surge-arrester', { ...base, neutralGrounding: 'solid' }).step(1);
    const ung = run('surge-arrester', { ...base, neutralGrounding: 'ungrounded' }).step(1);
    expect(ung).toBeCloseTo(solid * Math.sqrt(3), 1);
  });
});

/**
 * **relay-basic — 과전류 계전기 정정 3 단계.**
 *
 * 변이 실측: 세 단계를 오염시켜도 전체 3,422 개가 초록이었다.
 * 픽업이 낮으면 정상 부하에서 오동작해 정전을 만들고, 높으면 고장을 못 잡는다.
 * **2 차 환산값이 실제로 계전기에 넣는 정정값**이라 CT 비를 잘못 나누면
 * 현장에서 그대로 오정정된다.
 *
 * 손계산(부하 200 A · 고장 4,000 A · CT 300/5 → CTR 60):
 *   I_pickup = 200 × 1.3 = 260 A          (여유율 1.3 배)
 *   2 차 환산 = 260/60 × 5 = 21.67 A       (5 A 계전기 기준)
 *   고장 배수 = 4,000/260 = 15.38
 */
describe('relay-basic — 정정값의 절대 눈금', () => {
  const input = { loadCurrent: 200, faultCurrent: 4000, ctRatio: 60, curveType: 'SI' };

  it.each([
    [1, 260, '픽업 전류 (A)'],
    [2, 21.67, 'CT 2차 환산 (A)'],
    [3, 15.38, '고장 배수'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('relay-basic', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  /** CT 비를 곱하면 정정값이 CTR² 배로 틀어진다 — 나눗셈임을 못 박는다. */
  it('CT 비가 커지면 2차 환산값은 작아진다', () => {
    const low = run('relay-basic', { ...input, ctRatio: 60 }).step(2);
    const high = run('relay-basic', { ...input, ctRatio: 120 }).step(2);
    // 표시값이 소수 2자리로 반올림되므로(21.67/2 = 10.835 → 10.83) 여유를 둔다.
    expect(high).toBeCloseTo(low / 2, 1);
  });
});

/**
 * **starting-current — 기동 방식별 배율과 전압강하.**
 *
 * 변이 실측: 네 단계를 오염시켜도 전체 3,422 개가 초록이었다.
 * 기동 배율은 차단기 순시 정정을 넘기지 않게 잡는 근거이고, 기동 전압강하는
 * 같은 모선의 다른 부하가 재기동하느냐를 가른다.
 *
 * 손계산(22 kW · 380 V · pf 0.85 · η 0.9):
 *   I_rated = 22,000/(√3×380×0.85×0.9) = 43.69 A
 *   DOL k=7      → 305.85 A · 강하 14.0 %
 *   Star-Delta k=2.5 → 109.23 A · 강하  5.0 %
 *   VFD k=1.2    →  52.43 A · 강하  2.4 %
 *   Soft k=3     → 131.08 A · 강하  6.0 %
 *
 * 배율표는 실무 통용값(DOL 6~8 · Y-Δ 2~3 · VFD 1~1.5 · 소프트 2~4)의 대표값이다.
 * 전압강하는 `k × 2 %` 로 단순화한 근사라고 코드에 선언돼 있다 — 이 검사는
 * **선언된 근사를 고정할 뿐 계통 임피던스 기반 계산을 승인하지 않는다.**
 */
describe('starting-current — 기동 방식별 절대 눈금', () => {
  const base = { ratedPower: 22, voltage: 380, powerFactor: 0.85, efficiency: 0.9 };

  it.each([
    ['DOL', 7, 305.85, 14.0],
    ['Star-Delta', 2.5, 109.23, 5.0],
    ['VFD', 1.2, 52.43, 2.4],
    ['Soft-Starter', 3, 131.08, 6.0],
  ])('%s: k=%s → 기동 %s A · 강하 %s %%', (method, k, ist, drop) => {
    const { step } = run('starting-current', { ...base, startingMethod: method });
    expect(step(1)).toBeCloseTo(43.69, 1);          // 정격전류는 방식과 무관
    expect(step(2)).toBeCloseTo(k as number, 2);
    expect(step(3)).toBeCloseTo(ist as number, 1);
    expect(step(4)).toBeCloseTo(drop as number, 2);
  });

  /** 감압 기동이 DOL 보다 크면 표가 뒤집힌 것이다 — 방향 불변식. */
  it('감압 기동은 DOL 보다 기동전류가 작다', () => {
    const dol = run('starting-current', { ...base, startingMethod: 'DOL' }).step(3);
    for (const m of ['Star-Delta', 'VFD', 'Soft-Starter']) {
      expect(run('starting-current', { ...base, startingMethod: m }).step(3)).toBeLessThan(dol);
    }
  });
});

/**
 * **equipotential-bonding — 주 등전위 본딩 도체(IEC 60364-5-54 §544.1.1).**
 *
 * 변이 실측: 네 단계를 오염시켜도 전체 3,431 개가 초록이었다.
 * 등전위 본딩은 서로 다른 계통 사이의 전위차를 없애 **사람이 두 금속을 동시에
 * 만졌을 때 감전되지 않게** 하는 도체다. 규칙은 세 조각이고 각각 다른 구간에서
 * 지배한다 — PE 의 50 % · 하한 6 mm² · 상한 25 mm²(Cu 기준).
 *
 * 세 조각이 **실제로 각각 지배하는** 입력으로 잡는다. 하나만 재면 나머지 둘이
 * 죽어도 안 드러난다:
 *   PE  10 mm² → 50 % = 5.00  → 하한 6 이 지배   → 6 mm²
 *   PE  50 mm² → 50 % = 25.00 → 어느 것도 안 걸림 → 25 mm²
 *   PE 120 mm² → 50 % = 60.00 → 상한 25 가 지배  → 25 mm²
 */
describe('equipotential-bonding — 하한·상한이 각각 지배하는 구간', () => {
  it.each([
    [10, 5, 6, 6],
    [50, 25, 25, 25],
    [120, 60, 60, 25],
  ])('PE %d mm²: 50%% %s → 하한후 %s → 상한후 %s', (pe, half, floor, capped) => {
    const { step } = run('equipotential-bonding', { largestPE: pe });
    expect(step(1)).toBeCloseTo(half as number, 2);
    expect(step(2)).toBeCloseTo(floor as number, 2);
    expect(step(3)).toBeCloseTo(capped as number, 2);
    // 표준 굵기 선정까지 잰다 — 이 단계를 빼놨더니 값을 2 배로 오염시켜도
    // 통과했다(변이 실측 2026-07-29).
    expect(step(4)).toBeGreaterThanOrEqual(capped as number);
    expect(step(4)).toBeLessThanOrEqual(25);
  });

  /** 상한을 없애면 PE 가 커질수록 본딩 도체가 무한정 굵어진다. */
  it('PE 가 아무리 굵어도 25 mm² 를 넘지 않는다', () => {
    for (const pe of [120, 240, 500]) {
      expect(run('equipotential-bonding', { largestPE: pe }).step(3)).toBeCloseTo(25, 2);
    }
  });

  /** 하한이 내려가면 PE 10 mm² 구간이 6 아래로 떨어진다. */
  it('가는 PE 에서도 6 mm² 아래로 내려가지 않는다', () => {
    for (const pe of [2.5, 4, 10]) {
      expect(run('equipotential-bonding', { largestPE: pe }).step(2)).toBeGreaterThanOrEqual(6);
    }
  });
});

/**
 * **motor-pf-correction — 콘덴서 용량. 과보상은 위험하다.**
 *
 * 변이 실측: 다섯 단계를 오염시켜도 전체 3,431 개가 초록이었다.
 * 콘덴서가 무부하 여자 kvar 를 넘으면 전원 차단 후에도 전동기가 **자기여자로
 * 발전**해 잔류 전압이 남고, 재투입 시 위상이 안 맞아 축이 상한다. 그래서
 * 이 계산기는 용량만 내는 게 아니라 그 한계를 함께 낸다.
 *
 * 손계산(22 kW · 현재 pf 0.80 → 목표 0.95 · 380 V):
 *   tanφ₁ = tan(acos 0.80) = 0.75000 · tanφ₂ = tan(acos 0.95) = 0.32868
 *   Q_c = 22 × (0.75000 − 0.32868) = 9.27 kvar
 *   I₁ = 22,000/(√3×380×0.80) = 41.78 A
 *   I₂ = 22,000/(√3×380×0.95) = 35.18 A
 *   감소율 = (I₁−I₂)/I₁ = 15.8 %  ( = 1 − 0.80/0.95 · 전압·출력과 무관 )
 *   무부하 여자 kvar ≈ 22 × 0.35 = 7.70 kvar  ← Q_c 9.27 이 이를 넘는다
 */
describe('motor-pf-correction — 콘덴서 용량과 과보상 한계', () => {
  const input = { motorPower: 22, motorPF: 0.8, targetPF: 0.95, motorVoltage: 380 };

  it.each([
    [1, 9.27, '필요 콘덴서 용량 (kvar)'],
    [2, 41.78, '보정 전 전류 (A)'],
    [3, 35.18, '보정 후 전류 (A)'],
    [4, 15.8, '전류 감소율 (%)'],
    [5, 7.70, '무부하 여자 kvar'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('motor-pf-correction', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 1);
  });

  /**
   * 감소율은 역률비로만 정해진다 — 전압이나 출력을 바꿔도 같아야 한다.
   * 전류식에 √3 이나 전압을 잘못 넣으면 이 항등식이 깨진다.
   */
  it('전류 감소율은 역률비로만 정해진다 (1 − pf₁/pf₂)', () => {
    for (const [P, V] of [[7.5, 220], [75, 3300]]) {
      const { step } = run('motor-pf-correction', { ...input, motorPower: P, motorVoltage: V });
      expect(step(4)).toBeCloseTo((1 - 0.8 / 0.95) * 100, 1);
    }
  });
});

/**
 * transformer-capacity — 400 kW · cos φ 0.9 · η 0.98 · 수용률 0.8 · 여유 20 %
 *   P_demand = 400 × 0.8            = 320.00 kW
 *   S        = 320 / (0.9 × 0.98)   = 362.81 kVA
 *   S_design = 362.81 × 1.2         = 435.37 kVA
 *   표준 용량 = 435.37 이상 최초     = 500 kVA   (…300, 500, 750…)
 * step 1·3 은 화면에만 나오고 반환값에는 없어, 1.5 배로 오염시켜도 3,447 개가
 * 전부 초록이었다(변이 실측 2026-07-29). 설계자가 읽는 숫자다.
 */
describe('transformer-capacity — 수용률·여유·표준 용량 선정', () => {
  const input = { totalLoad: 400, powerFactor: 0.9, efficiency: 0.98, demandFactor: 0.8, growthMargin: 0.2 };

  it.each([
    [1, 320.0, '수용 부하 (kW)'],
    [2, 362.81, '소요 용량 (kVA)'],
    [3, 435.37, '여유 반영 (kVA)'],
    [4, 500, '선정 표준 용량 (kVA)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('transformer-capacity', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 1);
  });

  /** 여유를 빼면 362.81 kVA — 300 으로 내려가지 않고 그 위 표준인 500 을 고른다. */
  it('여유 0 이어도 경계 아래(300)로 내려가지 않는다', () => {
    const { step } = run('transformer-capacity', { ...input, growthMargin: 0 });
    expect(step(3)).toBeCloseTo(362.81, 1);
    expect(step(4)).toBe(500);
  });

  /** 최대 표준(3000)을 넘는 요구는 합격시키면 안 된다 — 못 대는 변압기다. */
  it('3000 kVA 를 넘는 요구는 FAIL', () => {
    const { verdict } = run('transformer-capacity', { ...input, totalLoad: 5000 });
    expect(verdict()).toBe(false);
  });
});

/**
 * single-phase-power — 220 V · 30 A · cos φ 0.85
 *   S = 220 × 30                      = 6,600 VA
 *   P = 6,600 × 0.85                  = 5,610 W
 *   sin φ = √(1 − 0.85²) = √0.2775    = 0.526783
 *   Q = 6,600 × 0.526783              = 3,476.77 var
 * Q 는 역률 개선 콘덴서를 고르는 근거인데, 1.5 배로 부풀려도 스위트가 초록이었다.
 */
describe('single-phase-power — 피상·유효·무효', () => {
  const input = { voltage: 220, current: 30, powerFactor: 0.85 };

  it.each([
    [1, 6600, '피상전력 (VA)'],
    [2, 5610, '유효전력 (W)'],
    [3, 3476.77, '무효전력 (var)'],
  ])('step %d = %s', (n, expected) => {
    const { step } = run('single-phase-power', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 1);
  });

  /** P² + Q² = S² — 삼각형이 닫히지 않으면 sin φ 를 잘못 쓴 것이다. */
  it('전력 삼각형이 닫힌다', () => {
    const { step } = run('single-phase-power', input);
    expect(Math.hypot(step(2), step(3))).toBeCloseTo(step(1), 1);
  });
});

/**
 * battery-capacity — 부하 10 kW · 4 시간 · 48 V · DoD 0.8 · 인버터 η 0.9 · 여유 20 %(기본)
 *   E        = 10 × 4                    = 40.00 kWh
 *   E_bat    = 40 / (0.8 × 0.9)          = 55.56 kWh
 *   C        = 55,555.6 Wh / 48 V        = 1,157.4 Ah
 *   C_권장   = 1,157.4 × 1.2             = 1,388.9 Ah
 *   E_권장   = 1,388.9 × 48 / 1,000      = 66.67 kWh
 * step 1·5 는 발주 수량과 직결되는데 오염돼도 안 잡혔다(변이 실측 2026-07-29).
 */
describe('battery-capacity — 방전심도·효율·여유', () => {
  const input = { loadPower: 10, backupTime: 4, batteryVoltage: 48, depthOfDischarge: 0.8, inverterEfficiency: 0.9 };

  it.each([
    [1, 40.0, '소요 에너지 (kWh)'],
    [2, 55.56, '배터리 에너지 (kWh)'],
    [3, 1157.4, '소요 용량 (Ah)'],
    [4, 1388.9, '권장 용량 (Ah)'],
    [5, 66.67, '권장 에너지 (kWh)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('battery-capacity', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 1);
  });

  /** DoD 를 절반으로 낮추면 필요한 용량은 정확히 두 배다 — 나눗셈 방향 확인. */
  it('DoD 를 절반으로 낮추면 용량이 두 배', () => {
    const a = run('battery-capacity', input).step(3);
    const b = run('battery-capacity', { ...input, depthOfDischarge: 0.4 }).step(3);
    expect(b).toBeCloseTo(a * 2, 0);
  });
});

/**
 * solar-generation — 100 kWp · 일조 3.5 h · PR 0.8 · 손실 10 % · 30 일/월(기본)
 *   K        = 1 − 10/100                 = 0.9
 *   E_daily  = 100 × 3.5 × 0.9 × 0.8      = 252.00 kWh/day
 *   E_month  = 252 × 30                   = 7,560.0 kWh/month
 *   E_year   = 252 × 365                  = 91,980 kWh/year
 *   이용률   = 91,980 / 100               = 920 kWh/kWp/year
 * 월 발전량과 이용률은 사업성 판단에 직접 쓰이는데 둘 다 무방비였다.
 */
describe('solar-generation — 손실·PR·이용률', () => {
  const input = { installedCapacity: 100, peakSunHours: 3.5, performanceRatio: 0.8, systemLoss: 10 };

  it.each([
    [1, 0.9, '손실 계수 (−)'],
    [2, 252.0, '일 발전량 (kWh/day)'],
    [3, 7560.0, '월 발전량 (kWh/month)'],
    [4, 91980, '연 발전량 (kWh/year)'],
    [5, 920, '이용률 (kWh/kWp/year)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('solar-generation', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 1);
  });

  /** 연 발전량은 일 발전량 × 365 여야 한다 — 월값 × 12 로 쓰면 4.2 % 모자란다. */
  it('연 발전량은 월값 × 12 가 아니라 일값 × 365 다', () => {
    const { step } = run('solar-generation', input);
    expect(step(4)).toBeCloseTo(step(2) * 365, 0);
    expect(step(4)).not.toBeCloseTo(step(3) * 12, 0);
  });
});

/**
 * nec-load-calc — 주택 200 m² · 1φ 240 V (NEC 2020)
 *
 *   조명      200 × 33 VA/m²                        = 6,600 VA   (220.12)
 *   소형가전  (2 + 1) × 1,500                        = 4,500 VA   (220.52)
 *   수요율    3,000 + (11,100 − 3,000) × 0.35        = 5,835 VA   (220.42)
 *   고정기기  (1200+1500+800+1000) × 0.75 [4 대 이상] = 3,375 VA   (220.53)
 *   전동기    (1500+750) + 1500 × 0.25               = 2,625 VA   (220.50)
 *   HVAC                                             = 5,000 VA
 *   합계                                             = 16,835 VA
 *   서비스    16,835 / 240                           =    70.1 A
 *
 * 여덟 단계가 전부 화면에만 있고 반환값에는 없어, 1.5 배로 오염시켜도
 * 스위트가 초록이었다(변이 실측 2026-07-29). 서비스 용량 산정 근거다.
 */
describe('nec-load-calc — 주택 수요 부하와 서비스 용량', () => {
  const input = {
    occupancyType: 'dwelling', area: 200,
    applianceLoads: [
      { name: 'dishwasher', va: 1200 }, { name: 'disposal', va: 1500 },
      { name: 'compactor', va: 800 }, { name: 'water-heater', va: 1000 },
    ],
    motorLoads: [1500, 750], hvacLoad: 5000, phases: 1,
  };

  it.each([
    [1, 6600, '일반 조명 (VA)'],
    [2, 4500, '소형 가전 + 세탁 (VA)'],
    [3, 5835, '수요율 적용 (VA)'],
    [4, 3375, '고정 기기 · 4 대 이상 75 % (VA)'],
    [5, 2625, '전동기 · 최대분 125 % (VA)'],
    [6, 5000, 'HVAC (VA)'],
    [7, 16835, '총 수요 (VA)'],
    [8, 70.1, '서비스 용량 (A)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('nec-load-calc', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 1);
  });

  /** 3 상은 √3 이 들어간다 — 단상 식을 그대로 쓰면 1.73 배 과대 산정된다. */
  it('3 상 208 V 는 √3 으로 나눈다', () => {
    const { step } = run('nec-load-calc', { ...input, phases: 3 });
    expect(step(7)).toBeCloseTo(16835, 0);
    expect(step(8)).toBeCloseTo(46.7, 1);
  });

  /** 기기가 3 대면 75 % 를 적용하지 않는다 — 경계에서 부하가 줄어들면 안 된다. */
  it('고정 기기 3 대에는 수요율을 적용하지 않는다 (220.53 경계)', () => {
    const three = { ...input, applianceLoads: input.applianceLoads.slice(0, 3) };
    const { step } = run('nec-load-calc', three);
    expect(step(4)).toBeCloseTo(1200 + 1500 + 800, 0);
  });
});

/**
 * cable-impedance — Cu 95 mm² · 250 m · 75 °C · 60 Hz
 *
 *   R₂₀ = 0.017241 × 1000 / 95            = 0.1815 Ω/km   (IEC 60228 · ρ = 1/58)
 *   R₇₅ = 0.1815 × [1 + 0.00393 × 55]     = 0.2207 Ω/km
 *   R   = 0.2207 × 0.25                   = 0.0552 Ω
 *   X   = 0.073 × 60/50                   = 0.0876 Ω/km   (표값은 50 Hz 기준)
 *   X   = 0.0876 × 0.25                   = 0.0219 Ω
 *   Z   = √(0.0552² + 0.0219²)            = 0.0594 Ω
 *   θ   = arctan(0.0219 / 0.0552)         = 21.65°
 *
 * 일곱 단계 중 여섯이 무방비였다. 이 값들은 전압강하와 고장전류 계산의
 * 입력으로 흘러 들어간다.
 */
describe('cable-impedance — 온도 보정과 주파수 환산', () => {
  const input = { cableSize: 95, conductor: 'Cu', length: 250, frequency: 60, temperature: 75 };

  it.each([
    [1, 0.1815, 'R₂₀ (Ω/km)'],
    [2, 0.2207, 'R₇₅ (Ω/km)'],
    [3, 0.0552, '총 저항 (Ω)'],
    [4, 0.0876, '리액턴스 60 Hz (Ω/km)'],
    [5, 0.0219, '총 리액턴스 (Ω)'],
    [6, 0.0594, '임피던스 크기 (Ω)'],
    [7, 21.65, '임피던스 각 (deg)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('cable-impedance', input);
    expect(step(n as number)).toBeCloseTo(expected as number, n === 7 ? 1 : 4);
  });

  /** 20 °C 에서는 보정이 없어야 한다 — 부호가 뒤집히면 여기서 갈린다. */
  it('20 °C 에서는 온도 보정이 항등이다', () => {
    const { step } = run('cable-impedance', { ...input, temperature: 20 });
    expect(step(2)).toBeCloseTo(step(1), 4);
  });

  /** 50 Hz 표값을 그대로 쓰는지 — 환산 방향이 뒤집히면 60/50 이 50/60 이 된다. */
  it('50 Hz 에서는 표값이 그대로 나온다', () => {
    const { step } = run('cable-impedance', { ...input, frequency: 50 });
    expect(step(4)).toBeCloseTo(0.073, 4);
  });

  /** 길이는 선형이다 — km 환산에 1000 이 빠지면 여기서 깨진다. */
  it('길이를 두 배로 하면 저항·리액턴스가 두 배', () => {
    const a = run('cable-impedance', input);
    const b = run('cable-impedance', { ...input, length: 500 });
    expect(b.step(3)).toBeCloseTo(a.step(3) * 2, 4);
    expect(b.step(5)).toBeCloseTo(a.step(5) * 2, 4);
  });
});

/**
 * voltage-drop — Cu 16 mm² · 120 m · 40 A · cos φ 0.9 · 3φ 380 V (KEC 232.3.9)
 *
 *   R      = 0.017241 × 1000 / 16          = 1.0776 Ω/km   (IEC 60228 · ρ = 1/58)
 *   sin φ  = √(1 − 0.9²)                   = 0.435890
 *   z      = 1.0776 × 0.9 + 0.08 × 0.43589 = 1.0047 Ω/km   (X 기본 0.08)
 *   e      = √3 × 40 × 0.120 × 1.0047      =   8.35 V
 *   e %    = 8.35 / 380 × 100              =   2.20 %
 *
 * 이 앱의 간판 계산기인데 네 단계가 전부 무방비였다(변이 실측 2026-07-29).
 * 3·4 단계는 반환값·additionalOutputs 와 같은 수를 보여 주지만 **따로 계산해서
 * 따로 반올림한다** — 한쪽만 고치면 화면과 결과가 어긋나고 아무도 못 잡는다.
 */
describe('voltage-drop — 저항·임피던스 계수·강하·백분율', () => {
  const input = { cableSize: 16, conductor: 'Cu', length: 120, current: 40, powerFactor: 0.9, phase: 3, voltage: 380 };

  it.each([
    [1, 1.0776, '도체 저항 (Ω/km)'],
    [2, 1.0047, '임피던스 계수 (Ω/km)'],
    [3, 8.35, '전압 강하 (V)'],
    [4, 2.20, '전압 강하율 (%)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('voltage-drop', input);
    expect(step(n as number)).toBeCloseTo(expected as number, n <= 2 ? 4 : 2);
  });

  /** 화면의 3·4 단계와 반환값이 같은 수여야 한다 — 따로 계산하는 자리다. */
  it('표시 단계와 반환값이 어긋나지 않는다', () => {
    const { step, value, extra } = run('voltage-drop', input);
    expect(step(3)).toBeCloseTo(value, 2);
    expect(step(4)).toBeCloseTo(extra.voltageDropPercent, 2);
  });

  /** 단상은 √3 이 아니라 2 다 — 왕복 도체이기 때문. 3φ 대비 2/√3 배. */
  it('단상은 계수가 2 다 (3상 대비 2/√3 배)', () => {
    const three = run('voltage-drop', input).step(3);
    const single = run('voltage-drop', { ...input, phase: 1, voltage: 220 }).step(3);
    expect(single).toBeCloseTo(three * (2 / Math.sqrt(3)), 2);
  });

  /** 한도를 넘으면 FAIL 이어야 한다 — 숫자가 맞아도 부등호가 뒤집히면 거짓말이다. */
  it('한도 초과는 FAIL', () => {
    expect(run('voltage-drop', { ...input, dropLimitPercent: 1 }).verdict()).toBe(false);
    expect(run('voltage-drop', { ...input, dropLimitPercent: 5 }).verdict()).toBe(true);
  });
});

/**
 * three-phase-vd — 380 V · 100 A · 150 m · R 0.641 · X 0.078 · cos φ 0.85
 *
 *   sin φ = √(1 − 0.85²)                     = 0.526783
 *   z     = 0.641 × 0.85 + 0.078 × 0.526783  =  0.5859 Ω/km
 *   VD    = √3 × 100 × 0.150 × 0.5859        =   15.22 V
 *   VD %  = 15.22 / 380 × 100                =    4.01 %
 *   V_r   = 380 − 15.22                      =  364.78 V
 *
 * 수전단 전압은 기기 선정의 입력인데 무방비였다.
 */
describe('three-phase-vd — 정상상태 강하와 수전단 전압', () => {
  const input = { voltage: 380, current: 100, length: 150, resistance: 0.641, reactance: 0.078, powerFactor: 0.85 };

  it.each([
    [1, 0.5859, '임피던스 계수 (Ω/km)'],
    [2, 15.22, '전압 강하 (V)'],
    [3, 4.01, '강하율 (%)'],
    [4, 364.78, '수전단 전압 (V)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('three-phase-vd', input);
    expect(step(n as number)).toBeCloseTo(expected as number, n === 1 ? 4 : 2);
  });

  /** 수전단 = 송전단 − 강하. 부호가 뒤집히면 전압이 올라간다. */
  it('수전단 전압은 송전단에서 강하를 뺀 값이다', () => {
    const { step } = run('three-phase-vd', input);
    expect(step(4)).toBeCloseTo(input.voltage - step(2), 2);
    expect(step(4)).toBeLessThan(input.voltage);
  });

  /** 리액턴스가 0 이면 계수는 R cos φ 뿐이다 — X 항이 새면 여기서 갈린다. */
  it('리액턴스 0 이면 계수는 R cos φ 다', () => {
    const { step } = run('three-phase-vd', { ...input, reactance: 0 });
    expect(step(1)).toBeCloseTo(0.641 * 0.85, 4);
  });
});

/**
 * temp-correction — PVC 70 °C 도체 · 기준 30 °C · 주변 45 °C · 기준 허용전류 100 A
 *
 *   여유    70 − 45              = 25 K
 *   기준차  70 − 30              = 40 K
 *   CF      √(25 / 40)           = 0.7906
 *   보정    100 × 0.7906         = 79.1 A
 *
 * **이 값은 표로 대조된다.** IEC 60364-5-52 Table B.52.14(PVC 70 °C, 기준 30 °C):
 *
 *   주변 35 °C  표 0.94  계산 0.9354
 *   주변 40 °C  표 0.87  계산 0.8660
 *   주변 45 °C  표 0.79  계산 0.7906
 *   주변 50 °C  표 0.71  계산 0.7071
 *
 * 즉 이 앵커는 구현을 다시 계산한 것이 아니라 **규격 표에 맞춰 본 것**이다.
 * 감소계수가 틀리면 케이블이 실제보다 굵게 보이고, 그 위에서 과열로 간다.
 */
describe('temp-correction — 온도 감소계수 (IEC 표 대조)', () => {
  const input = { baseAmpacity: 100, referenceTemp: 30, actualTemp: 45, maxConductorTemp: 70 };

  it.each([
    [1, 25, '온도 여유 (K)'],
    [2, 40, '기준 온도차 (K)'],
    [3, 0.7906, '보정 계수'],
    [4, 79.1, '보정 허용전류 (A)'],
    [5, 45, '주변 온도 (C)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('temp-correction', input);
    expect(step(n as number)).toBeCloseTo(expected as number, n === 3 ? 4 : 1);
  });

  /** IEC 60364-5-52 Table B.52.14 대조 — 표는 소수 둘째 자리로 반올림돼 있다. */
  it.each([
    [35, 0.94],
    [40, 0.87],
    [45, 0.79],
    [50, 0.71],
  ])('주변 %d °C 의 계수가 IEC 표값 %s 과 일치한다', (ambient, tabulated) => {
    const { step } = run('temp-correction', { ...input, actualTemp: ambient });
    expect(step(3)).toBeCloseTo(tabulated, 2);
  });

  /** 기준 온도에서는 보정이 없다 — 1.0 이 아니면 눈금 자체가 어긋난 것이다. */
  it('주변이 기준 온도면 계수는 1 이다', () => {
    const { step } = run('temp-correction', { ...input, actualTemp: 30 });
    expect(step(3)).toBeCloseTo(1, 4);
    expect(step(4)).toBeCloseTo(100, 1);
  });

  /** 기준보다 차가우면 계수가 1 을 넘는다 — 방향이 뒤집히면 한대지에서 과소 산정된다. */
  it('기준보다 낮은 온도에서는 계수가 1 을 넘는다', () => {
    expect(run('temp-correction', { ...input, actualTemp: 10 }).step(3)).toBeGreaterThan(1);
  });
});

/**
 * reactive-power — 유효전력 300 kW · 현재 cos φ 0.75 → 목표 0.95
 *
 *   tan φ₁ = √(1 − 0.75²) / 0.75 = 0.8819
 *   tan φ₂ = √(1 − 0.95²) / 0.95 = 0.3287
 *   Q_c    = 300 × (0.8819 − 0.3287) = 165.97 kvar
 *   Q₁     = 300 × 0.8819            = 264.58 kvar
 *   Q₂     = 300 × 0.3287            =  98.61 kvar
 *   표준 뱅크 = 165.97 이상 최초      = 200 kvar
 *
 * 콘덴서 뱅크 발주 수량이 이 다섯 줄에서 나오는데 전부 무방비였다.
 */
describe('reactive-power — 콘덴서 뱅크 용량', () => {
  const input = { activePower: 300, currentPF: 0.75, targetPF: 0.95 };

  it.each([
    [1, 0.8819, 'tan φ₁'],
    [2, 0.3287, 'tan φ₂'],
    [3, 165.97, '필요 콘덴서 (kvar)'],
    [4, 264.58, '현재 무효전력 (kvar)'],
    [5, 98.61, '목표 무효전력 (kvar)'],
    [6, 200, '선정 표준 뱅크 (kvar)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('reactive-power', input);
    expect(step(n as number)).toBeCloseTo(expected as number, n <= 2 ? 4 : 2);
  });

  /** Q₁ − Q₂ = Q_c 는 항등이다 — 세 값을 따로 계산하므로 하나가 새면 여기서 깨진다. */
  it('현재 무효 − 목표 무효 = 필요 콘덴서', () => {
    const { step } = run('reactive-power', input);
    expect(step(4) - step(5)).toBeCloseTo(step(3), 2);
  });

  /** 목표가 1.0 이면 무효분을 전부 상쇄한다 — tan(0) = 0. */
  it('목표 역률 1.0 이면 목표 무효전력이 0 이다', () => {
    const { step } = run('reactive-power', { ...input, targetPF: 1 });
    expect(step(5)).toBeCloseTo(0, 2);
    expect(step(3)).toBeCloseTo(step(4), 2);
  });

  /** 표준 뱅크는 필요량 이상이어야 한다 — 아래로 고르면 목표 역률에 못 미친다. */
  it('선정 뱅크는 필요량 이상이다', () => {
    const { step } = run('reactive-power', input);
    expect(step(6)).toBeGreaterThanOrEqual(step(3));
  });
});

/**
 * emergency-generator — 비상부하 3 종 · 안전율 1.25 · 8 시간 운전
 *
 *   정상부하  40/0.8 + 30/0.85 + 15/0.8              = 104.04 kVA
 *   최대 전동기 30/0.85 = 35.29 kVA, 기동 6 배        = 211.76 kVA
 *   기동 증분 211.76 − 35.29                          = 176.47 kVA
 *   필요용량  (104.04 + 176.47) × 1.25                = 350.64 kVA
 *   표준용량  350.64 이상 최초                        = 400 kVA
 *   연료      400 × 0.8 × 0.75 × 0.21                 =  50.4 L/h
 *   탱크      50.4 × 8                                =   403 L
 *
 * 발전기는 기동 돌입을 못 버티면 정상부하가 맞아도 시동에서 주저앉는다.
 * 그 계산이 2·3 단계인데 무방비였다(변이 실측 2026-07-29).
 */
describe('emergency-generator — 기동 돌입과 연료탱크', () => {
  const input = {
    emergencyLoads: [
      { name: '조명·콘센트', kW: 40, pf: 0.8, isMotor: false },
      { name: '소화펌프', kW: 30, pf: 0.85, isMotor: true },
      { name: '배연팬', kW: 15, pf: 0.8, isMotor: true },
    ],
    safetyFactor: 1.25,
    requiredRuntime: 8,
  };

  it.each([
    [1, 104.04, '정상부하 합 (kVA)'],
    [2, 211.76, '최대 전동기 기동 (kVA)'],
    [3, 350.64, '필요용량 (kVA)'],
    [4, 400, '표준용량 (kVA)'],
    [5, 50.4, '연료 (L/h)'],
    [6, 403, '탱크 (L)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('emergency-generator', input);
    expect(step(n as number)).toBeCloseTo(expected as number, n === 6 ? 0 : 1);
  });

  /**
   * 전동기가 없으면 기동 증분도 없어야 한다 — 정상부하 × 안전율이 전부다.
   * 기동분이 상수로 새면 여기서 잡힌다.
   */
  it('전동기가 없으면 필요용량은 정상부하 × 안전율이다', () => {
    const noMotor = {
      ...input,
      emergencyLoads: [{ name: '조명', kW: 40, pf: 0.8, isMotor: false }],
    };
    const { step } = run('emergency-generator', noMotor);
    expect(step(1)).toBeCloseTo(50, 2);
    expect(step(3)).toBeCloseTo(50 * 1.25, 2);
  });

  /** 탱크는 시간에 선형이다 — 시간이 곱해지지 않으면 여기서 갈린다. */
  it('운전 시간을 두 배로 하면 탱크도 두 배', () => {
    const a = run('emergency-generator', input).step(6);
    const b = run('emergency-generator', { ...input, requiredRuntime: 16 }).step(6);
    expect(b).toBeCloseTo(a * 2, 0);
  });

  /** 표준용량은 필요량 이상이어야 한다 — 아래로 고르면 발전기가 못 버틴다. */
  it('선정 표준용량은 필요량 이상이다', () => {
    const { step } = run('emergency-generator', input);
    expect(step(4)).toBeGreaterThanOrEqual(step(3));
  });
});

/**
 * pcs-capacity — 배터리 500 kWh · 충전 0.5C · 방전 0.8C · η 0.95 · 계통 380 V
 *
 *   충전전력  500 × 0.5                    = 250.00 kW
 *   방전전력  500 × 0.8                    = 400.00 kW
 *   PCS 용량  max(250, 400) / 0.95         = 421.05 kW
 *   충전전류  250,000 / (√3 × 380)         = 379.84 A
 *   방전전류  400,000 / (√3 × 380)         = 607.74 A
 *
 * 전류 두 값이 케이블·차단기 선정으로 바로 넘어가는데 무방비였다.
 */
describe('pcs-capacity — 충방전 전력과 계통측 전류', () => {
  const input = { batteryCapacity: 500, maxChargeRate: 0.5, maxDischargeRate: 0.8, efficiency: 0.95, gridVoltage: 380 };

  it.each([
    [1, 250.0, '충전전력 (kW)'],
    [2, 400.0, '방전전력 (kW)'],
    [3, 421.05, 'PCS 필요용량 (kW)'],
    [4, 379.84, '충전전류 (A)'],
    [5, 607.74, '방전전류 (A)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('pcs-capacity', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  /** 큰 쪽을 잡아야 한다 — 충전이 더 크면 그쪽이 기준이 된다. */
  it('충전이 더 크면 충전 기준으로 용량을 잡는다', () => {
    const { step } = run('pcs-capacity', { ...input, maxChargeRate: 1.2 });
    expect(step(3)).toBeCloseTo((500 * 1.2) / 0.95, 2);
  });

  /** 효율은 나누는 자리다 — 곱하면 용량이 작아져 PCS 가 모자라게 선정된다. */
  it('효율이 낮을수록 필요용량이 커진다', () => {
    const high = run('pcs-capacity', input).step(3);
    const low = run('pcs-capacity', { ...input, efficiency: 0.8 }).step(3);
    expect(low).toBeGreaterThan(high);
    expect(low).toBeCloseTo(400 / 0.8, 2);
  });

  /** 전류는 전압에 반비례한다 — √3 이 빠지면 1.73 배 과대 산정된다. */
  it('계통 전압을 두 배로 하면 전류는 절반', () => {
    const a = run('pcs-capacity', input).step(5);
    const b = run('pcs-capacity', { ...input, gridVoltage: 760 }).step(5);
    expect(b).toBeCloseTo(a / 2, 2);
  });
});

/**
 * transformer-efficiency — 1,000 kVA · 무부하손 1,200 W · 부하손 10,000 W ·
 *                          cos φ 0.9 · 부하율 0.75
 *
 *   출력    1,000 × 0.9 × 0.75 × 1000        = 675,000 W
 *   총손실  1,200 + 10,000 × 0.75²            =   6,825 W
 *   효율    675,000 / 681,825 × 100           = 98.9990 %
 *   최적부하율 √(1,200 / 10,000)              =  0.3464
 *   최적 대비 연간차 (6,825 − 2,400) × 8.76   = 38,763.00 kWh
 *
 * 최적 부하율은 **동손 = 철손**이 되는 점이다. 그 항등식을 함께 잠근다 —
 * 값만 맞춰 두면 √ 안이 뒤집혀도(Pcu/Pfe) 한 케이스에서는 안 걸린다.
 */
describe('transformer-efficiency — 효율과 최적 부하율', () => {
  const input = { capacity: 1000, noLoadLoss: 1200, loadLoss: 10000, powerFactor: 0.9, loadRatio: 0.75 };

  it.each([
    [1, 675000, '출력 (W)'],
    [2, 6825, '총손실 (W)'],
    [3, 98.9990, '효율 (%)'],
    [4, 0.3464, '최적 부하율'],
    [5, 38763.0, '최적 대비 연간차 (kWh)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('transformer-efficiency', input);
    expect(step(n as number)).toBeCloseTo(expected as number, n === 4 ? 4 : 2);
  });

  /**
   * 최적 부하율에서 동손과 철손이 같다 — √ 안이 뒤집히면(Pcu/Pfe) 깨진다.
   * 화면 값은 소수 넷째 자리로 반올림돼 있어(0.34641016 → 0.3464) 되먹이면
   * 0.07 W 쯤 잔차가 남는다. 항등식을 보는 것이지 정밀도를 보는 게 아니다.
   */
  it('최적 부하율에서 동손 = 철손', () => {
    const { step } = run('transformer-efficiency', input);
    const kOpt = step(4);
    expect(input.loadLoss * kOpt * kOpt).toBeCloseTo(input.noLoadLoss, 0);
  });

  /**
   * 최적 부하율로 돌리면 최적 대비 차이가 0 에 붙는다. 정확히 0 은 아니다 —
   * 화면에 보이는 반올림 값(0.3464)을 되먹이기 때문이고, 잔차는 연간 0.62 kWh
   * 다(이 변압기의 연간 총손실 약 5 만 kWh 대비 0.001 %).
   * 부호가 뒤집히거나 자릿수가 달라지면 이 검사가 깨진다.
   */
  it('최적 부하율에서 연간 손실 차이가 0 에 붙는다', () => {
    const kOpt = run('transformer-efficiency', input).step(4);
    const { step } = run('transformer-efficiency', { ...input, loadRatio: kOpt });
    expect(Math.abs(step(5))).toBeLessThan(1);
  });

  /** 무부하손은 부하율과 무관하다 — 부하율을 0 에 가깝게 해도 철손은 남는다. */
  it('부하율이 낮아도 무부하손은 남는다', () => {
    const { step } = run('transformer-efficiency', { ...input, loadRatio: 0.01 });
    expect(step(2)).toBeCloseTo(1200 + 10000 * 0.0001, 2);
  });
});

/**
 * impedance-voltage — 2,000 kVA · 22.9 kV · 단락전류 1,200 A
 *
 *   정격전류  2,000,000 / (√3 × 22,900)  =  50.42 A
 *   임피던스  22,900 / (√3 × 1,200)      = 11.0178 Ω
 *   %임피던스 50.42 / 1,200 × 100        =   4.20 %
 *
 * %임피던스는 단락전류·병렬운전·전압변동의 공통 입력이다. 3/3 무방비였다.
 */
describe('impedance-voltage — %임피던스', () => {
  const input = { ratedCapacity: 2000, ratedVoltage: 22900, shortCircuitCurrent: 1200 };

  it.each([
    [1, 50.42, '정격전류 (A)'],
    [2, 11.0178, '임피던스 (Ω)'],
    [3, 4.20, '%임피던스 (%)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('impedance-voltage', input);
    expect(step(n as number)).toBeCloseTo(expected as number, n === 2 ? 4 : 2);
  });

  /** %Z = I_n / I_sc × 100 — 단락전류를 두 배로 하면 %Z 는 절반이다. */
  it('단락전류를 두 배로 하면 %임피던스는 절반', () => {
    const a = run('impedance-voltage', input).step(3);
    const b = run('impedance-voltage', { ...input, shortCircuitCurrent: 2400 }).step(3);
    expect(b).toBeCloseTo(a / 2, 3);
  });

  /** 정상 범위(3~15 %)를 벗어나면 FAIL — 숫자가 맞아도 판정이 뒤집히면 안 된다. */
  it('범위를 벗어난 %임피던스는 FAIL', () => {
    expect(run('impedance-voltage', input).verdict()).toBe(true);
    expect(run('impedance-voltage', { ...input, shortCircuitCurrent: 60000 }).verdict()).toBe(false);
  });
});

/**
 * transformer-loss — 무부하손 1,500 W · 정격부하손 12,000 W · 부하율 0.6 ·
 *                    1,500 kVA · cos φ 0.95
 *
 *   동손      12,000 × 0.6²         =  4,320.00 W
 *   총손실    1,500 + 4,320         =  5,820.00 W
 *   효율      855,000 / 860,820     =     99.32 %
 *   연간손실  5,820 × 8.76          = 50,983.20 kWh
 *
 * 이 계산기는 단계 번호가 `steps.length + 1` 이라 **정격용량을 안 주면 효율
 * 단계가 빠지고 뒤 단계가 당겨진다**. 그 자리 이동 자체도 잠근다 — 소비처가
 * 번호로 집으면 조용히 다른 값을 읽게 된다.
 */
describe('transformer-loss — 손실과 유동 단계번호', () => {
  const input = { noLoadLoss: 1500, ratedLoadLoss: 12000, loadRatio: 0.6, ratedCapacity: 1500, powerFactor: 0.95 };

  it.each([
    [1, 4320.0, '동손 (W)'],
    [2, 5820.0, '총손실 (W)'],
    [3, 99.32, '효율 (%)'],
    [4, 50983.2, '연간 손실 (kWh)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('transformer-loss', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  it('정격용량이 없으면 효율 단계가 빠지고 연간손실이 3 번이 된다', () => {
    const { ratedCapacity, powerFactor, ...rest } = input;
    const { step } = run('transformer-loss', rest);
    expect(step(3)).toBeCloseTo(50983.2, 2);
    expect(() => step(4)).toThrow('step 4 없음');
  });

  /** 동손은 부하율의 제곱이다 — 선형으로 새면 절반 부하에서 두 배 어긋난다. */
  it('부하율 절반이면 동손은 1/4', () => {
    const a = run('transformer-loss', input).step(1);
    const b = run('transformer-loss', { ...input, loadRatio: 0.3 }).step(1);
    expect(b).toBeCloseTo(a / 4, 2);
  });
});

/**
 * **부가 출력(additionalOutputs) 앵커.**
 *
 * `steps` 가 화면에 보이는 숫자라면 `additionalOutputs` 는 **다른 코드가 집어
 * 가는 숫자**다 — 리포트·도면 파이프라인·API 응답이 여기서 값을 읽는다.
 * 그런데 대부분이 같은 양을 **단계와 따로 계산해 따로 반올림**한다. 한쪽만
 * 고치면 화면과 API 가 어긋나고, 지금까지 그걸 볼 검사가 없었다
 * (변이 실측 2026-07-30 · 훑기 393 중 부가 출력 73 줄이 전량 무방비).
 *
 * 그래서 두 축으로 잠근다:
 *   ① 단계와 짝이 있는 값 → **단계와 같아야 한다**(따로 계산하는 자리이므로
 *      이 등식이 깨지는 것이 실제 결함 형태다). 단계 쪽에는 이미 절대 눈금이
 *      붙어 있으므로 부가 출력도 전이적으로 절대 눈금을 갖는다.
 *   ② 짝이 없는 값 → 손계산 절대 눈금.
 */
describe('부가 출력 — 단계와 어긋나지 않는다', () => {
  it.each([
    // [계산기, 입력, 부가출력 키, 대응 단계]
    ['cable-impedance', { cableSize: 95, conductor: 'Cu', length: 250, frequency: 60, temperature: 75 }, 'resistance', 3],
    ['cable-impedance', { cableSize: 95, conductor: 'Cu', length: 250, frequency: 60, temperature: 75 }, 'reactance', 5],
    ['cable-impedance', { cableSize: 95, conductor: 'Cu', length: 250, frequency: 60, temperature: 75 }, 'impedance', 6],
    ['cable-impedance', { cableSize: 95, conductor: 'Cu', length: 250, frequency: 60, temperature: 75 }, 'angle', 7],
    ['cable-impedance', { cableSize: 95, conductor: 'Cu', length: 250, frequency: 60, temperature: 75 }, 'reactancePerKm', 4],
    ['reactive-power', { activePower: 300, currentPF: 0.75, targetPF: 0.95 }, 'requiredCapacitorBank', 3],
    ['reactive-power', { activePower: 300, currentPF: 0.75, targetPF: 0.95 }, 'currentReactive', 4],
    ['reactive-power', { activePower: 300, currentPF: 0.75, targetPF: 0.95 }, 'targetReactive', 5],
    ['voltage-drop', { cableSize: 16, conductor: 'Cu', length: 120, current: 40, powerFactor: 0.9, phase: 3, voltage: 380 }, 'cableResistance', 1],
    ['temp-correction', { baseAmpacity: 100, referenceTemp: 30, actualTemp: 45, maxConductorTemp: 70 }, 'correctionFactor', 3],
    ['battery-capacity', { loadPower: 10, backupTime: 4, batteryVoltage: 48, depthOfDischarge: 0.8, inverterEfficiency: 0.9 }, 'requiredEnergy', 2],
    ['battery-capacity', { loadPower: 10, backupTime: 4, batteryVoltage: 48, depthOfDischarge: 0.8, inverterEfficiency: 0.9 }, 'recommendedEnergy', 5],
    ['solar-generation', { installedCapacity: 100, peakSunHours: 3.5, performanceRatio: 0.8, systemLoss: 10 }, 'dailyGeneration', 2],
    ['motor-pf-correction', { motorPower: 22, motorPF: 0.8, targetPF: 0.95, motorVoltage: 380 }, 'currentReduction', 4],
  ])('%s · %s 가 step %d 과 같다', (id, input, key, stepNo) => {
    const { step, extra } = run(id as string, input as Record<string, unknown>);
    expect(extra[key as string]).toBeCloseTo(step(stepNo as number), 4);
  });

  /**
   * NEC 부하계산은 부가 출력 키 이름이 단계 제목과 다르다 — 짝을 눈으로
   * 맞춰야 해서 따로 적는다(잘못 짝지으면 그 자체가 결함이다).
   */
  it('nec-load-calc 의 부가 출력이 대응 단계와 같다', () => {
    const { step, extra } = run('nec-load-calc', {
      occupancyType: 'dwelling', area: 200,
      applianceLoads: [
        { name: 'dishwasher', va: 1200 }, { name: 'disposal', va: 1500 },
        { name: 'compactor', va: 800 }, { name: 'water-heater', va: 1000 },
      ],
      motorLoads: [1500, 750], hvacLoad: 5000, phases: 1,
    });
    expect(extra.generalLighting).toBeCloseTo(step(1), 2);   // 6,600 VA
    expect(extra.smallAppliance).toBeCloseTo(step(2), 2);    // 4,500 VA
    expect(extra.totalDemand).toBeCloseTo(step(7), 2);       // 16,835 VA
  });

  /**
   * 짝이 없는 부가 출력 — 위상각. 손계산:
   *   φ₁ = arccos(0.75) = 41.41°   φ₂ = arccos(0.95) = 18.19°
   * 역률에서 각도로 가는 변환이 뒤집히면(arcsin 오용) 여기서 갈린다.
   */
  it('reactive-power 의 위상각이 역률의 arccos 다', () => {
    const { extra } = run('reactive-power', { activePower: 300, currentPF: 0.75, targetPF: 0.95 });
    expect(extra.currentAngle).toBeCloseTo(41.41, 1);
    expect(extra.targetAngle).toBeCloseTo(18.19, 1);
    // 목표 역률이 더 좋으므로 각이 더 작아야 한다 — 부호·방향 확인.
    expect(extra.targetAngle).toBeLessThan(extra.currentAngle);
  });
});

/**
 * 부가 출력 2차 — 단계와 짝이 있는 나머지.
 *
 * 단계 번호는 **소스를 읽어 확정**했다. 표현식으로 자동 대조하는 스크립트를
 * 먼저 썼는데 `round` 없는 단계(예: `value: selectedSize`)에서 번호가 밀려
 * 3 건 중 2 건을 틀렸다(등전위 4→3 · 피뢰 4→2). 자동 대조 결과를 그대로
 * 쓰지 않고 파일을 열어 맞춘 이유다.
 *
 * 피뢰와 전동기는 방식에 따라 단계 열이 갈라져 번호가 달라진다 — 입력이
 * 어느 가지를 타는지가 곧 번호를 정한다.
 */
describe('부가 출력 2차 — 단계와 어긋나지 않는다', () => {
  it.each([
    ['transformer-capacity', { totalLoad: 400, powerFactor: 0.9, efficiency: 0.98, demandFactor: 0.8, growthMargin: 0.2 }, 'demandLoad', 1],
    ['transformer-efficiency', { capacity: 1000, noLoadLoss: 1200, loadLoss: 10000, powerFactor: 0.9, loadRatio: 0.75 }, 'annualLossDeltaVsOptimal', 5],
    ['impedance-voltage', { ratedCapacity: 2000, ratedVoltage: 22900, shortCircuitCurrent: 1200 }, 'impedance', 2],
    ['equipotential-bonding', { largestPE: 35 }, 'minimumBonding', 3],
    ['ground-conductor', { faultCurrent: 5000, clearingTime: 0.5, conductor: 'Cu', insulation: 'PVC' }, 'minimumSize', 2],
    ['earth-fault', { systemVoltage: 380, groundingType: 'solid', groundImpedance: 0.5, sourceImpedance: 0.5 }, 'stepVoltage', 4],
    ['rcd-sizing', { circuitType: 'socket', loadCurrent: 16, earthResistance: 10 }, 'touchVoltage', 3],
  ])('%s · %s 가 step %d 과 같다', (id, input, key, stepNo) => {
    const { step, extra } = run(id as string, input as Record<string, unknown>);
    expect(extra[key as string]).toBeCloseTo(step(stepNo as number), 4);
  });

  /** transformer-loss 는 `steps.length + 1` 이라 정격용량 유무로 번호가 바뀐다. */
  it('transformer-loss 의 연간손실이 마지막 단계와 같다', () => {
    const withCapacity = run('transformer-loss', {
      noLoadLoss: 1500, ratedLoadLoss: 12000, loadRatio: 0.6, ratedCapacity: 1500, powerFactor: 0.95,
    });
    expect(withCapacity.extra.annualLoss).toBeCloseTo(withCapacity.step(4), 2);

    const without = run('transformer-loss', { noLoadLoss: 1500, ratedLoadLoss: 12000, loadRatio: 0.6 });
    expect(without.extra.annualLoss).toBeCloseTo(without.step(3), 2);
  });
});

/**
 * 부가 출력 3차 — 가지가 갈리는 넷.
 *
 * 피뢰는 `method`(회전구체/보호각)로, 전동기는 `loadType` 으로 단계 열이
 * 갈라진다. 입력이 어느 가지를 타는지가 곧 단계 번호를 정하므로 기존
 * describe 가 쓰는 입력을 그대로 재사용한다.
 */
describe('부가 출력 3차 — 가지 분기', () => {
  it('ct-sizing 여유율이 step 6 과 같다', () => {
    const { step, extra } = run('ct-sizing', {
      maxLoadCurrent: 200, relayBurden: 10, leadLength: 20, leadSize: 4, accuracyClass: '0.5',
    });
    expect(extra.marginPercent).toBeCloseTo(step(6), 4);
  });

  it('surge-arrester 최소 창거리가 step 5 와 같다', () => {
    const { step, extra } = run('surge-arrester', {
      systemVoltage: 22900, pollutionLevel: 'heavy', neutralGrounding: 'solid',
    });
    expect(extra.minCreepage).toBeCloseTo(step(5), 4);
  });

  /** 보호각 가지에서만 alpha 가 나온다 — 회전구체 가지에는 없는 값이다. */
  it('lightning-protection 보호각이 보호각 가지의 step 2 와 같다', () => {
    const { step, extra } = run('lightning-protection', {
      buildingHeight: 15, lplClass: 'II', method: 'angle',
    });
    expect(extra.protectionAngle).toBeCloseTo(step(2), 4);
    expect(extra.protectionAngle).toBeCloseTo(21.0, 1); // 선언된 직선 근사
  });

  it('motor-capacity 기동전류가 step 5 와 같다', () => {
    const { step, extra } = run('motor-capacity', {
      loadType: 'rotary', torqueOrForce: 100, speedOrVelocity: 1750,
      efficiency: 0.9, voltage: 380, powerFactor: 0.85,
    });
    expect(extra.startingCurrent).toBeCloseTo(step(5), 4);
    // 기동전류는 정격전류보다 커야 한다 — 배수가 1 미만이면 방향이 뒤집힌 것이다.
    expect(extra.startingCurrent).toBeGreaterThan(step(4));
  });
});

/**
 * power-factor — 두 모드가 **다른 단계 열**을 낸다.
 *
 *   A 모드(P·S 주어짐)  P 180 kW · S 200 kVA
 *     cos φ = 180/200            = 0.9000
 *     φ     = arccos(0.9)        = 25.84°
 *     Q     = √(200² − 180²)     = 87.18 kvar
 *
 *   B 모드(P·Q 주어짐)  P 180 kW · Q 100 kvar
 *     S     = √(180² + 100²)     = 205.91 kVA
 *     cos φ = 180/205.91         = 0.8742
 *     φ     = arctan(100/180)    = 29.05°
 *
 * 두 모드 모두 무방비였다. 역률은 한전 요금과 콘덴서 선정의 입력이다.
 */
describe('power-factor — 두 입력 모드', () => {
  it.each([
    [1, 0.9, 'cos φ'],
    [2, 25.84, '위상각 (deg)'],
    [3, 87.18, '무효전력 (kvar)'],
  ])('A 모드 step %d = %s — %s', (n, expected) => {
    const { step } = run('power-factor', { activePower: 180, apparentPower: 200 });
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  it.each([
    [1, 205.91, '피상전력 (kVA)'],
    [2, 0.8742, 'cos φ'],
    [3, 29.05, '위상각 (deg)'],
  ])('B 모드 step %d = %s — %s', (n, expected) => {
    const { step } = run('power-factor', { activePower: 180, reactivePower: 100 });
    expect(step(n as number)).toBeCloseTo(expected as number, n === 2 ? 4 : 2);
  });

  /**
   * 두 모드가 같은 삼각형을 말해야 한다 — A 가 낸 Q 를 B 에 넣으면 같은 역률이
   * 나온다. 한 모드만 고치면 여기서 갈린다.
   */
  it('A 가 낸 Q 를 B 에 넣으면 같은 역률이 나온다', () => {
    const a = run('power-factor', { activePower: 180, apparentPower: 200 });
    const b = run('power-factor', { activePower: 180, reactivePower: a.step(3) });
    expect(b.step(2)).toBeCloseTo(a.step(1), 3);
    expect(b.step(1)).toBeCloseTo(200, 1);
  });

  /** 0.9 미만은 KEC 권고 미달이다 — 숫자가 맞아도 판정이 뒤집히면 안 된다. */
  it('역률 0.9 경계에서 판정이 갈린다', () => {
    expect(run('power-factor', { activePower: 180, apparentPower: 200 }).verdict()).toBe(true);
    expect(run('power-factor', { activePower: 170, apparentPower: 200 }).verdict()).toBe(false);
  });

  /** 유효전력이 피상전력을 넘을 수 없다 — 물리적으로 불가능한 입력은 거절. */
  it('P > S 는 거절한다', () => {
    expect(() => run('power-factor', { activePower: 250, apparentPower: 200 })).toThrow();
  });
});

/**
 * max-demand — 부하 3 종 · 부등률 1.25
 *
 *   설비용량  100 + 60 + 40                        = 200.00 kW
 *   수용가중  100×0.8 + 60×0.6 + 40×0.5            = 136.00 kW
 *   최대수요  136.00 / 1.25                        = 108.80 kW
 *   종합수용률 108.80 / 200.00                     =  0.5440
 *
 * 최대수요는 인입 용량·요금제의 입력이다.
 */
describe('max-demand — 수용률과 부등률', () => {
  const input = {
    loads: [
      { name: '동력', ratedPower: 100, demandFactor: 0.8 },
      { name: '조명', ratedPower: 60, demandFactor: 0.6 },
      { name: '기타', ratedPower: 40, demandFactor: 0.5 },
    ],
    diversityFactor: 1.25,
  };

  it.each([
    [1, 200.0, '설비용량 (kW)'],
    [2, 136.0, '수용 가중합 (kW)'],
    [3, 108.8, '최대수요 (kW)'],
    [4, 0.544, '종합 수용률'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('max-demand', input);
    expect(step(n as number)).toBeCloseTo(expected as number, n === 4 ? 4 : 2);
  });

  /** 부등률은 **나누는** 자리다 — 곱하면 최대수요가 부풀어 인입이 과대해진다. */
  it('부등률이 클수록 최대수요가 작아진다', () => {
    const a = run('max-demand', input).step(3);
    const b = run('max-demand', { ...input, diversityFactor: 2.5 }).step(3);
    expect(b).toBeCloseTo(a / 2, 2);
  });

  /** 수용률이 전부 1 이면 가중합 = 설비용량이다. */
  it('수용률 1 이면 가중합이 설비용량과 같다', () => {
    const all1 = { ...input, loads: input.loads.map((l) => ({ ...l, demandFactor: 1 })) };
    const { step } = run('max-demand', all1);
    expect(step(2)).toBeCloseTo(step(1), 2);
  });
});

/**
 * demand-diversity — 개별 최대 [120, 80, 60] · 합성 최대 200 · 설비 400 · 평균 140
 *
 *   개별 합계  120 + 80 + 60      = 260.00 kW
 *   부등률     260 / 200          =  1.3000
 *   수용률     200 / 400          =  0.5000
 *   부하율     140 / 200          =  0.7000
 *
 * 부등률과 수용률은 이름이 비슷해 서로 뒤바뀌기 쉽다 — 분모가 다르다.
 */
describe('demand-diversity — 부등률·수용률·부하율', () => {
  const input = {
    individualMaxDemands: [120, 80, 60],
    combinedMaxDemand: 200,
    totalInstalled: 400,
    averageDemand: 140,
  };

  it.each([
    [1, 260.0, '개별 최대 합 (kW)'],
    [2, 1.3, '부등률'],
    [3, 0.5, '수용률'],
    [4, 0.7, '부하율'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('demand-diversity', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 4);
  });

  /** 부등률 < 1 은 합성이 개별 합보다 크다는 뜻 — 물리적으로 이상 신호다. */
  it('부등률이 1 미만이면 경고 판정', () => {
    expect(run('demand-diversity', input).verdict()).toBe(true);
    expect(run('demand-diversity', { ...input, combinedMaxDemand: 300 }).verdict()).toBe(false);
  });

  /** 평균수요를 안 주면 부하율 단계가 없다 — 있는 척하면 안 된다. */
  it('평균수요가 없으면 부하율 단계도 없다', () => {
    const { averageDemand, ...rest } = input;
    expect(() => run('demand-diversity', rest).step(4)).toThrow('step 4 없음');
  });
});

/**
 * illuminance — 100 m² · 요구 500 lx · 광속 3,000 lm · 조명률 0.6 · 보수율 0.8 · 40 W
 *
 *   정확 수량  500 × 100 / (3000 × 0.6 × 0.8)  = 34.722 → **35 등**(올림)
 *   달성 조도  35 × 3000 × 0.6 × 0.8 / 100     = 504.0 lx
 *   전력밀도   35 × 40 / 100                    =  14.00 W/m²
 *   설비 효율  504.0 / 14.00                    =  36.0 lx/(W/m²)
 *
 * 등기구 수량은 **올림**이다 — 내림이면 요구 조도에 못 미친다.
 */
describe('illuminance — 등기구 수량과 달성 조도', () => {
  const input = {
    area: 100, requiredLux: 500, luminousFlux: 3000,
    utilizationFactor: 0.6, maintenanceFactor: 0.8, fixtureWattage: 40,
  };

  it.each([
    [1, 35, '등기구 수량 (개)'],
    [2, 504.0, '달성 조도 (lx)'],
    [3, 14.0, '전력밀도 (W/m²)'],
    [4, 36.0, '설비 효율'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('illuminance', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 1);
  });

  /** 올림이라 달성 조도는 요구 조도 이상이어야 한다 — 내림이면 미달한다. */
  it('달성 조도가 요구 조도 이상이다', () => {
    const { step } = run('illuminance', input);
    expect(step(2)).toBeGreaterThanOrEqual(input.requiredLux);
    expect(run('illuminance', input).verdict()).toBe(true);
  });

  /** 면적이 두 배면 등기구도 대략 두 배 — 올림 때문에 정확히 두 배는 아니다. */
  it('면적을 두 배로 하면 등기구가 두 배 근처가 된다', () => {
    const a = run('illuminance', input).step(1);
    const b = run('illuminance', { ...input, area: 200 }).step(1);
    expect(b).toBeGreaterThanOrEqual(a * 2 - 1);
    expect(b).toBeLessThanOrEqual(a * 2 + 1);
  });
});

/**
 * token-cost — 단가는 **정당하게 바뀌는 값**이라 절대 눈금을 박지 않는다.
 * 단가 자체는 `token-cost-current-pricing.test.ts` 가 따로 잠근다.
 * 여기서는 그 위에 쌓이는 **산술 관계**를 본다 — 다섯 단계가 전부 무방비였고,
 * 관계가 깨지면 화면의 월 비용이 조용히 어긋난다.
 *
 *   step 1 입력비 · step 2 출력비
 *   step 3 = 1 + 2          (요청당)
 *   step 4 = 3 × 요청수      (일)
 *   step 5 = 4 × 30         (월)
 */
describe('token-cost — 비용 누적 관계', () => {
  const input = { model: 'claude-sonnet-5', inputTokens: 10_000, outputTokens: 2_000, requestCount: 500 };

  it('요청당 비용 = 입력비 + 출력비', () => {
    const { step } = run('token-cost', input);
    expect(step(3)).toBeCloseTo(step(1) + step(2), 6);
    expect(step(1)).toBeGreaterThan(0);
    expect(step(2)).toBeGreaterThan(0);
  });

  it('일 비용 = 요청당 × 요청수 · 월 비용 = 일 × 30', () => {
    const { step } = run('token-cost', input);
    expect(step(4)).toBeCloseTo(step(3) * input.requestCount, 3);
    expect(step(5)).toBeCloseTo(step(4) * 30, 1);
  });

  /** 토큰이 두 배면 그 항의 비용도 두 배 — 단가표가 뭐든 성립해야 한다. */
  it('입력 토큰을 두 배로 하면 입력비가 두 배', () => {
    const a = run('token-cost', input).step(1);
    const b = run('token-cost', { ...input, inputTokens: 20_000 }).step(1);
    expect(b).toBeCloseTo(a * 2, 6);
  });

  /** 출력 단가가 입력보다 비싸다 — 뒤집히면 모델 선택 권고가 반대로 간다. */
  it('같은 토큰 수에서 출력이 입력보다 비싸다', () => {
    const { step } = run('token-cost', { ...input, inputTokens: 1000, outputTokens: 1000 });
    expect(step(2)).toBeGreaterThan(step(1));
  });
});

/**
 * energy-saving — 100 kW → 60 kW · 10 h/일 · 300 일 · 120 원/kWh ·
 *                 투자 50,000,000 원 · 배출계수 0.4594
 *
 *   절감 전력  100 − 60                    =     40.000 kW
 *   연간 절감  40 × 10 × 300               = 120,000.0 kWh
 *   비용 절감  120,000 × 120               = 14,400,000 원
 *   CO₂ 감축   120,000 × 0.4594            =  55,128.0 kg
 *   회수 기간  50,000,000 / 14,400,000 × 12 =     41.7 개월
 */
describe('energy-saving — 절감량과 회수 기간', () => {
  const input = {
    beforePower: 100, afterPower: 60, dailyHours: 10, annualDays: 300,
    electricityRate: 120, investmentCost: 50_000_000,
  };

  it.each([
    [1, 40.0, '절감 전력 (kW)'],
    [2, 120000.0, '연간 절감 (kWh)'],
    [3, 14400000, '비용 절감 (원)'],
    [4, 55128.0, 'CO₂ 감축 (kg)'],
    [5, 41.7, '회수 기간 (개월)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('energy-saving', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 1);
  });

  /** 투자비가 없으면 회수 기간 단계가 없어야 한다 — 0 을 내면 즉시 회수로 읽힌다. */
  it('투자비가 없으면 회수 기간 단계가 없다', () => {
    const { investmentCost, ...rest } = input;
    expect(() => run('energy-saving', rest).step(5)).toThrow('step 5 없음');
  });

  /**
   * 개선 후가 개선 전보다 크거나 같으면 **단계를 비우고 FAIL** 을 낸다.
   * 0 을 단계로 채워 내보내면 «절감 0 kWh» 가 성과처럼 보인다 — 계산기 쪽
   * 선택이 옳고, 그 선택 자체를 잠근다.
   */
  it('절감이 없으면 단계가 비고 FAIL 이다', () => {
    const { value, verdict } = run('energy-saving', { ...input, afterPower: 100 });
    expect(value).toBe(0);
    expect(verdict()).toBe(false);
    expect(() => run('energy-saving', { ...input, afterPower: 100 }).step(1)).toThrow('step 1 없음');
  });

  /** 개선 후가 더 크면(악화) 마찬가지로 FAIL — 음수 절감을 만들지 않는다. */
  it('개선 후가 더 크면 음수 절감이 아니라 FAIL', () => {
    const worse = run('energy-saving', { ...input, afterPower: 130 });
    expect(worse.value).toBe(0);
    expect(worse.verdict()).toBe(false);
  });
});

/**
 * ups-capacity — 부하 50 kW · pf 0.9 · η 0.92 · 안전율 1.25 · 백업 15 분 ·
 *                배터리 240 V · DoD 0.8 · 셀 12 V
 *
 *   UPS 용량   (50 / (0.9 × 0.92)) × 1.25              =  75.48 kVA
 *   배터리     75.48×1000×15 / (240×0.92×0.8×60)       = 106.8 Ah
 *   직렬 개수  ⌈240 / 12⌉                               =  20 개
 *   실제 백업  106.8×240×0.92×0.8×60 / (75.48×1000)     =  15.0 분
 *
 * 실제 백업이 요구 백업과 같아야 한다 — 두 식이 서로의 역이다.
 */
describe('ups-capacity — 용량·배터리·실백업', () => {
  const input = {
    loadPower: 50, loadPF: 0.9, backupMinutes: 15, inputVoltage: 380,
    batteryVoltage: 240, efficiency: 0.92, safetyFactor: 1.25,
  };

  it.each([
    [1, 75.48, 'UPS 용량 (kVA)'],
    [2, 106.8, '배터리 (Ah)'],
    [4, 15.0, '실제 백업 (분)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('ups-capacity', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 1);
  });

  it('직렬 배터리 개수는 ⌈배터리전압 / 셀전압⌉ 이다', () => {
    const { step } = run('ups-capacity', input);
    expect(step(3)).toBe(20);
  });

  /** 실백업이 요구 백업 아래로 내려가면 안 된다 — 두 식이 역관계라 같아야 한다. */
  it('실제 백업이 요구 백업 이상이다', () => {
    const { step } = run('ups-capacity', input);
    expect(step(4)).toBeGreaterThanOrEqual(input.backupMinutes * 0.99);
    expect(run('ups-capacity', input).verdict()).toBe(true);
  });

  /** 백업 시간을 두 배로 하면 배터리 용량도 두 배다. */
  it('백업 시간을 두 배로 하면 Ah 도 두 배', () => {
    const a = run('ups-capacity', input).step(2);
    const b = run('ups-capacity', { ...input, backupMinutes: 30 }).step(2);
    expect(b).toBeCloseTo(a * 2, 0);
  });
});

/**
 * power-loss — 200 A · 0.641 Ω/km · 0.15 km · 3φ · 부하 100 kW
 *
 *   I²R        200² × 0.641          = 25,640.0000 W/km
 *   손실       3 × 25,640 × 0.15 / 1000 =   11.5380 kW
 *   손실률     11.538 / 100 × 100     =      11.54 %
 *
 * 3 상 계수는 3 이다(단상은 2) — 도체 수가 다르다.
 */
describe('power-loss — I²R 손실', () => {
  const input = { current: 200, resistance: 0.641, length: 0.15, phase: 3, loadPower: 100 };

  it.each([
    [1, 25640.0, 'I²R (W/km)'],
    [2, 11.538, '손실 (kW)'],
    [3, 11.54, '손실률 (%)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('power-loss', input);
    expect(step(n as number)).toBeCloseTo(expected as number, n === 1 ? 1 : 3);
  });

  /** 손실은 전류의 **제곱**이다 — 선형으로 새면 두 배 전류에서 두 배만 는다. */
  it('전류를 두 배로 하면 손실은 네 배', () => {
    const a = run('power-loss', input).step(2);
    const b = run('power-loss', { ...input, current: 400 }).step(2);
    expect(b).toBeCloseTo(a * 4, 3);
  });

  /** 단상 계수는 2 — 3 상 대비 2/3 배다. */
  it('단상 손실은 3 상의 2/3 배', () => {
    const three = run('power-loss', input).step(2);
    const single = run('power-loss', { ...input, phase: 1 }).step(2);
    expect(single).toBeCloseTo(three * (2 / 3), 3);
  });

  /** 부하를 안 주면 손실률 단계가 없다. */
  it('부하전력이 없으면 손실률 단계도 없다', () => {
    const { loadPower, ...rest } = input;
    expect(() => run('power-loss', rest).step(3)).toThrow('step 3 없음');
  });
});

/**
 * complex-voltage-drop — 380 V · 100 A · 3φ · cos φ 0.9 · 구간 2
 *
 *   상계수  √3                                       =  1.7321
 *   A 구간  √3 × 100 × 0.100 × (0.641×0.9 + 0.078×0.4359) =  10.58 V
 *   B 구간  √3 × 100 × 0.050 × (1.150×0.9 + 0.080×0.4359) =   9.27 V
 *   합계    10.58 + 9.27                             =  19.85 V
 *   비율    19.85 / 380 × 100                        =   5.22 %
 *
 * 구간이 늘면 단계도 늘어난다 — 번호가 밀리는 자리라 함께 확인한다.
 */
describe('complex-voltage-drop — 구간 누적', () => {
  const input = {
    voltage: 380, current: 100, powerFactor: 0.9, phase: 3,
    sections: [
      { name: 'A', length: 100, resistance: 0.641, reactance: 0.078 },
      { name: 'B', length: 50, resistance: 1.15, reactance: 0.08 },
    ],
  };

  it.each([
    [1, 1.7321, '상계수'],
    [2, 10.58, 'A 구간 강하 (V)'],
    [3, 9.27, 'B 구간 강하 (V)'],
    [4, 19.85, '합계 (V)'],
    [5, 5.22, '비율 (%)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('complex-voltage-drop', input);
    expect(step(n as number)).toBeCloseTo(expected as number, n === 1 ? 4 : 2);
  });

  /** 합계는 구간 합이다 — 하나라도 빠지면 여기서 갈린다. */
  it('합계가 구간 강하의 합이다', () => {
    const { step } = run('complex-voltage-drop', input);
    expect(step(4)).toBeCloseTo(step(2) + step(3), 2);
  });

  /** 수전단 = 송전단 − 합계. 부가 출력이 인라인 계산이라 관계로 잠근다. */
  it('수전단 전압 = 송전단 − 합계', () => {
    const { step, extra } = run('complex-voltage-drop', input);
    expect(extra.receivingEndVoltage).toBeCloseTo(input.voltage - step(4), 2);
  });

  /** 단상 계수는 2 다 — 3 상 대비 2/√3 배. */
  it('단상 상계수는 2 다', () => {
    const { step } = run('complex-voltage-drop', { ...input, phase: 1, voltage: 220 });
    expect(step(1)).toBeCloseTo(2, 4);
  });
});

/**
 * busbar-vd — 380 V · cos φ 0.9 · 구간 2(전류가 구간마다 다르다)
 *
 *   A: √3 × 200 × 0.030 × (0.1×0.9 + 0.02×0.4359) = 1.03 V → 누적 0.27 %
 *   B: √3 × 100 × 0.040 × (0.2×0.9 + 0.03×0.4359) = 1.34 V → 누적 0.62 %
 *   총합 0.62 %
 *
 * **단계 번호 결함을 여기서 잡았다.** 구간마다 두 줄을 같은 번호로 밀어 넣어
 * 목록이 `1, 1, 2, 2, 5` 였다 — 겹친 번호의 뒤쪽(누적 %)은 번호로 접근이 안
 * 되고 3·4 가 비어 단계가 빠진 것처럼 보였다. 값은 전부 맞았기 때문에 값
 * 앵커로는 영영 안 보였다. 순차 번호로 고치고 전 계산기에 번호 계약을 걸었다
 * (`step-numbering-contract.test.ts`).
 */
describe('busbar-vd — 구간별 강하와 누적', () => {
  const input = {
    voltage: 380, powerFactor: 0.9,
    sections: [
      { name: 'A', current: 200, length: 30, resistance: 0.1, reactance: 0.02 },
      { name: 'B', current: 100, length: 40, resistance: 0.2, reactance: 0.03 },
    ],
  };

  it.each([
    [1, 1.03, 'A 강하 (V)'],
    [2, 0.27, 'A 까지 누적 (%)'],
    [3, 1.34, 'B 강하 (V)'],
    [4, 0.62, 'B 까지 누적 (%)'],
    [5, 0.62, '총 누적 (%)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('busbar-vd', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  /** 마지막 구간 누적과 총합이 같아야 한다 — 따로 계산하는 자리다. */
  it('마지막 구간 누적이 총 누적과 같다', () => {
    const { step } = run('busbar-vd', input);
    expect(step(4)).toBeCloseTo(step(5), 2);
  });

  /** 누적은 단조 증가한다 — 뒤 구간이 앞보다 작아지면 누적이 아니다. */
  it('누적 비율이 단조 증가한다', () => {
    const { step } = run('busbar-vd', input);
    expect(step(4)).toBeGreaterThan(step(2));
  });
});

/**
 * country-compare-vd — 220 V · 30 A · 60 m · 1.83 Ω/km · X 0 · pf 1 · 단상
 *
 *   강하  2 × 30 × 0.060 × 1.83 = 6.59 V
 *   비율  6.59 / 220 × 100      = 2.99 %
 *
 * 같은 회로를 나라별 한도와 대조하는 계산기다 — 강하 자체는 나라와 무관하고
 * 한도만 달라야 한다.
 */
describe('country-compare-vd — 강하와 국가별 한도', () => {
  const input = { voltage: 220, current: 30, length: 60, resistance: 1.83, reactance: 0, powerFactor: 1, phase: 1 };

  it.each([
    [1, 6.59, '강하 (V)'],
    [2, 2.99, '비율 (%)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('country-compare-vd', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  /** 강하는 회로가 정하지 나라가 정하지 않는다 — 한도만 나라별로 다르다. */
  it('강하와 비율이 부가 출력과 일치한다', () => {
    const { step, extra } = run('country-compare-vd', input);
    expect(extra.dropVolts).toBeCloseTo(step(1), 2);
    expect(extra.dropPercent).toBeCloseTo(step(2), 2);
  });
});

/**
 * awg-converter — **ASTM B258 정의식으로 대조된다.**
 *
 *   d(mm) = 0.127 × 92^((36 − n)/39)
 *
 * 이건 근사가 아니라 AWG 의 **정의**다. 그래서 공표된 규격표와 자릿수까지
 * 맞아야 한다 — 아래 값은 그 표의 값이다:
 *
 *   AWG 10  d 2.588 mm · 5.26 mm² · 10.4 kcmil
 *   AWG 12  d 2.053 mm · 3.31 mm² ·  6.5 kcmil
 *   AWG  2  d 6.544 mm · 33.63 mm² · 66.4 kcmil
 *
 * 세 방향(AWG→mm² · kcmil→mm² · mm²→AWG)이 서로 다른 단계 열을 낸다.
 * 자동 생성 입력은 첫 방향만 돌아서 나머지 두 가지는 한 번도 안 밟혔다.
 */
describe('awg-converter — ASTM B258 정의식', () => {
  it.each([
    [10, 2.588, 5.26, 10.4],
    [12, 2.053, 3.31, 6.5],
    [2, 6.544, 33.63, 66.4],
  ])('AWG %d → 지름 %s mm · %s mm² · %s kcmil', (awg, d, mm2, kcmil) => {
    const { step } = run('awg-converter', { direction: 'awg-to-mm2', awg });
    expect(step(1)).toBeCloseTo(d as number, 3);
    expect(step(2)).toBeCloseTo(mm2 as number, 2);
    expect(step(4)).toBeCloseTo(kcmil as number, 1);
  });

  /** AWG 번호가 클수록 가늘다 — 부호가 뒤집히면 전선이 반대로 굵어진다. */
  it('AWG 번호가 클수록 가늘다', () => {
    const thin = run('awg-converter', { direction: 'awg-to-mm2', awg: 14 }).step(2);
    const thick = run('awg-converter', { direction: 'awg-to-mm2', awg: 4 }).step(2);
    expect(thin).toBeLessThan(thick);
  });

  /** kcmil → mm² 는 0.5067 배다(ASTM B258). 별도 가지라 따로 밟는다. */
  it('kcmil 250 → 126.68 mm²', () => {
    const { step } = run('awg-converter', { direction: 'awg-to-mm2', kcmil: 250 });
    expect(step(1)).toBeCloseTo(126.68, 2);
  });

  /**
   * 역방향 — 자동 생성 입력이 한 번도 안 밟던 가지다.
   *   d = √(4 × 16 / π) = 4.514 mm
   *   n = 36 − 39 log₉₂(4.514 / 0.127) = 5.20
   *   kcmil = (4.514/0.0254)² / 1000 = 31.6
   */
  it('mm² 16 → 지름 4.514 mm · AWG 5.20 · 31.6 kcmil', () => {
    const { step } = run('awg-converter', { direction: 'mm2-to-awg', mm2: 16 });
    expect(step(1)).toBeCloseTo(4.514, 3);
    expect(step(2)).toBeCloseTo(5.2, 2);
    expect(step(4)).toBeCloseTo(31.6, 1);
  });

  /** 왕복 변환이 제자리로 온다 — 두 식이 서로의 역이 아니면 여기서 갈린다. */
  it('AWG → mm² → AWG 가 제자리로 온다', () => {
    const mm2 = run('awg-converter', { direction: 'awg-to-mm2', awg: 10 }).step(2);
    const back = run('awg-converter', { direction: 'mm2-to-awg', mm2 }).step(2);
    expect(back).toBeCloseTo(10, 1);
  });

  /** 방향에 맞는 입력이 없으면 거절한다 — 조용히 0 을 내면 안 된다. */
  it('방향에 맞지 않는 입력은 거절한다', () => {
    expect(() => run('awg-converter', { direction: 'awg-to-mm2' })).toThrow();
    expect(() => run('awg-converter', { direction: 'mm2-to-awg' })).toThrow();
  });
});

/**
 * awg-converter — 세 가지 각각의 **반환값과 부가 출력**.
 *
 * 단계만 잠그면 절반이다. 이 계산기는 방향마다 return 문이 따로 있고, 그
 * 안에서 같은 양을 **또 한 번 반올림**한다 — 한 가지의 return 만 고쳐도
 * 단계는 그대로라 안 보인다(재변이 실측: 15 줄 중 8 이 단계 앵커를 빠져나갔다).
 */
describe('awg-converter — 가지별 반환값·부가 출력', () => {
  it('AWG→mm² 가지의 반환값과 부가 출력이 단계와 같다', () => {
    const { value, step, extra } = run('awg-converter', { direction: 'awg-to-mm2', awg: 10 });
    expect(value).toBeCloseTo(step(2), 2);          // 5.26 mm²
    expect(extra.exactMm2).toBeCloseTo(step(2), 2);
    expect(extra.diameterMm).toBeCloseTo(step(1), 3); // 2.588 mm
    expect(extra.kcmil).toBeCloseTo(step(4), 1);      // 10.4 kcmil
    expect(extra.nearestStandard).toBe(step(3));
  });

  it('kcmil→mm² 가지의 반환값과 부가 출력이 단계와 같다', () => {
    const { value, step, extra } = run('awg-converter', { direction: 'awg-to-mm2', kcmil: 250 });
    expect(value).toBeCloseTo(126.68, 2);
    expect(value).toBeCloseTo(step(1), 2);
    expect(extra.exactMm2).toBeCloseTo(step(1), 2);
    expect(extra.nearestStandard).toBe(step(2));
  });

  /**
   * mm²→AWG 가지. 정확 AWG 는 5.20 이지만 **표에 AWG 5 가 없다** — 상용 표는
   * 홀수 게이지(5·7·9·11·13)를 싣지 않는다(1, 2, 3, 4, **6**, 8, 10 …).
   * 그래서 최근접 표준은 AWG 6(13.30 mm²)이다: |16−13.30| = 2.70 이
   * |16−21.15| = 5.15 보다 가깝다.
   *
   * 처음엔 AWG 5(16.77)를 기대했다가 틀렸다 — 정의식으로만 계산하면 표에
   * 없는 게이지를 답으로 삼게 된다. 계산기 쪽이 옳았다.
   */
  it('mm²→AWG 가지의 반환값과 부가 출력이 단계와 같다', () => {
    const { value, step, extra } = run('awg-converter', { direction: 'mm2-to-awg', mm2: 16 });
    expect(value).toBe(5);                            // round(5.20) — 정확값의 반올림
    expect(step(3)).toBeCloseTo(13.3, 2);             // 표에 실재하는 최근접
    expect(extra.exactAwg).toBeCloseTo(step(2), 2);   // 5.20
    expect(extra.diameterMm).toBeCloseTo(step(1), 3); // 4.514 mm
    expect(extra.kcmil).toBeCloseTo(step(4), 1);      // 31.6
  });

  /** 최근접은 표에 실재하는 값 중에서 고른다 — 정의식 값을 그대로 쓰면 안 된다. */
  it('최근접 표준은 표에 있는 이웃 중 더 가까운 쪽이다', () => {
    const { step } = run('awg-converter', { direction: 'mm2-to-awg', mm2: 16 });
    expect(Math.abs(step(3) - 16)).toBeLessThan(Math.abs(21.15 - 16));
    expect([13.3, 21.15]).toContain(step(3));
  });

  /**
   * 표와 정의식이 서로 맞는지 — 표 값이 손으로 적힌 상수라 식과 어긋날 수 있다.
   * AWG 10 · 12 · 2 를 표(step 3 경로)와 식(step 1·2 경로) 양쪽에서 본다.
   */
  it('표에 적힌 지름이 정의식과 일치한다', () => {
    for (const [awg, d] of [[10, 2.588], [12, 2.053], [2, 6.544]] as const) {
      const { step } = run('awg-converter', { direction: 'awg-to-mm2', awg });
      expect(step(1)).toBeCloseTo(d, 3);
    }
  });
});

/**
 * frequency-compare — 60 Hz 설비를 50 Hz 계통에 쓸 때. 기기 종류마다
 * **단계 열이 완전히 다르다**(전동기 4 · 변압기 4 · 콘덴서 3 · 임피던스 3).
 * 자동 생성 입력은 첫 종류만 돌아서 나머지 셋은 한 번도 안 밟혔다.
 *
 *   주파수비  50/60                    = 0.8333
 *   전동기    동기속도 120×50/4        = 1,500 rpm (60 Hz 에선 1,800)
 *             자속 (1/0.8333 − 1)×100  = +20.00 %   ← 전압을 그대로 두면 자속이 는다
 *             출력 (0.8333 − 1)×100    = −16.67 %
 *   변압기    자속 +20.00 % · 정격 −16.67 % · 포화 위험 60/50 = 1.200
 *   콘덴서    용량성 리액턴스 +20.00 % · 무효전력 −16.67 %
 *   임피던스  유도성 −16.67 % · 용량성 +20.00 %
 *
 * 60 → 50 Hz 는 자속이 **늘어난다**(주파수가 분모다) — 부호가 뒤집히면
 * 포화 위험을 반대로 읽는다.
 */
describe('frequency-compare — 기기별 주파수 환산', () => {
  const base = { ratedPower: 100, ratedFreq: 60, targetFreq: 50 };

  it('주파수비는 종류와 무관하게 같다', () => {
    for (const equipmentType of ['motor', 'transformer', 'capacitor', 'impedance']) {
      expect(run('frequency-compare', { ...base, equipmentType }).step(1)).toBeCloseTo(0.8333, 4);
    }
  });

  it.each([
    [2, 1500, '동기속도 (rpm)'],
    [3, 20.0, '자속 변화 (%)'],
    [4, -16.67, '출력 변화 (%)'],
  ])('전동기 step %d = %s — %s', (n, expected) => {
    const { step } = run('frequency-compare', { ...base, equipmentType: 'motor', motorPoles: 4 });
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  it.each([
    [2, 20.0, '철심 자속 (%)'],
    [3, -16.67, '정격 용량 (%)'],
    [4, 1.2, '포화 위험 (f₁/f₂)'],
  ])('변압기 step %d = %s — %s', (n, expected) => {
    const { step } = run('frequency-compare', { ...base, equipmentType: 'transformer' });
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  it.each([
    [2, 20.0, '용량성 리액턴스 (%)'],
    [3, -16.67, '무효전력 (%)'],
  ])('콘덴서 step %d = %s — %s', (n, expected) => {
    const { step } = run('frequency-compare', { ...base, equipmentType: 'capacitor' });
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  it.each([
    [2, -16.67, '유도성 임피던스 (%)'],
    [3, 20.0, '용량성 임피던스 (%)'],
  ])('임피던스 step %d = %s — %s', (n, expected) => {
    const { step } = run('frequency-compare', { ...base, equipmentType: 'impedance' });
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  /** 동기속도는 극수에 반비례한다 — 120 f / p 의 p 가 새면 여기서 갈린다. */
  it('극수를 두 배로 하면 동기속도는 절반', () => {
    const p4 = run('frequency-compare', { ...base, equipmentType: 'motor', motorPoles: 4 }).step(2);
    const p8 = run('frequency-compare', { ...base, equipmentType: 'motor', motorPoles: 8 }).step(2);
    expect(p8).toBeCloseTo(p4 / 2, 0);
  });

  /** 주파수를 낮추면 디레이팅이 필요하다 — 올리면 필요 없다. */
  it('주파수를 낮출 때만 디레이팅 판정이 난다', () => {
    expect(run('frequency-compare', { ...base, equipmentType: 'motor' }).verdict()).toBe(false);
    expect(run('frequency-compare', {
      ...base, equipmentType: 'motor', ratedFreq: 50, targetFreq: 60,
    }).verdict()).toBe(true);
  });

  /**
   * 부가 출력 셋. 자동 계약이 못 보는 자리다 — 생성 입력에서 두 주파수가
   * 같아져 전부 0 이 되고, **0 은 1.5 배를 곱해도 0** 이라 오염이 안 보인다.
   * 값이 살아 있는 입력으로 따로 잠근다.
   */
  it('부가 출력이 전동기 단계와 같다', () => {
    const { step, extra } = run('frequency-compare', { ...base, equipmentType: 'motor', motorPoles: 4 });
    expect(extra.coreFluxChange).toBeCloseTo(step(3), 2);   // +20.00 %
    expect(extra.ratingChange).toBeCloseTo(step(4), 2);     // −16.67 %
    expect(extra.speedChange).toBeCloseTo(-16.67, 2);       // 단계는 rpm, 이건 %
    expect(extra.deratingNeeded).toBe(1);
  });

  /** 같은 주파수면 아무것도 안 변한다 — 항등 확인. */
  it('같은 주파수면 변화가 0 이다', () => {
    const { step } = run('frequency-compare', { ...base, equipmentType: 'motor', targetFreq: 60 });
    expect(step(1)).toBeCloseTo(1, 4);
    expect(step(3)).toBeCloseTo(0, 2);
    expect(step(4)).toBeCloseTo(0, 2);
  });
});

/**
 * relay-basic — 부하 200 A · 고장 4,000 A · CT 200/5 · 표준반한시(SI)
 *
 *   픽업      200 × 1.3                       = 260.00 A
 *   2 차 환산  260 / 200 × 5                    =   6.50 A   (5 A CT 기준)
 *   고장배수  4,000 / 260                      =  15.38 ×
 *   TDS       0.3 × (15.38^0.02 − 1) / 0.14    =  0.120
 *   동작시간  TDS × 0.14 / (15.38^0.02 − 1)    =  0.300 s
 *
 * 곡선 상수는 IEC 60255 표준반한시 A = 0.14 · B = 0.02 다. 동작시간이
 * 0.300 s 인 것은 우연이 아니라 **TDS 를 목표 0.3 s 에 맞춰 역산**하기
 * 때문이다 — 두 식이 서로의 역이라 왕복이 닫혀야 한다.
 *
 * `ctRatio` 는 CT **1 차 정격**이다(200/5 CT 면 200). 2 차 6.50 A 가 5 A CT
 * 에서 130 % 로 타당하다 — 40 을 넣으면 32.5 A 가 나와 물리적으로 말이 안 된다.
 */
describe('relay-basic — 픽업·고장배수·동작시간', () => {
  const input = { loadCurrent: 200, faultCurrent: 4000, ctRatio: 200, curveType: 'SI' };

  it.each([
    [1, 260.0, '픽업 (A)'],
    [2, 6.5, 'CT 2 차 (A)'],
    [3, 15.38, '고장배수 (×)'],
    [4, 0.12, 'TDS'],
    [5, 0.3, '동작시간 (s)'],
  ])('step %d = %s — %s', (n, expected) => {
    const { step } = run('relay-basic', input);
    expect(step(n as number)).toBeCloseTo(expected as number, 2);
  });

  /** TDS 역산과 동작시간이 서로의 역이다 — 목표 0.3 s 로 닫혀야 한다. */
  it('동작시간이 목표 0.3 s 로 닫힌다', () => {
    for (const curveType of ['SI', 'VI', 'EI']) {
      const { step } = run('relay-basic', { ...input, curveType });
      expect(step(5)).toBeCloseTo(0.3, 3);
    }
  });

  /** 픽업은 부하의 1.3 배다 — 배수가 새면 오동작하거나 보호를 못 한다. */
  it('픽업이 부하의 1.3 배다', () => {
    const { step } = run('relay-basic', input);
    expect(step(1)).toBeCloseTo(input.loadCurrent * 1.3, 2);
  });

  /**
   * 고장배수는 고장전류에 비례한다 — 두 배면 두 배.
   * 표시값이 소수 둘째 자리로 반올림돼 있어 15.38 × 2 = 30.76 과
   * 8,000/260 = 30.77 이 한 자리 어긋난다. 비례를 보는 것이지 그 자리의
   * 정밀도를 보는 게 아니다.
   */
  it('고장전류를 두 배로 하면 배수도 두 배', () => {
    const a = run('relay-basic', input).step(3);
    const b = run('relay-basic', { ...input, faultCurrent: 8000 }).step(3);
    expect(b).toBeCloseTo(30.77, 2);
    expect(b).toBeCloseTo(a * 2, 1);
  });

  /** 2 차 전류는 CT 1 차 정격에 반비례한다 — 400/5 CT 면 절반이다. */
  it('CT 1 차 정격을 두 배로 하면 2 차 전류는 절반', () => {
    const a = run('relay-basic', input).step(2);
    const b = run('relay-basic', { ...input, ctRatio: 400 }).step(2);
    expect(b).toBeCloseTo(a / 2, 2);
  });

  /** 부가 출력이 단계와 같다 — 따로 계산하는 자리다. */
  it('부가 출력이 단계와 같다', () => {
    const { step, extra } = run('relay-basic', input);
    expect(extra.pickupCurrent).toBeCloseTo(step(1), 2);
    expect(extra.faultMultiple).toBeCloseTo(step(3), 2);
    expect(extra.timeDial).toBeCloseTo(step(4), 3);
  });
});

/**
 * relay-basic — **동작하지 않는 가지.**
 *
 * 고장전류가 픽업 이하(M ≤ 1)면 계전기가 뜨지 않는다. 입력 검증은
 * `faultCurrent > loadCurrent` 만 보는데 픽업은 부하의 1.3 배라, 그 사이
 * (부하 < 고장 ≤ 1.3×부하)가 이 가지로 온다. 반한시 식은 여기서 `M^B − 1 < 0`
 * 이 되어 **음수 동작시간**이라는 물리적으로 불가능한 값을 냈다 —
 * 그래서 조기 반환으로 막아 두었다.
 *
 * 부하 200 A · 고장 250 A → 픽업 260 A · M = 0.96 ≤ 1 → 동작 안 함.
 * 이 가지의 반환값·부가 출력이 무방비였다(재변이 실측).
 */
describe('relay-basic — 픽업 미달이면 동작하지 않는다', () => {
  const input = { loadCurrent: 200, faultCurrent: 250, ctRatio: 200, curveType: 'SI' };

  it('M ≤ 1 이면 FAIL 이고 동작시간 단계가 없다', () => {
    const { verdict, step } = run('relay-basic', input);
    expect(step(3)).toBeCloseTo(0.96, 2);   // 250 / 260
    expect(verdict()).toBe(false);
    expect(() => run('relay-basic', input).step(5)).toThrow('step 5 없음');
  });

  it('그 가지의 반환값·부가 출력이 픽업과 배수를 그대로 말한다', () => {
    const { value, step, extra } = run('relay-basic', input);
    expect(value).toBeCloseTo(260.0, 2);
    expect(extra.pickupCurrent).toBeCloseTo(step(1), 2);
    expect(extra.faultMultiple).toBeCloseTo(step(3), 2);
    expect(extra.operates).toBe(0);
  });

  /** 음수 동작시간이 절대 나오지 않는다 — 이 가지가 막는 것이 그것이다. */
  it('경계 근처 어디서도 음수 동작시간이 나오지 않는다', () => {
    for (const faultCurrent of [210, 250, 259, 261, 300, 500]) {
      const r = run('relay-basic', { ...input, faultCurrent });
      let trip: number | null = null;
      try { trip = r.step(5); } catch { trip = null; }
      if (trip !== null) expect(trip).toBeGreaterThan(0);
    }
  });
});
