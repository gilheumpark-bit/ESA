/**
 * Calculator Parameter Definitions — Shared Constants
 *
 * Extracted from calc/[category]/[id]/page.tsx for reuse across:
 * - Calculator page UI (param forms)
 * - Calc intent bridge (auto-fill from NL queries)
 * - API validation layer
 *
 * PART 1: CALCULATOR_PARAMS — per-calculator input field definitions
 * PART 2: CALCULATOR_NAMES — display names (ko/en)
 * PART 3: LINKED_CALCS — suggested next-step calculators
 * PART 4: Helper functions
 *
 * ⚠ INVARIANT (2026-07-19): every `name` MUST equal the calculator's actual
 * input field name verbatim. The form posts values keyed by `param.name` and
 * there is NO renaming layer (form → /api/calculate → convertInputsToSI keeps
 * keys → entry.calculator(inputs)). A mismatched name makes the calculator
 * throw "<field> ... got undefined" in production. Unit tests call calculators
 * directly with correct names, so they do NOT catch this drift.
 */

import type { ExtendedParamDef } from '@/components/CalculatorForm';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Calculator Param Definitions
// ═══════════════════════════════════════════════════════════════════════════════

/** Static param definitions for each calculator */
export const CALCULATOR_PARAMS: Record<string, ExtendedParamDef[]> = {
  'single-phase-power': [
    { name: 'voltage', type: 'number', unit: 'V', description: '전압 (공칭전압)', min: 0.1, defaultValue: 220 },
    { name: 'current', type: 'number', unit: 'A', description: '전류', min: 0.01 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률 (0~1)', min: 0.01, max: 1, defaultValue: 0.85, step: 0.01 },
  ],
  'three-phase-power': [
    { name: 'lineVoltage', type: 'number', unit: 'V', description: '선간전압', min: 0.1, defaultValue: 380 },
    { name: 'lineCurrent', type: 'number', unit: 'A', description: '선전류', min: 0.01, defaultValue: 100 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률 (0~1)', min: 0.01, max: 1, defaultValue: 0.85, step: 0.01 },
  ],
  'voltage-drop': [
    { name: 'voltage', type: 'number', unit: 'V', description: '공급 전압', min: 0.1, defaultValue: 380 },
    { name: 'current', type: 'number', unit: 'A', description: '부하 전류', min: 0.01 },
    { name: 'length', type: 'number', unit: 'm', description: '전선 길이 (편도)', min: 0.1 },
    { name: 'cableSize', type: 'number', unit: 'mm²', description: '전선 단면적', min: 0.5 },
    { name: 'conductor', type: 'string', unit: '', description: '도체 재질', options: [
      { value: 'Cu', label: '구리 (Cu)' },
      { value: 'Al', label: '알루미늄 (Al)' },
    ], defaultValue: 'Cu' },
    { name: 'phase', type: 'number', unit: '', description: '상수 (1 또는 3)', min: 1, max: 3, defaultValue: 3 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.01, max: 1, defaultValue: 0.85, step: 0.01 },
  ],
  'transformer-capacity': [
    { name: 'totalLoad', type: 'number', unit: 'kW', description: '총 부하 용량', min: 0.1 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.01, max: 1, defaultValue: 0.85, step: 0.01 },
    { name: 'efficiency', type: 'number', unit: '', description: '변압기 효율 (0~1)', min: 0.01, max: 1, defaultValue: 0.98, step: 0.01 },
    { name: 'demandFactor', type: 'number', unit: '', description: '수용률 (0~1)', min: 0.01, max: 1, defaultValue: 0.7, step: 0.01 },
    { name: 'growthMargin', type: 'number', unit: '', description: '장래 증설 여유율 (0~1)', min: 0, max: 1, defaultValue: 0.25, step: 0.05 },
  ],
  'cable-sizing': [
    { name: 'current', type: 'number', unit: 'A', description: '설계 전류', min: 0.01 },
    { name: 'length', type: 'number', unit: 'm', description: '케이블 길이 (편도)', min: 0.1 },
    { name: 'voltage', type: 'number', unit: 'V', description: '시스템 전압', min: 0.1, defaultValue: 380 },
    { name: 'conductor', type: 'string', unit: '', description: '도체 재질', options: [
      { value: 'Cu', label: '구리 (Cu)' },
      { value: 'Al', label: '알루미늄 (Al)' },
    ], defaultValue: 'Cu' },
    { name: 'insulation', type: 'string', unit: '', description: '절연 종류', options: [
      { value: 'XLPE', label: 'XLPE (가교폴리에틸렌)' },
      { value: 'PVC', label: 'PVC (비닐)' },
    ], defaultValue: 'XLPE' },
    { name: 'ambientTemp', type: 'number', unit: '°C', description: '주위 온도', min: -20, max: 80, defaultValue: 30 },
    { name: 'groupCount', type: 'number', unit: '', description: '다조 포설 회선 수', min: 1, defaultValue: 1, step: 1 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0, max: 1, defaultValue: 0.85, step: 0.01 },
    { name: 'phase', type: 'number', unit: '', description: '상수 (1 또는 3)', min: 1, max: 3, defaultValue: 3 },
    { name: 'dropLimitPercent', type: 'number', unit: '%', description: '허용 전압강하율', min: 0.1, max: 10, defaultValue: 3, step: 0.1 },
  ],
  'short-circuit': [
    { name: 'systemVoltage', type: 'number', unit: 'V', description: '계통 전압 (선간)', min: 0.1, defaultValue: 380 },
    { name: 'transformerCapacity', type: 'number', unit: 'kVA', description: '변압기 용량', min: 1, defaultValue: 500 },
    { name: 'impedancePercent', type: 'number', unit: '%', description: '변압기 %임피던스', min: 0.1, max: 30, defaultValue: 5, step: 0.1 },
    { name: 'cableLength', type: 'number', unit: 'm', description: '변압기~고장점 케이블 길이', min: 0.1, defaultValue: 50 },
    { name: 'cableSize', type: 'number', unit: 'mm²', description: '케이블 단면적', min: 0.5, defaultValue: 95 },
    { name: 'conductor', type: 'string', unit: '', description: '도체 재질', options: [
      { value: 'Cu', label: '구리 (Cu)' },
      { value: 'Al', label: '알루미늄 (Al)' },
    ], defaultValue: 'Cu' },
    { name: 'reactance', type: 'number', unit: 'Ω/km', description: '케이블 리액턴스 (선택)', min: 0.001, defaultValue: 0.08, step: 0.01 },
  ],
  'breaker-sizing': [
    { name: 'loadCurrent', type: 'number', unit: 'A', description: '부하 전류', min: 0.01, defaultValue: 100 },
    { name: 'shortCircuitCurrent', type: 'number', unit: 'kA', description: '예상 단락전류', min: 0.1, defaultValue: 10 },
    { name: 'voltage', type: 'number', unit: 'V', description: '계통 전압', min: 0.1, defaultValue: 380 },
    { name: 'cableAmpacity', type: 'number', unit: 'A', description: '케이블 허용전류 Iz (선택)', min: 0.01, defaultValue: 150 },
  ],
  'arc-flash': [
    { name: 'voltage_V', type: 'number', unit: 'V', description: '공칭 전압 (208~15000V)', min: 208, max: 15000, defaultValue: 480 },
    { name: 'boltedFaultCurrent_kA', type: 'number', unit: 'kA', description: '볼트 단락전류 (0.2~106kA)', min: 0.2, max: 106, defaultValue: 25, step: 0.1 },
    { name: 'arcDuration_s', type: 'number', unit: 's', description: '아크 지속시간 (보호장치 동작시간)', min: 0.001, max: 10, defaultValue: 0.2, step: 0.01 },
    { name: 'workingDistance_mm', type: 'number', unit: 'mm', description: '작업 거리 (LV 배전반 통상 457mm)', min: 1, defaultValue: 457 },
    { name: 'electrodeConfig', type: 'string', unit: '', description: '전극 구성', options: [
      { value: 'VCB', label: 'VCB (밀폐함 수직 도체)' },
      { value: 'VCBB', label: 'VCBB (밀폐함 배리어 수직 도체)' },
      { value: 'HCB', label: 'HCB (밀폐함 수평 도체)' },
      { value: 'VOA', label: 'VOA (개방형 수직 도체)' },
      { value: 'HOA', label: 'HOA (개방형 수평 도체)' },
    ], defaultValue: 'VCB' },
    { name: 'enclosureType', type: 'string', unit: '', description: '밀폐 여부', options: [
      { value: 'open', label: '개방형 (open)' },
      { value: 'box', label: '밀폐형 (box)' },
    ], defaultValue: 'box' },
  ],
  'ground-resistance': [
    { name: 'soilResistivity', type: 'number', unit: 'Ω·m', description: '대지 저항률', min: 1, defaultValue: 100 },
    { name: 'rodLength', type: 'number', unit: 'm', description: '접지봉 길이', min: 0.1, defaultValue: 2.4 },
    { name: 'rodDiameter', type: 'number', unit: 'mm', description: '접지봉 지름', min: 1, defaultValue: 14.2, step: 0.1 },
    { name: 'rodCount', type: 'number', unit: '개', description: '병렬 접지봉 수 (선택)', min: 1, defaultValue: 1, step: 1 },
    { name: 'spacing', type: 'number', unit: 'm', description: '접지봉 간격 (선택)', min: 0.1, defaultValue: 2.4, step: 0.1 },
    { name: 'targetResistance', type: 'number', unit: 'Ω', description: '목표 접지저항 (선택)', min: 0.1, defaultValue: 10 },
  ],
  'solar-generation': [
    { name: 'installedCapacity', type: 'number', unit: 'kWp', description: '설치 용량', min: 0.1 },
    { name: 'peakSunHours', type: 'number', unit: 'h/day', description: '일일 피크 일사시간', min: 0.1, defaultValue: 3.5 },
    { name: 'performanceRatio', type: 'number', unit: '', description: '성능비 PR (0.01~1)', min: 0.01, max: 1, defaultValue: 0.8, step: 0.01 },
    { name: 'systemLoss', type: 'number', unit: '%', description: '시스템 손실률 (0~50)', min: 0, max: 50, defaultValue: 10, step: 0.5 },
    { name: 'daysPerMonth', type: 'number', unit: 'days', description: '월 산정 일수', min: 1, max: 31, defaultValue: 30 },
  ],
  'battery-capacity': [
    { name: 'loadPower', type: 'number', unit: 'kW', description: '부하 전력', min: 0.01 },
    { name: 'backupTime', type: 'number', unit: 'h', description: '백업 시간', min: 0.1, defaultValue: 4 },
    { name: 'batteryVoltage', type: 'number', unit: 'V', description: '배터리 공칭 전압', min: 1, defaultValue: 48 },
    { name: 'depthOfDischarge', type: 'number', unit: '', description: 'DOD 방전심도 (0.01~1)', min: 0.01, max: 1, defaultValue: 0.8, step: 0.05 },
    { name: 'inverterEfficiency', type: 'number', unit: '', description: '인버터 효율 (0.01~1)', min: 0.01, max: 1, defaultValue: 0.95, step: 0.01 },
    { name: 'safetyMargin', type: 'number', unit: '', description: '안전 여유율 (0~1, 예: 0.2=20%)', min: 0, max: 1, defaultValue: 0.2, step: 0.05 },
  ],
  'power-factor': [
    { name: 'activePower', type: 'number', unit: 'kW', description: '유효전력', min: 0.01 },
    { name: 'apparentPower', type: 'number', unit: 'kVA', description: '피상전력', min: 0.01 },
  ],
  'reactive-power': [
    { name: 'activePower', type: 'number', unit: 'kW', description: '유효전력', min: 0.01 },
    { name: 'currentPF', type: 'number', unit: '', description: '현재 역률', min: 0.01, max: 0.99, defaultValue: 0.75, step: 0.01 },
    { name: 'targetPF', type: 'number', unit: '', description: '목표 역률', min: 0.01, max: 1, defaultValue: 0.95, step: 0.01 },
  ],
  'demand-diversity': [
    { name: 'individualMaxDemands', type: 'array', unit: '', description: '개별 부하 최대수요 목록', minItems: 1, flatten: true, itemSchema: [
      { name: 'value', type: 'number', unit: 'kW', description: '최대수요', min: 0.01, defaultValue: 50 },
    ] },
    { name: 'combinedMaxDemand', type: 'number', unit: 'kW', description: '합성 최대수요', min: 0.01, defaultValue: 120 },
    { name: 'totalInstalled', type: 'number', unit: 'kW', description: '총 설비용량', min: 0.01, defaultValue: 200 },
    { name: 'averageDemand', type: 'number', unit: 'kW', description: '평균 수요전력 (선택 — 부하율 산출용)', min: 0.01, required: false },
  ],
  'max-demand': [
    { name: 'loads', type: 'array', unit: '', description: '부하 목록', minItems: 1, itemSchema: [
      { name: 'name', type: 'string', unit: '', description: '명칭', defaultValue: '부하' },
      { name: 'ratedPower', type: 'number', unit: 'kW', description: '정격전력', min: 0.01, defaultValue: 10 },
      { name: 'demandFactor', type: 'number', unit: '', description: '수용률', min: 0.01, max: 1, defaultValue: 0.7, step: 0.01 },
    ] },
    { name: 'diversityFactor', type: 'number', unit: '', description: '부등률 (≥1)', min: 1, defaultValue: 1.2, step: 0.1 },
  ],
  'power-loss': [
    { name: 'current', type: 'number', unit: 'A', description: '전류', min: 0.01 },
    { name: 'resistance', type: 'number', unit: 'Ω/km', description: '전선 저항 (km당)', min: 0.001, defaultValue: 0.5 },
    { name: 'length', type: 'number', unit: 'km', description: '전선 길이 (편도)', min: 0.001, defaultValue: 0.1 },
    { name: 'phase', type: 'number', unit: '', description: '상수 (1 또는 3)', min: 1, max: 3, defaultValue: 3 },
  ],
  'three-phase-vd': [
    { name: 'voltage', type: 'number', unit: 'V', description: '선간전압', min: 0.1, defaultValue: 380 },
    { name: 'current', type: 'number', unit: 'A', description: '전류', min: 0.01 },
    { name: 'length', type: 'number', unit: 'm', description: '전선 길이', min: 0.1 },
    { name: 'resistance', type: 'number', unit: 'Ω/km', description: '전선 저항 (km당)', min: 0.001, defaultValue: 0.5 },
    { name: 'reactance', type: 'number', unit: 'Ω/km', description: '전선 리액턴스 (km당)', min: 0, defaultValue: 0.08 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0, max: 1, defaultValue: 0.85, step: 0.01 },
  ],
  'complex-voltage-drop': [
    { name: 'voltage', type: 'number', unit: 'V', description: '전압', min: 0.1, defaultValue: 380 },
    { name: 'current', type: 'number', unit: 'A', description: '전류', min: 0.01 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.01, max: 1, defaultValue: 0.85, step: 0.01 },
    { name: 'phase', type: 'number', unit: '', description: '상수 (1 또는 3)', min: 1, max: 3, defaultValue: 3 },
    { name: 'sections', type: 'array', unit: '', description: '케이블 구간 목록', minItems: 1, itemSchema: [
      { name: 'length', type: 'number', unit: 'm', description: '길이', min: 0.1, defaultValue: 50 },
      { name: 'resistance', type: 'number', unit: 'Ω/km', description: '저항', min: 0.001, defaultValue: 0.5 },
      { name: 'reactance', type: 'number', unit: 'Ω/km', description: '리액턴스', min: 0, defaultValue: 0.08 },
    ] },
  ],
  'busbar-vd': [
    { name: 'voltage', type: 'number', unit: 'V', description: '전압', min: 0.1, defaultValue: 380 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.01, max: 1, defaultValue: 0.85, step: 0.01 },
    { name: 'sections', type: 'array', unit: '', description: '부스바 구간 목록', minItems: 1, itemSchema: [
      { name: 'name', type: 'string', unit: '', description: '구간명', defaultValue: '구간' },
      { name: 'current', type: 'number', unit: 'A', description: '전류', min: 0.01, defaultValue: 100 },
      { name: 'length', type: 'number', unit: 'm', description: '길이', min: 0.1, defaultValue: 10 },
      { name: 'resistance', type: 'number', unit: 'Ω/km', description: '저항', min: 0.001, defaultValue: 0.1 },
      { name: 'reactance', type: 'number', unit: 'Ω/km', description: '리액턴스', min: 0, defaultValue: 0.05 },
    ] },
  ],
  'country-compare-vd': [
    { name: 'voltage', type: 'number', unit: 'V', description: '전압', min: 0.1, defaultValue: 380 },
    { name: 'current', type: 'number', unit: 'A', description: '전류', min: 0.01 },
    { name: 'length', type: 'number', unit: 'm', description: '길이', min: 0.1 },
    { name: 'resistance', type: 'number', unit: 'Ω/km', description: '전선 저항 (km당)', min: 0.001, defaultValue: 0.5 },
    { name: 'reactance', type: 'number', unit: 'Ω/km', description: '전선 리액턴스 (km당, 선택)', min: 0, defaultValue: 0.08 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.01, max: 1, defaultValue: 0.85, step: 0.01 },
    { name: 'phase', type: 'number', unit: '', description: '상수 (1 또는 3)', min: 1, max: 3, defaultValue: 3 },
  ],
  'awg-converter': [
    { name: 'direction', type: 'string', unit: '', description: '변환 방향', options: [
      { value: 'awg-to-mm2', label: 'AWG → mm²' },
      { value: 'mm2-to-awg', label: 'mm² → AWG' },
    ], defaultValue: 'awg-to-mm2' },
    { name: 'awg', type: 'number', unit: 'AWG', description: 'AWG 사이즈 (AWG→mm² 방향)', min: 0, max: 40, defaultValue: 10 },
    { name: 'mm2', type: 'number', unit: 'mm²', description: '단면적 (mm²→AWG 방향)', min: 0.01, defaultValue: 25 },
  ],
  'ampacity-compare': [
    { name: 'cableSize', type: 'number', unit: 'mm²', description: '단면적 (표준값 1.5~300)', min: 1.5, max: 300, defaultValue: 25 },
    { name: 'conductor', type: 'string', unit: '', description: '도체 재질', options: [
      { value: 'Cu', label: '구리 (Cu)' },
      { value: 'Al', label: '알루미늄 (Al)' },
    ], defaultValue: 'Cu' },
    { name: 'insulation', type: 'string', unit: '', description: '절연 종류', options: [
      { value: 'PVC', label: 'PVC (비닐)' },
      { value: 'XLPE', label: 'XLPE (가교폴리에틸렌)' },
    ], defaultValue: 'XLPE' },
    { name: 'ambientTemp', type: 'number', unit: '°C', description: '주위 온도', min: -20, max: 80, defaultValue: 30 },
  ],
  'cable-impedance': [
    { name: 'cableSize', type: 'number', unit: 'mm²', description: '단면적', min: 0.5, defaultValue: 25 },
    { name: 'conductor', type: 'string', unit: '', description: '도체 재질', options: [
      { value: 'Cu', label: '구리 (Cu)' },
      { value: 'Al', label: '알루미늄 (Al)' },
    ], defaultValue: 'Cu' },
    { name: 'length', type: 'number', unit: 'm', description: '길이', min: 0.1 },
    { name: 'frequency', type: 'number', unit: 'Hz', description: '주파수', min: 1, defaultValue: 60 },
    { name: 'temperature', type: 'number', unit: '°C', description: '운전 온도', min: -20, max: 120, defaultValue: 75 },
  ],
  'transformer-loss': [
    { name: 'noLoadLoss', type: 'number', unit: 'W', description: '무부하 손실 (철손)', min: 0, defaultValue: 500 },
    { name: 'ratedLoadLoss', type: 'number', unit: 'W', description: '정격 부하 손실 (동손)', min: 0.01, defaultValue: 3000 },
    { name: 'loadRatio', type: 'number', unit: '', description: '부하율 (0~1)', min: 0, max: 1, defaultValue: 0.75, step: 0.01 },
  ],
  'transformer-efficiency': [
    { name: 'capacity', type: 'number', unit: 'kVA', description: '용량', min: 1 },
    { name: 'noLoadLoss', type: 'number', unit: 'W', description: '무부하 손실', min: 0 },
    { name: 'loadLoss', type: 'number', unit: 'W', description: '부하 손실', min: 0 },
    { name: 'loadRatio', type: 'number', unit: '', description: '부하율', min: 0.01, max: 1, defaultValue: 0.75, step: 0.01 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.1, max: 1, defaultValue: 0.85, step: 0.01 },
  ],
  'impedance-voltage': [
    { name: 'ratedCapacity', type: 'number', unit: 'kVA', description: '정격 용량', min: 1, defaultValue: 500 },
    { name: 'ratedVoltage', type: 'number', unit: 'V', description: '정격 전압 (선간)', min: 1, defaultValue: 380 },
    // %Z = (In/Isc)×100. 500kVA/380V의 정격전류는 759.7A이고 실제 단락전류는
    // 수천~수만 A다. 기본값 100A는 정격보다 작아 %Z가 759.67%로 나온다(물리 불가).
    // 통상 %Z 5%에 해당하는 Isc = 759.7/0.05 ≈ 15,000A를 기본값으로 둔다.
    { name: 'shortCircuitCurrent', type: 'number', unit: 'A', description: '단락 전류 (정격전류보다 훨씬 커야 함)', min: 0.1, defaultValue: 15000 },
  ],
  'inrush-current': [
    { name: 'ratedCapacity', type: 'number', unit: 'kVA', description: '정격 용량', min: 1, defaultValue: 500 },
    { name: 'ratedVoltage', type: 'number', unit: 'V', description: '정격 전압 (선간)', min: 1, defaultValue: 380 },
    { name: 'transformerType', type: 'string', unit: '', description: '변압기 종류', options: [
      { value: 'distribution', label: '배전용 (6~8배)' },
      { value: 'power', label: '전력용 (8~12배)' },
      { value: 'dry-type', label: '건식 (10~15배)' },
    ], defaultValue: 'distribution' },
  ],
  'parallel-operation': [
    { name: 'transformers', type: 'array', unit: '', description: '병렬 변압기 목록 (2대 이상)', minItems: 2, defaultItems: 2, itemSchema: [
      { name: 'capacity', type: 'number', unit: 'kVA', description: '용량', min: 1, defaultValue: 500 },
      { name: 'impedancePercent', type: 'number', unit: '%', description: '%임피던스', min: 0.1, max: 30, defaultValue: 5, step: 0.1 },
      { name: 'voltageRatio', type: 'string', unit: '', description: '전압비 (예 22900/380)', defaultValue: '22900/380' },
      { name: 'vectorGroup', type: 'string', unit: '', description: '결선군 (예 Dyn11)', defaultValue: 'Dyn11' },
    ] },
  ],
  'earth-fault': [
    { name: 'systemVoltage', type: 'number', unit: 'V', description: '계통 전압 (선간)', min: 0.1, defaultValue: 380 },
    { name: 'groundingType', type: 'string', unit: '', description: '접지 방식', options: [
      { value: 'solid', label: '직접 접지' },
      { value: 'resistance', label: '저항 접지' },
      { value: 'impedance', label: '임피던스 접지' },
    ], defaultValue: 'solid' },
    { name: 'groundImpedance', type: 'number', unit: 'Ω', description: '접지 임피던스', min: 0, defaultValue: 0.5 },
    { name: 'sourceImpedance', type: 'number', unit: 'Ω', description: '전원측 임피던스', min: 0, defaultValue: 0.5 },
  ],
  'rcd-sizing': [
    { name: 'circuitType', type: 'string', unit: '', description: '회로 종류', options: [
      { value: 'lighting', label: '조명' },
      { value: 'socket', label: '콘센트' },
      { value: 'motor', label: '전동기' },
      { value: 'outdoor', label: '옥외' },
      { value: 'bathroom', label: '욕실' },
    ], defaultValue: 'socket' },
    { name: 'loadCurrent', type: 'number', unit: 'A', description: '부하 전류', min: 0.01, defaultValue: 16 },
    { name: 'earthResistance', type: 'number', unit: 'Ω', description: '접지 저항', min: 0.01, defaultValue: 10 },
  ],
  'relay-basic': [
    { name: 'loadCurrent', type: 'number', unit: 'A', description: '부하 전류', min: 0.01, defaultValue: 100 },
    { name: 'faultCurrent', type: 'number', unit: 'A', description: '고장 전류 (부하 전류보다 커야 함)', min: 0.1, defaultValue: 2000 },
    { name: 'ctRatio', type: 'number', unit: '', description: 'CT비 (1차/5A 기준)', min: 1, defaultValue: 200 },
    { name: 'curveType', type: 'string', unit: '', description: 'IEC 반한시 곡선', options: [
      { value: 'SI', label: 'SI (표준 반한시)' },
      { value: 'VI', label: 'VI (강 반한시)' },
      { value: 'EI', label: 'EI (초 반한시)' },
    ], defaultValue: 'SI' },
  ],
  'ground-conductor': [
    { name: 'faultCurrent', type: 'number', unit: 'A', description: '고장 전류', min: 0.1, defaultValue: 5000 },
    { name: 'clearingTime', type: 'number', unit: 's', description: '차단 시간', min: 0.01, defaultValue: 0.5 },
    { name: 'conductor', type: 'string', unit: '', description: '도체 재질', options: [
      { value: 'Cu', label: '구리 (Cu)' },
      { value: 'Al', label: '알루미늄 (Al)' },
    ], defaultValue: 'Cu' },
  ],
  'equipotential-bonding': [
    { name: 'largestPE', type: 'number', unit: 'mm²', description: '최대 보호도체(PE) 단면적', min: 0.5, defaultValue: 16 },
  ],
  'lightning-protection': [
    { name: 'buildingHeight', type: 'number', unit: 'm', description: '건물 높이', min: 1, defaultValue: 20 },
    { name: 'lplClass', type: 'string', unit: '', description: '피뢰 보호등급 (LPL)', options: [
      { value: 'I', label: 'I등급' },
      { value: 'II', label: 'II등급' },
      { value: 'III', label: 'III등급' },
      { value: 'IV', label: 'IV등급' },
    ], defaultValue: 'III' },
    { name: 'method', type: 'string', unit: '', description: '계산 방법', options: [
      { value: 'angle', label: '보호각법' },
      { value: 'sphere', label: '회전구체법' },
    ], defaultValue: 'sphere' },
  ],
  'motor-capacity': [
    { name: 'loadType', type: 'string', unit: '', description: '부하 유형', options: [
      { value: 'rotary', label: '회전 부하 (토크·rpm)' },
      { value: 'linear', label: '직선 부하 (힘·m/s)' },
    ], defaultValue: 'rotary' },
    { name: 'torqueOrForce', type: 'number', unit: 'N·m / N', description: '부하 토크(회전, N·m) 또는 힘(직선, N)', min: 0.01 },
    { name: 'speedOrVelocity', type: 'number', unit: 'rpm / m/s', description: '회전수(회전, rpm) 또는 속도(직선, m/s)', min: 0.01, defaultValue: 1800 },
    { name: 'efficiency', type: 'number', unit: '', description: '효율 (0~1)', min: 0.01, max: 1, defaultValue: 0.9, step: 0.01 },
    { name: 'voltage', type: 'number', unit: 'V', description: '정격 전압 (선간)', min: 0.1, defaultValue: 380 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.01, max: 1, defaultValue: 0.85, step: 0.01 },
  ],
  'starting-current': [
    { name: 'ratedPower', type: 'number', unit: 'kW', description: '정격 출력', min: 0.1 },
    { name: 'voltage', type: 'number', unit: 'V', description: '전압', min: 1, defaultValue: 380 },
    { name: 'efficiency', type: 'number', unit: '', description: '효율', min: 0.01, max: 1, defaultValue: 0.9, step: 0.01 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.01, max: 1, defaultValue: 0.85, step: 0.01 },
    { name: 'startingMethod', type: 'string', unit: '', description: '기동 방식', options: [
      { value: 'DOL', label: '직입기동 (DOL)' },
      { value: 'Star-Delta', label: '기동보상기 (Y-Δ)' },
      { value: 'VFD', label: '인버터 (VFD)' },
      { value: 'Soft-Starter', label: '소프트스타터' },
    ], defaultValue: 'DOL' },
  ],
  'motor-efficiency': [
    { name: 'ratedPower', type: 'number', unit: 'kW', description: '정격 출력', min: 0.1 },
    { name: 'loadRatio', type: 'number', unit: '', description: '부하율 (0.1~1.5)', min: 0.1, max: 1.5, defaultValue: 0.75, step: 0.05 },
    { name: 'ieClass', type: 'string', unit: '', description: 'IE 효율 등급', options: [
      { value: 'IE1', label: 'IE1 (표준)' },
      { value: 'IE2', label: 'IE2 (고효율)' },
      { value: 'IE3', label: 'IE3 (프리미엄)' },
      { value: 'IE4', label: 'IE4 (슈퍼프리미엄)' },
    ], defaultValue: 'IE3' },
    { name: 'annualHours', type: 'number', unit: 'h/year', description: '연간 가동시간', min: 1, defaultValue: 4000 },
    { name: 'electricityRate', type: 'number', unit: '원/kWh', description: '전기요금 단가', min: 0.01, defaultValue: 120 },
  ],
  'inverter-capacity': [
    { name: 'motorPower', type: 'number', unit: 'kW', description: '전동기 출력', min: 0.1 },
    { name: 'motorVoltage', type: 'number', unit: 'V', description: '전동기 정격 전압', min: 1, defaultValue: 380 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.01, max: 1, defaultValue: 0.85, step: 0.01 },
    { name: 'efficiency', type: 'number', unit: '', description: '효율', min: 0.01, max: 1, defaultValue: 0.9, step: 0.01 },
    { name: 'safetyFactor', type: 'number', unit: '', description: '여유율 (1.0~2.0)', min: 1, max: 2, defaultValue: 1.25, step: 0.05 },
  ],
  'motor-pf-correction': [
    { name: 'motorPower', type: 'number', unit: 'kW', description: '전동기 출력', min: 0.1 },
    { name: 'motorPF', type: 'number', unit: '', description: '현재 역률 (0.01~0.99)', min: 0.01, max: 0.99, defaultValue: 0.75, step: 0.01 },
    { name: 'targetPF', type: 'number', unit: '', description: '목표 역률 (현재 역률보다 커야 함)', min: 0.01, max: 1, defaultValue: 0.95, step: 0.01 },
    { name: 'motorVoltage', type: 'number', unit: 'V', description: '전동기 정격 전압', min: 1, defaultValue: 380 },
  ],
  'braking-resistor': [
    { name: 'dcBusVoltage', type: 'number', unit: 'V', description: 'DC 링크 전압', min: 1, defaultValue: 700 },
    { name: 'brakingPower', type: 'number', unit: 'kW', description: '제동 전력', min: 0.1 },
    { name: 'brakingTime', type: 'number', unit: 's', description: '제동 시간 (사이클당)', min: 0.01, defaultValue: 5 },
    { name: 'dutyCycle', type: 'number', unit: '%', description: '통전율 (0.1~100)', min: 0.1, max: 100, defaultValue: 10, step: 1 },
  ],
  'solar-cable': [
    { name: 'moduleVoc', type: 'number', unit: 'V', description: '모듈 개방전압 (Voc, 모듈당)', min: 0.1, defaultValue: 45 },
    { name: 'stringCount', type: 'number', unit: 'EA', description: '스트링당 직렬 모듈 수', min: 1, defaultValue: 20, step: 1 },
    { name: 'isc', type: 'number', unit: 'A', description: '스트링 단락전류 (Isc)', min: 0.01, defaultValue: 11 },
    { name: 'length', type: 'number', unit: 'm', description: '케이블 편도 길이', min: 0.1 },
    { name: 'maxVoltageDrop', type: 'number', unit: '%', description: '허용 전압강하율 (0.1~10)', min: 0.1, max: 10, defaultValue: 2, step: 0.1 },
  ],
  'pcs-capacity': [
    { name: 'batteryCapacity', type: 'number', unit: 'kWh', description: '배터리 용량', min: 0.1 },
    { name: 'maxChargeRate', type: 'number', unit: 'C', description: '최대 충전율 (C-rate)', min: 0.1, defaultValue: 0.5, step: 0.1 },
    { name: 'maxDischargeRate', type: 'number', unit: 'C', description: '최대 방전율 (C-rate)', min: 0.1, defaultValue: 0.5, step: 0.1 },
    { name: 'efficiency', type: 'number', unit: '', description: 'PCS 효율 (0.01~1)', min: 0.01, max: 1, defaultValue: 0.95, step: 0.01 },
    { name: 'gridVoltage', type: 'number', unit: 'V', description: '계통(그리드) 전압', min: 1, defaultValue: 380 },
  ],
  'grid-connect': [
    { name: 'pvCapacity', type: 'number', unit: 'kWp', description: '태양광 설치 용량', min: 0.1 },
    { name: 'batteryCapacity', type: 'number', unit: 'kWh', description: 'ESS 배터리 용량 (없으면 0)', min: 0, defaultValue: 0 },
    { name: 'gridVoltage', type: 'number', unit: 'V', description: '계통 전압', min: 1, defaultValue: 380 },
    { name: 'contractDemand', type: 'number', unit: 'kW', description: '계약 전력', min: 0.1 },
  ],
  'substation-capacity': [
    { name: 'loads', type: 'array', unit: '', description: '부하 목록', minItems: 1, itemSchema: [
      { name: 'name', type: 'string', unit: '', description: '명칭', defaultValue: '부하' },
      { name: 'kW', type: 'number', unit: 'kW', description: '용량', min: 0.01, defaultValue: 50 },
      { name: 'pf', type: 'number', unit: '', description: '역률', min: 0.01, max: 1, defaultValue: 0.85, step: 0.01 },
      { name: 'demandFactor', type: 'number', unit: '', description: '수용률', min: 0.01, max: 1, defaultValue: 0.7, step: 0.01 },
    ] },
    { name: 'futureGrowth', type: 'number', unit: '%', description: '장래 증설률 (0~100)', min: 0, max: 100, defaultValue: 25, step: 1 },
    { name: 'redundancy', type: 'string', unit: '', description: '이중화', options: [
      { value: 'N', label: 'N (단일)' },
      { value: 'N+1', label: 'N+1 (예비 1)' },
    ], defaultValue: 'N' },
    { name: 'systemVoltage', type: 'number', unit: 'V', description: '수전(고압) 전압', min: 1, defaultValue: 22900 },
    { name: 'secondaryVoltage', type: 'number', unit: 'V', description: '2차(저압) 모선 전압', min: 1, defaultValue: 380 },
  ],
  'ct-sizing': [
    { name: 'maxLoadCurrent', type: 'number', unit: 'A', description: '최대 부하 전류', min: 0.1, defaultValue: 200 },
    { name: 'relayBurden', type: 'number', unit: 'VA', description: '계전기 부담', min: 0.1, defaultValue: 10 },
    { name: 'leadLength', type: 'number', unit: 'm', description: '리드선 편도 길이', min: 0.1, defaultValue: 20 },
    { name: 'leadSize', type: 'number', unit: 'mm²', description: '리드선 단면적', min: 0.5, defaultValue: 4 },
    { name: 'accuracyClass', type: 'string', unit: '', description: '정확도 등급', options: [
      { value: '0.2', label: '0.2급' },
      { value: '0.5', label: '0.5급' },
      { value: '1.0', label: '1.0급' },
      { value: '5P', label: '5P (보호용)' },
      { value: '10P', label: '10P (보호용)' },
    ], defaultValue: '0.5' },
  ],
  'vt-sizing': [
    { name: 'systemVoltage', type: 'number', unit: 'V', description: '1차 계통 전압 (선간)', min: 1, defaultValue: 22900 },
    { name: 'secondaryVoltage', type: 'number', unit: 'V', description: '2차 전압', min: 1, defaultValue: 110 },
    { name: 'meterBurden', type: 'number', unit: 'VA', description: '계측기 부담', min: 0.1, defaultValue: 15 },
    { name: 'relayBurden', type: 'number', unit: 'VA', description: '보호계전기 부담', min: 0.1, defaultValue: 10 },
    { name: 'accuracyClass', type: 'string', unit: '', description: '정확도 등급', options: [
      { value: '0.2', label: '0.2급' },
      { value: '0.5', label: '0.5급' },
      { value: '1.0', label: '1.0급' },
      { value: '3P', label: '3P (보호용)' },
    ], defaultValue: '0.5' },
    { name: 'wireBurden', type: 'number', unit: 'VA', description: '배선 부담', min: 0, defaultValue: 2 },
    { name: 'connectionType', type: 'string', unit: '', description: '결선 방식', options: [
      { value: 'line-to-line', label: '선간 결선 (L-L)' },
      { value: 'line-to-ground', label: '선-대지 결선 (L-G)' },
    ], defaultValue: 'line-to-line' },
  ],
  'surge-arrester': [
    { name: 'systemVoltage', type: 'number', unit: 'V', description: '계통 전압 (선간)', min: 1, defaultValue: 22900 },
    { name: 'neutralGrounding', type: 'string', unit: '', description: '중성점 접지 방식', options: [
      { value: 'solid', label: '직접접지' },
      { value: 'impedance', label: '임피던스(저항)접지' },
      { value: 'ungrounded', label: '비접지' },
    ], defaultValue: 'solid' },
    { name: 'pollutionLevel', type: 'string', unit: '', description: '오손 등급', options: [
      { value: 'light', label: '경오손 (light)' },
      { value: 'medium', label: '중오손 (medium)' },
      { value: 'heavy', label: '강오손 (heavy)' },
      { value: 'very-heavy', label: '초강오손 (very-heavy)' },
    ], defaultValue: 'medium' },
  ],
  'illuminance': [
    { name: 'area', type: 'number', unit: 'm²', description: '실 면적', min: 0.1, defaultValue: 50 },
    { name: 'requiredLux', type: 'number', unit: 'lx', description: '목표(필요) 조도', min: 1, defaultValue: 500 },
    { name: 'luminousFlux', type: 'number', unit: 'lm', description: '등기구 1개 광속', min: 1, defaultValue: 3000 },
    { name: 'utilizationFactor', type: 'number', unit: '', description: '조명률 (0~1)', min: 0.01, max: 1, defaultValue: 0.5, step: 0.05 },
    { name: 'maintenanceFactor', type: 'number', unit: '', description: '보수율 (0~1)', min: 0.01, max: 1, defaultValue: 0.7, step: 0.05 },
    { name: 'fixtureWattage', type: 'number', unit: 'W', description: '등기구 1개 소비전력', min: 0.1, defaultValue: 40 },
  ],
  'energy-saving': [
    { name: 'beforePower', type: 'number', unit: 'kW', description: '개선 전 소비전력', min: 0.01, defaultValue: 10 },
    { name: 'afterPower', type: 'number', unit: 'kW', description: '개선 후 소비전력', min: 0, defaultValue: 6 },
    { name: 'dailyHours', type: 'number', unit: 'h/day', description: '일일 가동시간', min: 0.1, max: 24, defaultValue: 10 },
    { name: 'annualDays', type: 'number', unit: 'days', description: '연간 가동일수', min: 1, max: 366, defaultValue: 300 },
    { name: 'electricityRate', type: 'number', unit: '원/kWh', description: '전기요금 단가', min: 0.01, defaultValue: 120 },
    { name: 'investmentCost', type: 'number', unit: '원', description: '투자 비용 (선택)', min: 0, defaultValue: 0 },
    { name: 'emissionFactor', type: 'number', unit: 'kg-CO2/kWh', description: 'CO2 배출계수', min: 0, defaultValue: 0.4594, step: 0.0001 },
  ],
  'ups-capacity': [
    { name: 'loadPower', type: 'number', unit: 'kW', description: '부하 전력', min: 0.01, defaultValue: 10 },
    { name: 'loadPF', type: 'number', unit: '', description: '부하 역률 (0~1)', min: 0.01, max: 1, defaultValue: 0.8, step: 0.01 },
    { name: 'backupMinutes', type: 'number', unit: 'min', description: '백업 시간(분)', min: 1, defaultValue: 15 },
    { name: 'inputVoltage', type: 'number', unit: 'V', description: 'UPS 입력 전압', min: 1, defaultValue: 380 },
    { name: 'batteryVoltage', type: 'number', unit: 'V', description: '배터리 뱅크 전압', min: 1, defaultValue: 384 },
    { name: 'efficiency', type: 'number', unit: '', description: 'UPS 효율 (0~1)', min: 0.01, max: 1, defaultValue: 0.95, step: 0.01 },
    { name: 'safetyFactor', type: 'number', unit: '', description: '여유율 (1.0~3.0)', min: 1, max: 3, defaultValue: 1.25, step: 0.05 },
    { name: 'depthOfDischarge', type: 'number', unit: '', description: '방전심도 DoD (0~1)', min: 0.01, max: 1, defaultValue: 0.8, step: 0.05 },
    { name: 'cellVoltage', type: 'number', unit: 'V', description: '셀 전압', min: 0.1, defaultValue: 12 },
  ],
  'emergency-generator': [
    { name: 'emergencyLoads', type: 'array', unit: '', description: '비상 부하 목록', minItems: 1, itemSchema: [
      { name: 'name', type: 'string', unit: '', description: '명칭', defaultValue: '비상부하' },
      { name: 'kW', type: 'number', unit: 'kW', description: '용량', min: 0.01, defaultValue: 20 },
      { name: 'pf', type: 'number', unit: '', description: '역률', min: 0.01, max: 1, defaultValue: 0.8, step: 0.01 },
      { name: 'isMotor', type: 'boolean', unit: '', description: '전동기 부하', defaultValue: false },
    ] },
    { name: 'safetyFactor', type: 'number', unit: '', description: '여유율 (1.0~2.0)', min: 1, max: 2, defaultValue: 1.25, step: 0.05 },
    { name: 'requiredRuntime', type: 'number', unit: 'h', description: '요구 가동시간 (선택)', min: 0.1, defaultValue: 8 },
  ],
  'temp-correction': [
    { name: 'baseAmpacity', type: 'number', unit: 'A', description: '기준 허용전류 (기준 온도에서)', min: 0.01, defaultValue: 100 },
    { name: 'referenceTemp', type: 'number', unit: '°C', description: '기준 주위 온도 (보통 30 또는 40)', min: -40, max: 80, defaultValue: 30 },
    { name: 'actualTemp', type: 'number', unit: '°C', description: '실제 주위 온도 (한대~극한 고온 허용)', min: -40, max: 80, defaultValue: 40 },
    { name: 'maxConductorTemp', type: 'number', unit: '°C', description: '도체 최대 허용 온도 (XLPE 90, PVC 70)', min: 60, max: 250, defaultValue: 90 },
  ],
  'ampacity-global-compare': [
    { name: 'cableSize', type: 'number', unit: 'mm²', description: '케이블 단면적', min: 0.5, defaultValue: 25 },
    { name: 'conductor', type: 'string', unit: '', description: '도체 재질', options: [
      { value: 'copper', label: '구리 (Cu)' },
      { value: 'aluminum', label: '알루미늄 (Al)' },
    ], defaultValue: 'copper' },
    { name: 'insulation', type: 'string', unit: '', description: '절연 종류', options: [
      { value: 'PVC', label: 'PVC (비닐)' },
      { value: 'XLPE', label: 'XLPE (가교폴리에틸렌)' },
    ], defaultValue: 'XLPE' },
    { name: 'ambientTemp', type: 'number', unit: '°C', description: '주위 온도', min: -20, max: 80, defaultValue: 30 },
  ],
  'awg-converter-full': [
    { name: 'value', type: 'number', unit: '', description: '변환할 값 (AWG는 0/음수 허용: 1/0=0, 4/0=-3)', defaultValue: 10 },
    { name: 'fromUnit', type: 'string', unit: '', description: '입력 단위', options: [
      { value: 'awg', label: 'AWG' },
      { value: 'mm2', label: 'mm²' },
      { value: 'kcmil', label: 'kcmil' },
    ], defaultValue: 'awg' },
  ],
  'frequency-compare': [
    { name: 'equipmentType', type: 'string', unit: '', description: '설비 종류', options: [
      { value: 'motor', label: '전동기 (Motor)' },
      { value: 'transformer', label: '변압기 (Transformer)' },
      { value: 'capacitor', label: '커패시터 (Capacitor)' },
      { value: 'impedance', label: '일반 임피던스 (Impedance)' },
    ], defaultValue: 'motor' },
    { name: 'ratedPower', type: 'number', unit: 'kW', description: '정격 출력 (변압기는 kVA)', min: 0.01, defaultValue: 100 },
    { name: 'ratedFreq', type: 'number', unit: 'Hz', description: '기준(정격) 주파수', min: 1, defaultValue: 60 },
    { name: 'targetFreq', type: 'number', unit: 'Hz', description: '목표(운전) 주파수', min: 1, defaultValue: 50 },
    { name: 'motorPoles', type: 'number', unit: '극', description: '전동기 극수 (motor 전용, 기본 4)', min: 2, max: 48, defaultValue: 4, step: 2 },
  ],
  'nec-load-calc': [
    { name: 'occupancyType', type: 'string', unit: '', description: '건물 용도', options: [
      { value: 'dwelling', label: '주거 (Dwelling)' },
      { value: 'office', label: '사무실 (Office)' },
      { value: 'retail', label: '판매시설 (Retail)' },
      { value: 'warehouse', label: '창고 (Warehouse)' },
      { value: 'hospital', label: '병원 (Hospital)' },
      { value: 'hotel', label: '호텔 (Hotel)' },
      { value: 'school', label: '학교 (School)' },
      { value: 'industrial', label: '산업시설 (Industrial)' },
      { value: 'restaurant', label: '음식점 (Restaurant)' },
    ], defaultValue: 'dwelling' },
    { name: 'area', type: 'number', unit: 'm²', description: '총 바닥 면적', min: 0.1, defaultValue: 100 },
    { name: 'smallApplianceCircuits', type: 'number', unit: '회로', description: '소형 가전 회로 수 (주거 최소 2)', min: 0, defaultValue: 2, step: 1 },
    { name: 'laundryCircuits', type: 'number', unit: '회로', description: '세탁 회로 수 (주거 최소 1)', min: 0, defaultValue: 1, step: 1 },
    { name: 'hvacLoad', type: 'number', unit: 'VA', description: 'HVAC 부하', min: 0, defaultValue: 0 },
    { name: 'serviceVoltage', type: 'number', unit: 'V', description: '서비스 전압 (1상 240, 3상 208)', min: 1, defaultValue: 240 },
    { name: 'phases', type: 'number', unit: '', description: '상수 (1 또는 3)', min: 1, max: 3, defaultValue: 1, step: 2 },
  ],
  'token-cost': [
    { name: 'model', type: 'string', unit: '', description: 'AI 모델', options: [
      { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
      { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
      { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
      { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
      { value: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
      { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
      { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
    ], defaultValue: 'gpt-5.6-luna' },
    { name: 'inputTokens', type: 'number', unit: 'tokens', description: '요청당 입력 토큰 수', min: 0, defaultValue: 1000 },
    { name: 'outputTokens', type: 'number', unit: 'tokens', description: '요청당 출력 토큰 수', min: 0, defaultValue: 500 },
    { name: 'requestCount', type: 'number', unit: '회/일', description: '일일 요청 수', min: 1, defaultValue: 1000, step: 1 },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Calculator Display Names
// ═══════════════════════════════════════════════════════════════════════════════

/** Calculator display names (Korean / English) */
export const CALCULATOR_NAMES: Record<string, { name: string; nameEn: string }> = {
  'single-phase-power': { name: '단상 전력 계산', nameEn: 'Single-Phase Power' },
  'three-phase-power': { name: '3상 전력 계산', nameEn: 'Three-Phase Power' },
  'voltage-drop': { name: '전압 강하 계산', nameEn: 'Voltage Drop' },
  'transformer-capacity': { name: '변압기 용량 선정', nameEn: 'Transformer Capacity' },
  'cable-sizing': { name: '케이블 사이징', nameEn: 'Cable Sizing' },
  'short-circuit': { name: '단락 전류 계산', nameEn: 'Short-Circuit Current' },
  'breaker-sizing': { name: '차단기 선정', nameEn: 'Breaker Sizing' },
  'arc-flash': { name: '아크플래시 위험도 (IEEE 1584)', nameEn: 'Arc Flash Hazard Analysis' },
  'ground-resistance': { name: '접지 저항 계산', nameEn: 'Ground Resistance' },
  'solar-generation': { name: '태양광 발전량 계산', nameEn: 'Solar PV Generation' },
  'battery-capacity': { name: '배터리 용량 계산', nameEn: 'Battery Capacity (ESS)' },
  'power-factor': { name: '역률 계산', nameEn: 'Power Factor' },
  'reactive-power': { name: '무효전력 보상 계산', nameEn: 'Reactive Power Compensation' },
  'demand-diversity': { name: '수용률/부등률 계산', nameEn: 'Demand & Diversity Factor' },
  'max-demand': { name: '최대수요전력 계산', nameEn: 'Maximum Demand' },
  'power-loss': { name: '전력 손실 계산', nameEn: 'Power Loss' },
  'three-phase-vd': { name: '3상 전압강하', nameEn: 'Three-Phase Voltage Drop' },
  'complex-voltage-drop': { name: '임피던스 기반 전압강하', nameEn: 'Complex Voltage Drop' },
  'busbar-vd': { name: '부스바 전압강하', nameEn: 'Busbar Voltage Drop' },
  'country-compare-vd': { name: '국가별 전압강하 비교', nameEn: 'Country VD Comparison' },
  'awg-converter': { name: 'AWG↔mm² 변환', nameEn: 'AWG Converter' },
  'ampacity-compare': { name: '허용전류 비교', nameEn: 'Ampacity Comparison' },
  'cable-impedance': { name: '케이블 임피던스', nameEn: 'Cable Impedance' },
  'transformer-loss': { name: '변압기 손실 계산', nameEn: 'Transformer Loss' },
  'transformer-efficiency': { name: '변압기 효율 계산', nameEn: 'Transformer Efficiency' },
  'impedance-voltage': { name: '임피던스 전압 계산', nameEn: 'Impedance Voltage' },
  'inrush-current': { name: '돌입전류 계산', nameEn: 'Inrush Current' },
  'parallel-operation': { name: '병렬운전 계산', nameEn: 'Parallel Operation' },
  'earth-fault': { name: '지락 전류 계산', nameEn: 'Earth Fault Current' },
  'rcd-sizing': { name: '누전차단기 선정', nameEn: 'RCD Sizing' },
  'relay-basic': { name: '과전류 계전기', nameEn: 'Overcurrent Relay' },
  'ground-conductor': { name: '접지 도체 사이징', nameEn: 'Grounding Conductor' },
  'equipotential-bonding': { name: '등전위 본딩', nameEn: 'Equipotential Bonding' },
  'lightning-protection': { name: '피뢰 시스템', nameEn: 'Lightning Protection' },
  'motor-capacity': { name: '전동기 용량 계산', nameEn: 'Motor Capacity' },
  'starting-current': { name: '기동전류 계산', nameEn: 'Starting Current' },
  'motor-efficiency': { name: '전동기 효율', nameEn: 'Motor Efficiency' },
  'inverter-capacity': { name: '인버터 용량', nameEn: 'Inverter Capacity' },
  'motor-pf-correction': { name: '역률 보상', nameEn: 'Motor PF Correction' },
  'braking-resistor': { name: '제동 저항기', nameEn: 'Braking Resistor' },
  'solar-cable': { name: '태양광 DC 케이블', nameEn: 'Solar DC Cable' },
  'pcs-capacity': { name: 'PCS 용량', nameEn: 'PCS Capacity' },
  'grid-connect': { name: '계통 연계', nameEn: 'Grid Connection' },
  'substation-capacity': { name: '수변전 용량', nameEn: 'Substation Capacity' },
  'ct-sizing': { name: 'CT 선정', nameEn: 'CT Sizing' },
  'vt-sizing': { name: 'VT 선정', nameEn: 'VT Sizing' },
  'surge-arrester': { name: '피뢰기 선정', nameEn: 'Surge Arrester' },
  'illuminance': { name: '조도 계산', nameEn: 'Illuminance' },
  'energy-saving': { name: '에너지 절감', nameEn: 'Energy Saving' },
  'ups-capacity': { name: 'UPS 용량', nameEn: 'UPS Capacity' },
  'emergency-generator': { name: '비상 발전기', nameEn: 'Emergency Generator' },
  'temp-correction': { name: '온도 보정', nameEn: 'Temperature Correction' },
  'ampacity-global-compare': { name: '글로벌 허용전류', nameEn: 'Global Ampacity' },
  'awg-converter-full': { name: '통합 변환', nameEn: 'Full Unit Converter' },
  'frequency-compare': { name: '주파수 비교', nameEn: 'Frequency Comparison' },
  'nec-load-calc': { name: 'NEC 부하 계산', nameEn: 'NEC Load Calculation' },
  'token-cost': { name: '토큰 비용', nameEn: 'AI Token Cost' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Linked / Suggested Next Calculators
// ═══════════════════════════════════════════════════════════════════════════════

/** Linked / suggested next calculators for chaining workflows */
export const LINKED_CALCS: Record<string, { id: string; category: string; label: string }[]> = {
  'single-phase-power': [{ id: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'three-phase-power': [{ id: 'transformer-capacity', category: 'transformer', label: '변압기 용량' }, { id: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'voltage-drop': [{ id: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'transformer-capacity': [{ id: 'ct-sizing', category: 'substation', label: 'CT 선정' }, { id: 'short-circuit', category: 'protection', label: '단락전류 계산' }, { id: 'breaker-sizing', category: 'protection', label: '차단기 선정' }],
  'cable-sizing': [{ id: 'voltage-drop', category: 'voltage-drop', label: '전압강하 확인' }],
  'short-circuit': [{ id: 'breaker-sizing', category: 'protection', label: '차단기 선정' }],
  'breaker-sizing': [{ id: 'short-circuit', category: 'protection', label: '단락전류 계산' }],
  'ground-resistance': [{ id: 'ground-conductor', category: 'grounding', label: '접지 도체' }, { id: 'earth-fault', category: 'protection', label: '지락 전류' }],
  'solar-generation': [{ id: 'battery-capacity', category: 'renewable', label: '배터리 용량' }],
  'battery-capacity': [{ id: 'solar-generation', category: 'renewable', label: '태양광 발전량' }],
  'power-factor': [{ id: 'reactive-power', category: 'power', label: '무효전력 보상' }],
  'reactive-power': [{ id: 'power-factor', category: 'power', label: '역률 계산' }],
  'demand-diversity': [{ id: 'max-demand', category: 'power', label: '최대수요전력' }],
  'max-demand': [{ id: 'transformer-capacity', category: 'transformer', label: '변압기 용량' }, { id: 'demand-diversity', category: 'power', label: '수용률/부등률' }],
  'power-loss': [{ id: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'three-phase-vd': [{ id: 'voltage-drop', category: 'voltage-drop', label: '전압강하 계산' }],
  'complex-voltage-drop': [{ id: 'voltage-drop', category: 'voltage-drop', label: '전압강하 계산' }],
  'busbar-vd': [],
  'country-compare-vd': [],
  'awg-converter': [{ id: 'awg-converter-full', category: 'global', label: '통합 변환' }],
  'ampacity-compare': [{ id: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'cable-impedance': [{ id: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'transformer-loss': [{ id: 'transformer-efficiency', category: 'transformer', label: '변압기 효율' }],
  'transformer-efficiency': [{ id: 'transformer-loss', category: 'transformer', label: '변압기 손실' }],
  'impedance-voltage': [{ id: 'short-circuit', category: 'protection', label: '단락전류 계산' }],
  'inrush-current': [{ id: 'breaker-sizing', category: 'protection', label: '차단기 선정' }],
  'parallel-operation': [],
  'earth-fault': [{ id: 'rcd-sizing', category: 'protection', label: '누전차단기 선정' }, { id: 'ground-resistance', category: 'grounding', label: '접지 저항' }],
  'rcd-sizing': [{ id: 'earth-fault', category: 'protection', label: '지락 전류' }],
  'relay-basic': [{ id: 'short-circuit', category: 'protection', label: '단락전류 계산' }],
  'ground-conductor': [{ id: 'ground-resistance', category: 'grounding', label: '접지 저항' }],
  'equipotential-bonding': [{ id: 'ground-conductor', category: 'grounding', label: '접지 도체' }],
  'lightning-protection': [],
  'motor-capacity': [{ id: 'starting-current', category: 'motor', label: '기동전류' }, { id: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'starting-current': [{ id: 'breaker-sizing', category: 'protection', label: '차단기 선정' }, { id: 'motor-capacity', category: 'motor', label: '전동기 용량' }],
  'motor-efficiency': [],
  'inverter-capacity': [{ id: 'motor-capacity', category: 'motor', label: '전동기 용량' }],
  'motor-pf-correction': [{ id: 'reactive-power', category: 'power', label: '무효전력 보상' }],
  'braking-resistor': [],
  'solar-cable': [{ id: 'pcs-capacity', category: 'renewable', label: 'PCS 용량' }, { id: 'solar-generation', category: 'renewable', label: '태양광 발전량' }],
  'pcs-capacity': [{ id: 'grid-connect', category: 'renewable', label: '계통연계' }, { id: 'battery-capacity', category: 'renewable', label: '배터리 용량' }],
  'grid-connect': [{ id: 'solar-generation', category: 'renewable', label: '태양광 발전량' }],
  'substation-capacity': [{ id: 'transformer-capacity', category: 'transformer', label: '변압기 용량' }, { id: 'max-demand', category: 'power', label: '최대수요전력' }],
  'ct-sizing': [{ id: 'breaker-sizing', category: 'protection', label: '차단기 선정' }, { id: 'vt-sizing', category: 'substation', label: 'VT 선정' }],
  'vt-sizing': [{ id: 'ct-sizing', category: 'equipment', label: 'CT 선정' }],
  'surge-arrester': [],
  'illuminance': [],
  'energy-saving': [],
  'ups-capacity': [{ id: 'emergency-generator', category: 'equipment', label: '비상 발전기' }],
  'emergency-generator': [{ id: 'ups-capacity', category: 'equipment', label: 'UPS 용량' }],
  'temp-correction': [{ id: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'ampacity-global-compare': [{ id: 'ampacity-compare', category: 'cable', label: '허용전류 비교' }],
  'awg-converter-full': [{ id: 'awg-converter', category: 'cable', label: 'AWG 변환' }],
  'frequency-compare': [],
  'nec-load-calc': [{ id: 'max-demand', category: 'power', label: '최대수요전력' }],
  'token-cost': [],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get param definitions for a calculator by ID.
 * Returns empty array if calculator ID is not found.
 */
export function getCalcParams(calculatorId: string): ExtendedParamDef[] {
  return CALCULATOR_PARAMS[calculatorId] ?? [];
}

/**
 * Get display name (ko/en) for a calculator by ID.
 * Returns undefined if calculator ID is not found.
 */
export function getCalcName(calculatorId: string): { name: string; nameEn: string } | undefined {
  return CALCULATOR_NAMES[calculatorId];
}
