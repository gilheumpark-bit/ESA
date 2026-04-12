'use client';

/**
 * Individual Calculator Page — Dynamic route /calc/[category]/[id]
 *
 * PART 1: Calculator param definitions
 * PART 2: Result display component
 * PART 3: Action buttons
 * PART 4: Main page component
 */

import { use, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  FileDown,
  FileSpreadsheet,
  Share2,
  RotateCcw,
  ArrowRight,
  Calculator,
  AlertTriangle,
  Info,
  Link2,
} from 'lucide-react';
import CalculatorForm from '@/components/CalculatorForm';
import ReceiptCard from '@/components/ReceiptCard';
import CalcResultGauge from '@/components/CalcResultGauge';
import { useCalculator } from '@/hooks/useCalculator';
import type { ExtendedParamDef } from '@/components/CalculatorForm';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Calculator Param Definitions
// ═══════════════════════════════════════════════════════════════════════════════

/** Static param definitions for each calculator */
const CALCULATOR_PARAMS: Record<string, ExtendedParamDef[]> = {
  'single-phase-power': [
    { name: 'voltage', type: 'number', unit: 'V', description: '전압 (공칭전압)', min: 0.1, defaultValue: 220 },
    { name: 'current', type: 'number', unit: 'A', description: '전류', min: 0.01 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률 (0~1)', min: 0, max: 1, defaultValue: 0.85, step: 0.01 },
  ],
  'three-phase-power': [
    { name: 'voltage', type: 'number', unit: 'V', description: '선간전압', min: 0.1, defaultValue: 380 },
    { name: 'current', type: 'number', unit: 'A', description: '선전류', min: 0.01 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률 (0~1)', min: 0, max: 1, defaultValue: 0.85, step: 0.01 },
  ],
  'voltage-drop': [
    { name: 'voltage', type: 'number', unit: 'V', description: '공급 전압', min: 0.1, defaultValue: 380 },
    { name: 'current', type: 'number', unit: 'A', description: '부하 전류', min: 0.01 },
    { name: 'length', type: 'number', unit: 'm', description: '전선 길이 (편도)', min: 0.1 },
    { name: 'crossSection', type: 'number', unit: 'mm\u00B2', description: '전선 단면적', min: 0.5 },
    { name: 'phases', type: 'number', unit: '', description: '상수 (1 또는 3)', min: 1, max: 3, defaultValue: 3 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0, max: 1, defaultValue: 0.85, step: 0.01 },
    { name: 'resistivity', type: 'number', unit: '\u03A9\u00B7mm\u00B2/m', description: '저항률 (구리: 0.0178)', min: 0.001, defaultValue: 0.0178, step: 0.001 },
  ],
  'transformer-capacity': [
    { name: 'totalLoad', type: 'number', unit: 'kW', description: '총 부하 용량', min: 0.1 },
    { name: 'demandFactor', type: 'number', unit: '', description: '수용률 (0~1)', min: 0.01, max: 1, defaultValue: 0.7, step: 0.01 },
    { name: 'growthFactor', type: 'number', unit: '', description: '장래 증설 계수', min: 1, defaultValue: 1.25, step: 0.05 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.1, max: 1, defaultValue: 0.85, step: 0.01 },
  ],
  'cable-sizing': [
    { name: 'current', type: 'number', unit: 'A', description: '설계 전류', min: 0.01 },
    { name: 'ambientTemp', type: 'number', unit: '\u00B0C', description: '주위 온도', min: -20, max: 80, defaultValue: 30 },
    { name: 'installMethod', type: 'string', unit: '', description: '시공 방법', options: [
      { value: 'tray', label: '케이블 트레이' },
      { value: 'conduit', label: '전선관' },
      { value: 'direct', label: '직매' },
      { value: 'duct', label: '덕트' },
    ] },
    { name: 'conductorMaterial', type: 'string', unit: '', description: '도체 재질', options: [
      { value: 'copper', label: '구리 (Cu)' },
      { value: 'aluminum', label: '알루미늄 (Al)' },
    ], defaultValue: 'copper' },
    { name: 'insulationType', type: 'string', unit: '', description: '절연 종류', options: [
      { value: 'XLPE', label: 'XLPE (가교폴리에틸렌)' },
      { value: 'PVC', label: 'PVC (비닐)' },
      { value: 'EPR', label: 'EPR (에틸렌프로필렌)' },
    ], defaultValue: 'XLPE' },
    { name: 'groupingFactor', type: 'number', unit: '', description: '다조 보정계수 (0~1)', min: 0.1, max: 1, defaultValue: 1, step: 0.01 },
  ],
  'short-circuit': [
    { name: 'voltage', type: 'number', unit: 'V', description: '계통 전압', min: 0.1, defaultValue: 380 },
    { name: 'transformerCapacity', type: 'number', unit: 'kVA', description: '변압기 용량', min: 1 },
    { name: 'impedancePercent', type: 'number', unit: '%', description: '변압기 %임피던스', min: 0.1, max: 20, defaultValue: 5, step: 0.1 },
  ],
  'breaker-sizing': [
    { name: 'loadCurrent', type: 'number', unit: 'A', description: '부하 전류', min: 0.01 },
    { name: 'shortCircuitCurrent', type: 'number', unit: 'kA', description: '예상 단락전류', min: 0.1 },
    { name: 'breakerType', type: 'string', unit: '', description: '차단기 유형', options: [
      { value: 'MCCB', label: 'MCCB (배선용차단기)' },
      { value: 'ACB', label: 'ACB (기중차단기)' },
    ], defaultValue: 'MCCB' },
  ],
  'ground-resistance': [
    { name: 'soilResistivity', type: 'number', unit: '\u03A9\u00B7m', description: '대지 저항률', min: 1, defaultValue: 100 },
    { name: 'rodLength', type: 'number', unit: 'm', description: '접지봉 길이', min: 0.1, defaultValue: 2.4 },
    { name: 'rodRadius', type: 'number', unit: 'm', description: '접지봉 반경', min: 0.001, defaultValue: 0.008, step: 0.001 },
  ],
  'solar-generation': [
    { name: 'capacity', type: 'number', unit: 'kWp', description: '설치 용량', min: 0.1 },
    { name: 'peakSunHours', type: 'number', unit: 'h/day', description: '일일 피크 일사시간', min: 0.1, max: 12, defaultValue: 3.5 },
    { name: 'performanceRatio', type: 'number', unit: '', description: '종합 설비 이용률 (0~1)', min: 0.1, max: 1, defaultValue: 0.75, step: 0.01 },
    { name: 'daysPerYear', type: 'number', unit: 'days', description: '연간 가동일', min: 1, max: 366, defaultValue: 365 },
  ],
  'battery-capacity': [
    { name: 'loadPower', type: 'number', unit: 'kW', description: '부하 전력', min: 0.01 },
    { name: 'backupHours', type: 'number', unit: 'h', description: '백업 시간', min: 0.1, defaultValue: 4 },
    { name: 'systemVoltage', type: 'number', unit: 'V', description: '시스템 전압', min: 1, defaultValue: 48 },
    { name: 'depthOfDischarge', type: 'number', unit: '', description: 'DOD (0~1)', min: 0.1, max: 1, defaultValue: 0.8, step: 0.05 },
    { name: 'inverterEfficiency', type: 'number', unit: '', description: '인버터 효율 (0~1)', min: 0.5, max: 1, defaultValue: 0.95, step: 0.01 },
  ],
  'power-factor': [
    { name: 'activePower', type: 'number', unit: 'kW', description: '유효전력', min: 0.01 },
    { name: 'apparentPower', type: 'number', unit: 'kVA', description: '피상전력', min: 0.01 },
  ],
  'reactive-power': [
    { name: 'activePower', type: 'number', unit: 'kW', description: '유효전력', min: 0.01 },
    { name: 'currentPF', type: 'number', unit: '', description: '현재 역률', min: 0.1, max: 1, defaultValue: 0.75, step: 0.01 },
    { name: 'targetPF', type: 'number', unit: '', description: '목표 역률', min: 0.1, max: 1, defaultValue: 0.95, step: 0.01 },
  ],
  'demand-diversity': [
    { name: 'totalConnectedLoad', type: 'number', unit: 'kW', description: '총 설비용량', min: 0.1 },
    { name: 'demandFactor', type: 'number', unit: '', description: '수용률 (0~1)', min: 0.01, max: 1, defaultValue: 0.7, step: 0.01 },
    { name: 'diversityFactor', type: 'number', unit: '', description: '부등률', min: 1, defaultValue: 1.2, step: 0.1 },
  ],
  'max-demand': [
    { name: 'totalLoad', type: 'number', unit: 'kW', description: '총 부하', min: 0.1 },
    { name: 'demandFactor', type: 'number', unit: '', description: '수용률', min: 0.01, max: 1, defaultValue: 0.7, step: 0.01 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.1, max: 1, defaultValue: 0.85, step: 0.01 },
  ],
  'power-loss': [
    { name: 'current', type: 'number', unit: 'A', description: '전류', min: 0.01 },
    { name: 'resistance', type: 'number', unit: '\u03A9', description: '저항', min: 0.001 },
    { name: 'length', type: 'number', unit: 'm', description: '전선 길이', min: 0.1 },
  ],
  'three-phase-vd': [
    { name: 'voltage', type: 'number', unit: 'V', description: '선간전압', min: 0.1, defaultValue: 380 },
    { name: 'current', type: 'number', unit: 'A', description: '전류', min: 0.01 },
    { name: 'length', type: 'number', unit: 'm', description: '전선 길이', min: 0.1 },
    { name: 'crossSection', type: 'number', unit: 'mm\u00B2', description: '단면적', min: 0.5 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0, max: 1, defaultValue: 0.85, step: 0.01 },
  ],
  'complex-voltage-drop': [
    { name: 'voltage', type: 'number', unit: 'V', description: '전압', min: 0.1, defaultValue: 380 },
    { name: 'current', type: 'number', unit: 'A', description: '전류', min: 0.01 },
    { name: 'resistance', type: 'number', unit: '\u03A9/km', description: '저항', min: 0.001 },
    { name: 'reactance', type: 'number', unit: '\u03A9/km', description: '리액턴스', min: 0.001 },
    { name: 'length', type: 'number', unit: 'km', description: '길이', min: 0.001 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0, max: 1, defaultValue: 0.85, step: 0.01 },
  ],
  'busbar-vd': [
    { name: 'voltage', type: 'number', unit: 'V', description: '전압', min: 0.1, defaultValue: 380 },
    { name: 'totalCurrent', type: 'number', unit: 'A', description: '총 전류', min: 0.01 },
    { name: 'busbarLength', type: 'number', unit: 'm', description: '부스바 길이', min: 0.1 },
    { name: 'crossSection', type: 'number', unit: 'mm\u00B2', description: '단면적', min: 1 },
    { name: 'tapCount', type: 'number', unit: '', description: '분기 수', min: 1, defaultValue: 5 },
  ],
  'country-compare-vd': [
    { name: 'voltage', type: 'number', unit: 'V', description: '전압', min: 0.1, defaultValue: 380 },
    { name: 'current', type: 'number', unit: 'A', description: '전류', min: 0.01 },
    { name: 'length', type: 'number', unit: 'm', description: '길이', min: 0.1 },
    { name: 'crossSection', type: 'number', unit: 'mm\u00B2', description: '단면적', min: 0.5 },
  ],
  'awg-converter': [
    { name: 'awgSize', type: 'number', unit: 'AWG', description: 'AWG 사이즈', min: 0, max: 40, defaultValue: 10 },
  ],
  'ampacity-compare': [
    { name: 'crossSection', type: 'number', unit: 'mm\u00B2', description: '단면적', min: 0.5, defaultValue: 25 },
    { name: 'ambientTemp', type: 'number', unit: '\u00B0C', description: '주위 온도', min: -20, max: 80, defaultValue: 30 },
  ],
  'cable-impedance': [
    { name: 'crossSection', type: 'number', unit: 'mm\u00B2', description: '단면적', min: 0.5 },
    { name: 'length', type: 'number', unit: 'm', description: '길이', min: 0.1 },
    { name: 'frequency', type: 'number', unit: 'Hz', description: '주파수', min: 1, defaultValue: 60 },
  ],
  'transformer-loss': [
    { name: 'capacity', type: 'number', unit: 'kVA', description: '변압기 용량', min: 1 },
    { name: 'noLoadLoss', type: 'number', unit: 'W', description: '무부하 손실', min: 0 },
    { name: 'loadLoss', type: 'number', unit: 'W', description: '부하 손실', min: 0 },
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
    { name: 'capacity', type: 'number', unit: 'kVA', description: '용량', min: 1 },
    { name: 'primaryVoltage', type: 'number', unit: 'V', description: '1차 전압', min: 1 },
    { name: 'impedancePercent', type: 'number', unit: '%', description: '%임피던스', min: 0.1, defaultValue: 5, step: 0.1 },
  ],
  'inrush-current': [
    { name: 'capacity', type: 'number', unit: 'kVA', description: '용량', min: 1 },
    { name: 'voltage', type: 'number', unit: 'V', description: '전압', min: 1, defaultValue: 380 },
    { name: 'inrushMultiplier', type: 'number', unit: '', description: '돌입전류 배수', min: 1, defaultValue: 8 },
  ],
  'parallel-operation': [
    { name: 'capacity1', type: 'number', unit: 'kVA', description: '변압기1 용량', min: 1 },
    { name: 'capacity2', type: 'number', unit: 'kVA', description: '변압기2 용량', min: 1 },
    { name: 'impedance1', type: 'number', unit: '%', description: '변압기1 %Z', min: 0.1, defaultValue: 5, step: 0.1 },
    { name: 'impedance2', type: 'number', unit: '%', description: '변압기2 %Z', min: 0.1, defaultValue: 5, step: 0.1 },
  ],
  'earth-fault': [
    { name: 'voltage', type: 'number', unit: 'V', description: '계통 전압', min: 0.1, defaultValue: 380 },
    { name: 'groundResistance', type: 'number', unit: '\u03A9', description: '접지 저항', min: 0.01 },
    { name: 'faultResistance', type: 'number', unit: '\u03A9', description: '고장점 저항', min: 0, defaultValue: 0 },
  ],
  'rcd-sizing': [
    { name: 'circuitCurrent', type: 'number', unit: 'A', description: '회로 전류', min: 0.01 },
    { name: 'leakageCurrent', type: 'number', unit: 'mA', description: '누설전류', min: 0.1, defaultValue: 30 },
    { name: 'groundResistance', type: 'number', unit: '\u03A9', description: '접지 저항', min: 0.01 },
  ],
  'relay-basic': [
    { name: 'ctRatio', type: 'number', unit: '', description: 'CT비', min: 1, defaultValue: 200 },
    { name: 'loadCurrent', type: 'number', unit: 'A', description: '부하 전류', min: 0.01 },
    { name: 'faultCurrent', type: 'number', unit: 'A', description: '고장 전류', min: 0.1 },
    { name: 'pickupMultiplier', type: 'number', unit: '', description: 'Pickup 배수', min: 1, defaultValue: 1.5, step: 0.1 },
  ],
  'ground-conductor': [
    { name: 'faultCurrent', type: 'number', unit: 'A', description: '고장 전류', min: 0.1 },
    { name: 'clearingTime', type: 'number', unit: 's', description: '차단 시간', min: 0.01, defaultValue: 0.5 },
    { name: 'material', type: 'string', unit: '', description: '도체 재질', options: [{ value: 'copper', label: '구리' }, { value: 'aluminum', label: '알루미늄' }], defaultValue: 'copper' },
  ],
  'equipotential-bonding': [
    { name: 'faultCurrent', type: 'number', unit: 'A', description: '고장 전류', min: 0.1 },
    { name: 'clearingTime', type: 'number', unit: 's', description: '차단 시간', min: 0.01, defaultValue: 0.5 },
  ],
  'lightning-protection': [
    { name: 'buildingHeight', type: 'number', unit: 'm', description: '건물 높이', min: 1 },
    { name: 'buildingLength', type: 'number', unit: 'm', description: '건물 길이', min: 1 },
    { name: 'buildingWidth', type: 'number', unit: 'm', description: '건물 폭', min: 1 },
    { name: 'protectionLevel', type: 'string', unit: '', description: '보호등급', options: [{ value: 'I', label: 'I등급' }, { value: 'II', label: 'II등급' }, { value: 'III', label: 'III등급' }, { value: 'IV', label: 'IV등급' }], defaultValue: 'III' },
  ],
  'motor-capacity': [
    { name: 'loadTorque', type: 'number', unit: 'N\u00B7m', description: '부하 토크', min: 0.01 },
    { name: 'speed', type: 'number', unit: 'rpm', description: '회전수', min: 1, defaultValue: 1800 },
    { name: 'efficiency', type: 'number', unit: '', description: '효율 (0~1)', min: 0.1, max: 1, defaultValue: 0.9, step: 0.01 },
    { name: 'safetyFactor', type: 'number', unit: '', description: '안전계수', min: 1, defaultValue: 1.25, step: 0.05 },
  ],
  'starting-current': [
    { name: 'ratedPower', type: 'number', unit: 'kW', description: '정격 출력', min: 0.1 },
    { name: 'voltage', type: 'number', unit: 'V', description: '전압', min: 1, defaultValue: 380 },
    { name: 'efficiency', type: 'number', unit: '', description: '효율', min: 0.1, max: 1, defaultValue: 0.9, step: 0.01 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.1, max: 1, defaultValue: 0.85, step: 0.01 },
    { name: 'startingMultiplier', type: 'number', unit: '', description: '기동전류 배수', min: 1, defaultValue: 6 },
  ],
  'motor-efficiency': [
    { name: 'ratedPower', type: 'number', unit: 'kW', description: '정격 출력', min: 0.1 },
    { name: 'inputPower', type: 'number', unit: 'kW', description: '입력 전력', min: 0.1 },
  ],
  'inverter-capacity': [
    { name: 'motorPower', type: 'number', unit: 'kW', description: '전동기 출력', min: 0.1 },
    { name: 'safetyFactor', type: 'number', unit: '', description: '여유율', min: 1, defaultValue: 1.25, step: 0.05 },
  ],
  'motor-pf-correction': [
    { name: 'motorPower', type: 'number', unit: 'kW', description: '전동기 출력', min: 0.1 },
    { name: 'currentPF', type: 'number', unit: '', description: '현재 역률', min: 0.1, max: 1, defaultValue: 0.75, step: 0.01 },
    { name: 'targetPF', type: 'number', unit: '', description: '목표 역률', min: 0.1, max: 1, defaultValue: 0.95, step: 0.01 },
  ],
  'braking-resistor': [
    { name: 'motorPower', type: 'number', unit: 'kW', description: '전동기 출력', min: 0.1 },
    { name: 'brakingTorque', type: 'number', unit: '%', description: '제동 토크 (%)', min: 1, max: 200, defaultValue: 100 },
    { name: 'dutyCycle', type: 'number', unit: '%', description: '통전율 (%)', min: 1, max: 100, defaultValue: 10 },
  ],
  'solar-cable': [
    { name: 'stringCurrent', type: 'number', unit: 'A', description: '스트링 전류', min: 0.01 },
    { name: 'stringVoltage', type: 'number', unit: 'V', description: '스트링 전압', min: 1 },
    { name: 'cableLength', type: 'number', unit: 'm', description: '케이블 길이', min: 0.1 },
    { name: 'maxDropPercent', type: 'number', unit: '%', description: '허용 전압강하율', min: 0.1, max: 10, defaultValue: 2, step: 0.1 },
  ],
  'pcs-capacity': [
    { name: 'batteryCapacity', type: 'number', unit: 'kWh', description: '배터리 용량', min: 0.1 },
    { name: 'dischargeRate', type: 'number', unit: 'C', description: '방전율', min: 0.1, defaultValue: 0.5, step: 0.1 },
    { name: 'efficiency', type: 'number', unit: '', description: 'PCS 효율', min: 0.5, max: 1, defaultValue: 0.95, step: 0.01 },
  ],
  'grid-connect': [
    { name: 'generationCapacity', type: 'number', unit: 'kW', description: '발전 용량', min: 0.1 },
    { name: 'gridVoltage', type: 'number', unit: 'V', description: '계통 전압', min: 1, defaultValue: 22900 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.1, max: 1, defaultValue: 0.95, step: 0.01 },
  ],
  'substation-capacity': [
    { name: 'totalLoad', type: 'number', unit: 'kW', description: '총 부하', min: 0.1 },
    { name: 'demandFactor', type: 'number', unit: '', description: '수용률', min: 0.01, max: 1, defaultValue: 0.7, step: 0.01 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.1, max: 1, defaultValue: 0.85, step: 0.01 },
    { name: 'growthFactor', type: 'number', unit: '', description: '증설 계수', min: 1, defaultValue: 1.25, step: 0.05 },
  ],
  'ct-sizing': [
    { name: 'primaryCurrent', type: 'number', unit: 'A', description: '1차측 전류', min: 0.1 },
    { name: 'burden', type: 'number', unit: 'VA', description: '부담', min: 0.1, defaultValue: 15 },
    { name: 'accuracy', type: 'string', unit: '', description: '정확도 등급', options: [{ value: '0.5', label: '0.5급' }, { value: '1.0', label: '1.0급' }, { value: '5P', label: '5P (보호용)' }], defaultValue: '0.5' },
  ],
  'vt-sizing': [
    { name: 'primaryVoltage', type: 'number', unit: 'V', description: '1차 전압', min: 1 },
    { name: 'burden', type: 'number', unit: 'VA', description: '부담', min: 0.1, defaultValue: 25 },
    { name: 'accuracy', type: 'string', unit: '', description: '정확도 등급', options: [{ value: '0.5', label: '0.5급' }, { value: '1.0', label: '1.0급' }, { value: '3P', label: '3P (보호용)' }], defaultValue: '0.5' },
  ],
  'surge-arrester': [
    { name: 'systemVoltage', type: 'number', unit: 'kV', description: '계통 전압', min: 0.1 },
    { name: 'groundingType', type: 'string', unit: '', description: '접지 방식', options: [{ value: 'solidly', label: '직접접지' }, { value: 'resistance', label: '저항접지' }, { value: 'ungrounded', label: '비접지' }], defaultValue: 'solidly' },
  ],
  'illuminance': [
    { name: 'roomLength', type: 'number', unit: 'm', description: '실 길이', min: 0.1 },
    { name: 'roomWidth', type: 'number', unit: 'm', description: '실 폭', min: 0.1 },
    { name: 'targetLux', type: 'number', unit: 'lx', description: '목표 조도', min: 1, defaultValue: 500 },
    { name: 'luminousFlux', type: 'number', unit: 'lm', description: '램프 광속', min: 1, defaultValue: 3000 },
    { name: 'maintenanceFactor', type: 'number', unit: '', description: '보수율', min: 0.1, max: 1, defaultValue: 0.7, step: 0.05 },
    { name: 'utilizationFactor', type: 'number', unit: '', description: '조명률', min: 0.1, max: 1, defaultValue: 0.5, step: 0.05 },
  ],
  'energy-saving': [
    { name: 'currentPower', type: 'number', unit: 'kW', description: '현재 소비전력', min: 0.01 },
    { name: 'newPower', type: 'number', unit: 'kW', description: '교체 후 소비전력', min: 0.01 },
    { name: 'operatingHours', type: 'number', unit: 'h/year', description: '연간 가동시간', min: 1, defaultValue: 8760 },
    { name: 'electricityRate', type: 'number', unit: '\uC6D0/kWh', description: '전기요금 단가', min: 0.01, defaultValue: 120 },
  ],
  'ups-capacity': [
    { name: 'totalLoad', type: 'number', unit: 'kVA', description: '총 부하', min: 0.01 },
    { name: 'backupMinutes', type: 'number', unit: 'min', description: '백업 시간(분)', min: 1, defaultValue: 15 },
    { name: 'loadPowerFactor', type: 'number', unit: '', description: '부하 역률', min: 0.1, max: 1, defaultValue: 0.8, step: 0.01 },
    { name: 'redundancy', type: 'string', unit: '', description: '이중화', options: [{ value: 'N', label: 'N (단일)' }, { value: 'N+1', label: 'N+1' }, { value: '2N', label: '2N' }], defaultValue: 'N' },
  ],
  'emergency-generator': [
    { name: 'totalLoad', type: 'number', unit: 'kW', description: '총 부하', min: 0.1 },
    { name: 'motorStartingLoad', type: 'number', unit: 'kW', description: '전동기 기동 부하', min: 0, defaultValue: 0 },
    { name: 'powerFactor', type: 'number', unit: '', description: '역률', min: 0.1, max: 1, defaultValue: 0.8, step: 0.01 },
    { name: 'safetyFactor', type: 'number', unit: '', description: '여유율', min: 1, defaultValue: 1.25, step: 0.05 },
  ],
  'temp-correction': [
    { name: 'ratedCurrent', type: 'number', unit: 'A', description: '정격전류', min: 0.01 },
    { name: 'ratedTemp', type: 'number', unit: '\u00B0C', description: '기준 온도', min: -20, max: 80, defaultValue: 30 },
    { name: 'actualTemp', type: 'number', unit: '\u00B0C', description: '실제 온도', min: -20, max: 80, defaultValue: 40 },
  ],
  'ampacity-global-compare': [
    { name: 'crossSection', type: 'number', unit: 'mm\u00B2', description: '단면적', min: 0.5, defaultValue: 25 },
    { name: 'installMethod', type: 'string', unit: '', description: '시공방법', options: [{ value: 'tray', label: '케이블 트레이' }, { value: 'conduit', label: '전선관' }, { value: 'direct', label: '직매' }], defaultValue: 'tray' },
  ],
  'awg-converter-full': [
    { name: 'inputValue', type: 'number', unit: '', description: '입력값', min: 0.01 },
    { name: 'inputUnit', type: 'string', unit: '', description: '입력 단위', options: [{ value: 'awg', label: 'AWG' }, { value: 'mm2', label: 'mm\u00B2' }, { value: 'kcmil', label: 'kcmil' }], defaultValue: 'awg' },
  ],
  'frequency-compare': [
    { name: 'power', type: 'number', unit: 'kW', description: '전력', min: 0.01 },
    { name: 'voltage', type: 'number', unit: 'V', description: '전압', min: 1, defaultValue: 380 },
    { name: 'baseFrequency', type: 'number', unit: 'Hz', description: '기준 주파수', min: 1, defaultValue: 60 },
  ],
  'nec-load-calc': [
    { name: 'generalLighting', type: 'number', unit: 'VA', description: '일반 조명 부하', min: 0 },
    { name: 'smallAppliance', type: 'number', unit: 'VA', description: '소형 기기 부하', min: 0, defaultValue: 3000 },
    { name: 'laundry', type: 'number', unit: 'VA', description: '세탁 부하', min: 0, defaultValue: 1500 },
    { name: 'applianceLoad', type: 'number', unit: 'VA', description: '기기 부하', min: 0 },
  ],
  'token-cost': [
    { name: 'inputTokens', type: 'number', unit: 'tokens', description: '입력 토큰 수', min: 1, defaultValue: 1000 },
    { name: 'outputTokens', type: 'number', unit: 'tokens', description: '출력 토큰 수', min: 1, defaultValue: 500 },
    { name: 'model', type: 'string', unit: '', description: 'AI 모델', options: [{ value: 'gpt-4.1', label: 'GPT-4.1' }, { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' }, { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' }, { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }], defaultValue: 'gpt-4.1-mini' },
  ],
};

/** Calculator display names */
const CALCULATOR_NAMES: Record<string, { name: string; nameEn: string }> = {
  'single-phase-power': { name: '단상 전력 계산', nameEn: 'Single-Phase Power' },
  'three-phase-power': { name: '3상 전력 계산', nameEn: 'Three-Phase Power' },
  'voltage-drop': { name: '전압 강하 계산', nameEn: 'Voltage Drop' },
  'transformer-capacity': { name: '변압기 용량 선정', nameEn: 'Transformer Capacity' },
  'cable-sizing': { name: '케이블 사이징', nameEn: 'Cable Sizing' },
  'short-circuit': { name: '단락 전류 계산', nameEn: 'Short-Circuit Current' },
  'breaker-sizing': { name: '차단기 선정', nameEn: 'Breaker Sizing' },
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
  'awg-converter': { name: 'AWG\u2194mm\u00B2 변환', nameEn: 'AWG Converter' },
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

/** Linked / suggested next calculators */
const LINKED_CALCS: Record<string, { id: string; category: string; label: string }[]> = {
  'single-phase-power': [{ id: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'three-phase-power': [{ id: 'transformer-capacity', category: 'transformer', label: '변압기 용량' }, { id: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'voltage-drop': [{ id: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'transformer-capacity': [{ id: 'short-circuit', category: 'protection', label: '단락전류 계산' }, { id: 'breaker-sizing', category: 'protection', label: '차단기 선정' }],
  'cable-sizing': [{ id: 'voltage-drop', category: 'voltage-drop', label: '전압강하 확인' }],
  'short-circuit': [{ id: 'breaker-sizing', category: 'protection', label: '차단기 선정' }],
  'breaker-sizing': [],
  'ground-resistance': [],
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
  'solar-cable': [{ id: 'solar-generation', category: 'renewable', label: '태양광 발전량' }],
  'pcs-capacity': [{ id: 'battery-capacity', category: 'renewable', label: '배터리 용량' }],
  'grid-connect': [{ id: 'solar-generation', category: 'renewable', label: '태양광 발전량' }],
  'substation-capacity': [{ id: 'transformer-capacity', category: 'transformer', label: '변압기 용량' }, { id: 'max-demand', category: 'power', label: '최대수요전력' }],
  'ct-sizing': [{ id: 'vt-sizing', category: 'equipment', label: 'VT 선정' }],
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
// PART 2 — Result Display
// ═══════════════════════════════════════════════════════════════════════════════

function ResultDisplay({
  receipt,
  onExportPdf,
  onExportExcel,
  onShare,
  onReset,
  linkedCalcs,
}: {
  receipt: NonNullable<ReturnType<typeof useCalculator>['receipt']>;
  onExportPdf: () => void;
  onExportExcel: () => void;
  onShare: () => void;
  onReset: () => void;
  linkedCalcs: { id: string; category: string; label: string }[];
}) {
  // 게이지 데이터 추출 (전압강하/허용전류 등 기준값이 있는 경우)
  const gaugeData = (() => {
    const r = receipt.result;
    if (!r || r.value == null || typeof r.value !== 'number') return null;
    const unit = r.unit ?? '';
    // 전압강하 → 기준 3%
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (unit === '%' && (receipt as any).calculatorId?.includes('voltage')) {
      return { value: r.value, unit: '%', limit: 3, label: '전압강하', standardRef: 'KEC 232.52', direction: 'below' as const };
    }
    return null;
  })();

  return (
    <div className="space-y-4">
      {/* 게이지 시각화 (기준값이 있는 계산기만) */}
      {gaugeData && (
        <div className="mb-2">
          <CalcResultGauge {...gaugeData} />
        </div>
      )}

      {/* Receipt card (full view) */}
      <ReceiptCard receipt={receipt} variant="full" />

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onExportPdf}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <FileDown size={16} />
          PDF
        </button>
        <button
          type="button"
          onClick={onExportExcel}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <FileSpreadsheet size={16} />
          Excel
        </button>
        <button
          type="button"
          onClick={onShare}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Share2 size={16} />
          공유
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <RotateCcw size={16} />
          재계산
        </button>

        {/* Linked calculators */}
        {linkedCalcs.map((lc) => (
          <Link
            key={lc.id}
            href={`/calc/${lc.category}/${lc.id}`}
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
          >
            <ArrowRight size={16} />
            {lc.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function CalculatorPage({
  params,
}: {
  params: Promise<{ category: string; id: string }>;
}) {
  const { category, id } = use(params);
  const calcMeta = CALCULATOR_NAMES[id];
  const calcParams = CALCULATOR_PARAMS[id];
  const linked = LINKED_CALCS[id] ?? [];

  const { execute, result: _result, receipt, isLoading, error, reset } = useCalculator(id);

  // ═══════════════════════════════════════════════════════════════════════════
  // URL Parameter Support — read on mount, write on calculate
  // ═══════════════════════════════════════════════════════════════════════════

  /** Read initial values from URL searchParams for pre-filling form */
  const urlDefaults = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const params = new URLSearchParams(window.location.search);
    if (params.toString() === '') return undefined;

    const defaults: Record<string, unknown> = {};
    for (const p of calcParams ?? []) {
      const raw = params.get(p.name);
      if (raw !== null) {
        if (p.type === 'number') {
          const n = Number(raw);
          if (!isNaN(n)) defaults[p.name] = n;
        } else if (p.type === 'boolean') {
          defaults[p.name] = raw === 'true' || raw === '1';
        } else {
          defaults[p.name] = raw;
        }
      }
    }
    return Object.keys(defaults).length > 0 ? defaults : undefined;
  }, [calcParams]);

  /** Sync current inputs to URL via replaceState */
  const syncUrlParams = useCallback(
    (values: Record<string, unknown>) => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams();
      for (const [key, val] of Object.entries(values)) {
        if (val !== undefined && val !== null && val !== '') {
          params.set(key, String(val));
        }
      }
      const qs = params.toString();
      const newUrl = qs
        ? `${window.location.pathname}?${qs}`
        : window.location.pathname;
      history.replaceState(null, '', newUrl);
    },
    [],
  );

  /** Share button copies URL with current params */
  const handleShareWithParams = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(
      () => alert('계산기 링크가 복사되었습니다 (입력값 포함)'),
      () => prompt('공유 링크:', url),
    );
  }, []);

  const handleSubmit = useCallback(
    (values: Record<string, unknown>) => {
      syncUrlParams(values);
      execute(values);
    },
    [execute, syncUrlParams],
  );

  const handleExportPdf = useCallback(async () => {
    if (!receipt) return;
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt, format: 'pdf' }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      // Fallback: use browser print
      window.print();
    }
  }, [receipt]);

  const handleExportExcel = useCallback(async () => {
    if (!receipt) return;
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt, format: 'excel' }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ESVA_${receipt.calcId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: generate CSV client-side
      try {
        const lines: string[] = ['항목,값,단위'];
        if (receipt.inputs) {
          for (const [key, val] of Object.entries(receipt.inputs)) {
            lines.push(`${key},${String(val)},`);
          }
        }
        if (receipt.result) {
          lines.push(`결과,${receipt.result.value},${receipt.result.unit}`);
        }
        for (const step of receipt.steps ?? []) {
          lines.push(`Step ${step.step}: ${step.title},${step.value},${step.unit}`);
        }
        const csvBlob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const csvUrl = URL.createObjectURL(csvBlob);
        const a = document.createElement('a');
        a.href = csvUrl;
        a.download = `ESVA_${receipt.calcId}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(csvUrl);
      } catch {
        alert('내보내기에 실패했습니다.');
      }
    }
  }, [receipt]);

  const handleShare = useCallback(async () => {
    if (!receipt) return;
    const url = `${window.location.origin}/receipt/${receipt.id}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('공유 링크가 복사되었습니다');
    } catch {
      prompt('공유 링크:', url);
    }
  }, [receipt]);

  if (!calcMeta || !calcParams) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">
            계산기를 찾을 수 없습니다
          </h1>
          <p className="mb-4 text-[var(--text-secondary)]">ID: {id}</p>
          <Link href="/calc" className="text-[var(--color-primary)] hover:underline">
            계산기 목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {/* Header */}
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Link href="/" className="hover:text-[var(--color-primary)]">ESVA</Link>
            <span>/</span>
            <Link href="/calc" className="hover:text-[var(--color-primary)]">계산기</Link>
            <span>/</span>
            <span>{category}</span>
            <span>/</span>
            <span className="text-[var(--text-primary)]">{calcMeta.name}</span>
          </div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <Calculator size={28} className="text-[var(--color-primary)]" />
            {calcMeta.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{calcMeta.nameEn}</p>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          {/* Left: Form */}
          <div>
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
              <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
                입력값
              </h2>
              <CalculatorForm
                params={calcParams}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                error={error}
                initialValues={urlDefaults}
              />
            </div>

            {/* Share with params */}
            <button
              type="button"
              onClick={handleShareWithParams}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              <Link2 size={14} />
              입력값 포함 링크 복사
            </button>

            {/* Info note */}
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--bg-tertiary)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                KEC/NEC/IEC 기준에 따라 계산됩니다. 실무 적용 시
                반드시 전문가 검증을 거치세요.
              </span>
            </div>
          </div>

          {/* Right: Result */}
          <div>
            {receipt ? (
              <ResultDisplay
                receipt={receipt}
                onExportPdf={handleExportPdf}
                onExportExcel={handleExportExcel}
                onShare={handleShare}
                onReset={reset}
                linkedCalcs={linked}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-primary)] p-12 text-center">
                <div>
                  <Calculator size={48} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
                  <p className="text-sm text-[var(--text-tertiary)]">
                    입력값을 넣고 &ldquo;계산하기&rdquo;를 누르세요
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 rounded-lg bg-[var(--bg-tertiary)] p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
            <div className="text-xs leading-relaxed text-[var(--text-tertiary)]">
              <p className="mb-1 font-medium">면책조항</p>
              <p>
                본 계산 결과는 참고용이며, 법적 효력이 없습니다.
                ESVA 계산기는 공학적 추정치를 제공하며, 실제 설계 및 시공에는
                관련 법규와 전문가의 검증이 필요합니다. 계산 결과의 정확성에 대한
                책임은 사용자에게 있습니다.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
