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
    additionalOutputs?: Record<string, { value: number }>;
  };
  const extra: Record<string, number> = {};
  if (r.additionalOutputs) {
    for (const [k, v] of Object.entries(r.additionalOutputs)) extra[k] = v.value;
  }
  return { value: r.value as number, extra };
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
});

describe('motor', () => {
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
  });
  test('braking-resistor: R=Vdc²/P=700²/10000=49 Ω', () => {
    const { value } = run('braking-resistor', { dcBusVoltage: 700, brakingPower: 10, brakingTime: 5, dutyCycle: 10 });
    close(value, 49);
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
    const { value } = run('pcs-capacity', { batteryCapacity: 100, maxChargeRate: 0.5, maxDischargeRate: 0.5, efficiency: 0.95, gridVoltage: 380 });
    close(value, 52.63);
  });
  test('grid-connect: maxExport=min(100,100)=100 kW', () => {
    const { value } = run('grid-connect', { pvCapacity: 100, batteryCapacity: 0, gridVoltage: 380, contractDemand: 100 });
    close(value, 100);
  });
  test('frequency-compare motor 60→50Hz: ratio 0.833, speed −16.67%, flux +20%', () => {
    const { value, extra } = run('frequency-compare', { equipmentType: 'motor', ratedPower: 100, ratedFreq: 60, targetFreq: 50, motorPoles: 4 });
    close(value, 0.8333);
    close(extra.speedChange, -16.67, 0.02);
    close(extra.coreFluxChange, 20, 0.02);
  });
});
