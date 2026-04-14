/**
 * ESVA Calculator Registry
 *
 * Central registry of all 57 calculator modules.
 * Each entry maps to a pure function: input -> CalcResult.
 */

// ── Re-export shared types ──────────────────────────────────────────────────

export type {
  DetailedCalcResult,
  CalcStep,
  CalculatorRegistryEntry,
  CalculatorCategory,
  DifficultyLevel,
} from './types';
export { CalcValidationError, assertPositive, assertRange, assertOneOf, round } from './types';

// ── Re-export individual calculators ────────────────────────────────────────

// power (8)
export { calculateSinglePhasePower } from './power/single-phase-power';
export type { SinglePhasePowerInput } from './power/single-phase-power';

export { calculateThreePhasePower } from './power/three-phase-power';
export type { ThreePhasePowerInput } from './power/three-phase-power';

export { calculatePowerFactor } from './power/power-factor';
export type { PowerFactorInput } from './power/power-factor';

export { calculateReactivePower } from './power/reactive-power';
export type { ReactivePowerInput } from './power/reactive-power';

export { calculateDemandDiversity } from './power/demand-diversity';
export type { DemandDiversityInput } from './power/demand-diversity';

export { calculateMaxDemand } from './power/max-demand';
export type { MaxDemandInput } from './power/max-demand';

export { calculatePowerLoss } from './power/power-loss';
export type { PowerLossInput } from './power/power-loss';

// voltage-drop (6) — Note: basic voltage-drop re-exported above category comment
export { calculateVoltageDrop } from './voltage-drop/voltage-drop';
export type { VoltageDropInput } from './voltage-drop/voltage-drop';

export { calculateThreePhaseVD } from './voltage-drop/three-phase-vd';
export type { ThreePhaseVDInput } from './voltage-drop/three-phase-vd';

export { calculateComplexVoltageDrop } from './voltage-drop/complex-voltage-drop';
export type { ComplexVoltageDropInput } from './voltage-drop/complex-voltage-drop';

export { calculateBusbarVD } from './voltage-drop/busbar-vd';
export type { BusbarVDInput } from './voltage-drop/busbar-vd';

export { calculateCountryCompareVD } from './voltage-drop/country-compare-vd';
export type { CountryCompareVDInput } from './voltage-drop/country-compare-vd';

// cable (5)
export { calculateCableSizing, CABLE_SIZES_MM2 } from './cable/cable-sizing';
export type { CableSizingInput } from './cable/cable-sizing';

export { convertAwgMm2 } from './cable/awg-converter';
export type { AwgConverterInput } from './cable/awg-converter';

export { compareAmpacityByCountry } from './cable/ampacity-compare';
export type { AmpacityCompareInput } from './cable/ampacity-compare';

export { calculateCableImpedance } from './cable/cable-impedance';
export type { CableImpedanceInput } from './cable/cable-impedance';

// transformer (6)
export { calculateTransformerCapacity, STANDARD_TRANSFORMER_SIZES_KVA } from './transformer/transformer-capacity';
export type { TransformerCapacityInput } from './transformer/transformer-capacity';

export { calculateTransformerLoss } from './transformer/transformer-loss';
export type { TransformerLossInput } from './transformer/transformer-loss';

export { calculateTransformerEfficiency } from './transformer/transformer-efficiency';
export type { TransformerEfficiencyInput } from './transformer/transformer-efficiency';

export { calculateImpedanceVoltage } from './transformer/impedance-voltage';
export type { ImpedanceVoltageInput } from './transformer/impedance-voltage';

export { calculateInrushCurrent } from './transformer/inrush-current';
export type { InrushCurrentInput } from './transformer/inrush-current';

export { calculateParallelOperation } from './transformer/parallel-operation';
export type { ParallelOperationInput } from './transformer/parallel-operation';

// protection (7) — Note: 2 already existed, adding earth-fault, rcd-sizing, relay-basic
export { calculateShortCircuit } from './protection/short-circuit';
export type { ShortCircuitInput } from './protection/short-circuit';

export { calculateBreakerSizing, MCCB_RATINGS_A, STANDARD_BREAKING_CAPACITIES_KA } from './protection/breaker-sizing';
export type { BreakerSizingInput } from './protection/breaker-sizing';

export { calculateEarthFault } from './protection/earth-fault';
export type { EarthFaultInput } from './protection/earth-fault';

export { calculateRCDSizing } from './protection/rcd-sizing';
export type { RCDSizingInput } from './protection/rcd-sizing';

export { calculateRelayBasic } from './protection/relay-basic';
export type { RelayBasicInput } from './protection/relay-basic';
export { calculateArcFlash } from './protection/arc-flash';
export type { ArcFlashInput, ArcFlashResult } from './protection/arc-flash';

// grounding (5) — Note: 1 already existed
export { calculateGroundResistance } from './grounding/ground-resistance';
export type { GroundResistanceInput } from './grounding/ground-resistance';

export { calculateGroundConductor } from './grounding/ground-conductor';
export type { GroundConductorInput } from './grounding/ground-conductor';

export { calculateEquipotentialBonding } from './grounding/equipotential-bonding';
export type { EquipotentialBondingInput } from './grounding/equipotential-bonding';

export { calculateLightningProtection } from './grounding/lightning-protection';
export type { LightningProtectionInput } from './grounding/lightning-protection';

// motor (6)
export { calculateMotorCapacity } from './motor/motor-capacity';
export type { MotorCapacityInput } from './motor/motor-capacity';

export { calculateStartingCurrent } from './motor/starting-current';
export type { StartingCurrentInput } from './motor/starting-current';

export { calculateMotorEfficiency } from './motor/motor-efficiency';
export type { MotorEfficiencyInput } from './motor/motor-efficiency';

export { calculateInverterCapacity } from './motor/inverter-capacity';
export type { InverterCapacityInput } from './motor/inverter-capacity';

export { calculateMotorPFCorrection } from './motor/power-factor-correction';
export type { MotorPFCorrectionInput } from './motor/power-factor-correction';

export { calculateBrakingResistor } from './motor/braking-resistor';
export type { BrakingResistorInput } from './motor/braking-resistor';

// renewable (7) — Note: 2 already existed
export { calculateSolarGeneration } from './renewable/solar-generation';
export type { SolarGenerationInput } from './renewable/solar-generation';

export { calculateBatteryCapacity } from './renewable/battery-capacity';
export type { BatteryCapacityInput } from './renewable/battery-capacity';

export { calculateSolarCable } from './renewable/solar-cable';
export type { SolarCableInput } from './renewable/solar-cable';

export { calculatePCSCapacity } from './renewable/pcs-capacity';
export type { PCSCapacityInput } from './renewable/pcs-capacity';

export { calculateGridConnect } from './renewable/grid-connect';
export type { GridConnectInput } from './renewable/grid-connect';

// substation (4)
export { calculateSubstationCapacity } from './substation/substation-capacity';
export type { SubstationCapacityInput } from './substation/substation-capacity';

export { calculateCTSizing } from './substation/ct-sizing';
export type { CTSizingInput } from './substation/ct-sizing';

export { calculateVTSizing } from './substation/vt-sizing';
export type { VTSizingInput } from './substation/vt-sizing';

export { calculateSurgeArrester } from './substation/surge-arrester';
export type { SurgeArresterInput } from './substation/surge-arrester';

// lighting (4)
export { calculateIlluminance } from './lighting/illuminance';
export type { IlluminanceInput } from './lighting/illuminance';

export { calculateEnergySaving } from './lighting/energy-saving';
export type { EnergySavingInput } from './lighting/energy-saving';

export { calculateUPSCapacity } from './lighting/ups-capacity';
export type { UPSCapacityInput } from './lighting/ups-capacity';

export { calculateEmergencyGenerator } from './lighting/emergency-generator';
export type { EmergencyGeneratorInput } from './lighting/emergency-generator';

// global (5)
export { calculateTempCorrection } from './global/temp-correction';
export type { TempCorrectionInput } from './global/temp-correction';

export { compareGlobalAmpacity } from './global/ampacity-global-compare';
export type { AmpacityGlobalCompareInput } from './global/ampacity-global-compare';

export { convertAwgFull } from './global/awg-converter-full';
export type { AwgConverterInput as AwgConverterFullInput } from './global/awg-converter-full';

export { compareFrequency50vs60 } from './global/frequency-compare';
export type { FrequencyCompareInput } from './global/frequency-compare';

export { calculateNECLoad } from './global/nec-load-calc';
export type { NECLoadCalcInput } from './global/nec-load-calc';

// ai (1)
export { calculateTokenCost } from './ai/token-cost';
export type { TokenCostInput } from './ai/token-cost';

// ── Calculator Registry Map ─────────────────────────────────────────────────

import type { CalculatorRegistryEntry } from './types';

// power
import { calculateSinglePhasePower } from './power/single-phase-power';
import { calculateThreePhasePower } from './power/three-phase-power';
import { calculatePowerFactor } from './power/power-factor';
import { calculateReactivePower } from './power/reactive-power';
import { calculateDemandDiversity } from './power/demand-diversity';
import { calculateMaxDemand } from './power/max-demand';
import { calculatePowerLoss } from './power/power-loss';

// voltage-drop
import { calculateVoltageDrop } from './voltage-drop/voltage-drop';
import { calculateThreePhaseVD } from './voltage-drop/three-phase-vd';
import { calculateComplexVoltageDrop } from './voltage-drop/complex-voltage-drop';
import { calculateBusbarVD } from './voltage-drop/busbar-vd';
import { calculateCountryCompareVD } from './voltage-drop/country-compare-vd';

// cable
import { calculateCableSizing } from './cable/cable-sizing';
import { convertAwgMm2 } from './cable/awg-converter';
import { compareAmpacityByCountry } from './cable/ampacity-compare';
import { calculateCableImpedance } from './cable/cable-impedance';

// transformer
import { calculateTransformerCapacity } from './transformer/transformer-capacity';
import { calculateTransformerLoss } from './transformer/transformer-loss';
import { calculateTransformerEfficiency } from './transformer/transformer-efficiency';
import { calculateImpedanceVoltage } from './transformer/impedance-voltage';
import { calculateInrushCurrent } from './transformer/inrush-current';
import { calculateParallelOperation } from './transformer/parallel-operation';

// protection
import { calculateShortCircuit } from './protection/short-circuit';
import { calculateBreakerSizing } from './protection/breaker-sizing';
import { calculateEarthFault } from './protection/earth-fault';
import { calculateRCDSizing } from './protection/rcd-sizing';
import { calculateRelayBasic } from './protection/relay-basic';

// grounding
import { calculateGroundResistance } from './grounding/ground-resistance';
import { calculateGroundConductor } from './grounding/ground-conductor';
import { calculateEquipotentialBonding } from './grounding/equipotential-bonding';
import { calculateLightningProtection } from './grounding/lightning-protection';

// motor
import { calculateMotorCapacity } from './motor/motor-capacity';
import { calculateStartingCurrent } from './motor/starting-current';
import { calculateMotorEfficiency } from './motor/motor-efficiency';
import { calculateInverterCapacity } from './motor/inverter-capacity';
import { calculateMotorPFCorrection } from './motor/power-factor-correction';
import { calculateBrakingResistor } from './motor/braking-resistor';

// renewable
import { calculateSolarGeneration } from './renewable/solar-generation';
import { calculateBatteryCapacity } from './renewable/battery-capacity';
import { calculateSolarCable } from './renewable/solar-cable';
import { calculatePCSCapacity } from './renewable/pcs-capacity';
import { calculateGridConnect } from './renewable/grid-connect';

// substation
import { calculateSubstationCapacity } from './substation/substation-capacity';
import { calculateCTSizing } from './substation/ct-sizing';
import { calculateVTSizing } from './substation/vt-sizing';
import { calculateSurgeArrester } from './substation/surge-arrester';

// lighting
import { calculateIlluminance } from './lighting/illuminance';
import { calculateEnergySaving } from './lighting/energy-saving';
import { calculateUPSCapacity } from './lighting/ups-capacity';
import { calculateEmergencyGenerator } from './lighting/emergency-generator';

// global
import { calculateTempCorrection } from './global/temp-correction';
import { compareGlobalAmpacity } from './global/ampacity-global-compare';
import { convertAwgFull } from './global/awg-converter-full';
import { compareFrequency50vs60 } from './global/frequency-compare';
import { calculateNECLoad } from './global/nec-load-calc';

// ai
import { calculateTokenCost } from './ai/token-cost';

export const CALCULATOR_REGISTRY: ReadonlyMap<string, CalculatorRegistryEntry> = new Map<
  string,
  CalculatorRegistryEntry
>([
  // ═══════════════════════════════════════════════════════════════════════════
  // power (전력 기초) — 7 calculators
  // ═══════════════════════════════════════════════════════════════════════════
  [
    'single-phase-power',
    {
      id: 'single-phase-power',
      name: '단상 전력 계산',
      nameEn: 'Single-Phase Power',
      category: 'power',
      difficulty: 'basic',
      calculator: (input) =>
        calculateSinglePhasePower(input as Parameters<typeof calculateSinglePhasePower>[0]),
    },
  ],
  [
    'three-phase-power',
    {
      id: 'three-phase-power',
      name: '3상 전력 계산',
      nameEn: 'Three-Phase Power',
      category: 'power',
      difficulty: 'basic',
      calculator: (input) =>
        calculateThreePhasePower(input as Parameters<typeof calculateThreePhasePower>[0]),
    },
  ],
  [
    'power-factor',
    {
      id: 'power-factor',
      name: '역률 계산',
      nameEn: 'Power Factor',
      category: 'power',
      difficulty: 'basic',
      calculator: (input) =>
        calculatePowerFactor(input as Parameters<typeof calculatePowerFactor>[0]),
    },
  ],
  [
    'reactive-power',
    {
      id: 'reactive-power',
      name: '무효전력 보상 계산',
      nameEn: 'Reactive Power Compensation',
      category: 'power',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateReactivePower(input as Parameters<typeof calculateReactivePower>[0]),
    },
  ],
  [
    'demand-diversity',
    {
      id: 'demand-diversity',
      name: '수용률/부등률 계산',
      nameEn: 'Demand & Diversity Factor',
      category: 'power',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateDemandDiversity(input as Parameters<typeof calculateDemandDiversity>[0]),
    },
  ],
  [
    'max-demand',
    {
      id: 'max-demand',
      name: '최대수요전력 계산',
      nameEn: 'Maximum Demand',
      category: 'power',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateMaxDemand(input as Parameters<typeof calculateMaxDemand>[0]),
    },
  ],
  [
    'power-loss',
    {
      id: 'power-loss',
      name: '전력 손실 계산',
      nameEn: 'Power Loss',
      category: 'power',
      difficulty: 'advanced',
      calculator: (input) =>
        calculatePowerLoss(input as Parameters<typeof calculatePowerLoss>[0]),
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // voltage-drop (전압강하) — 5 calculators
  // ═══════════════════════════════════════════════════════════════════════════
  [
    'voltage-drop',
    {
      id: 'voltage-drop',
      name: '전압 강하 계산',
      nameEn: 'Voltage Drop',
      category: 'voltage-drop',
      difficulty: 'basic',
      calculator: (input) =>
        calculateVoltageDrop(input as Parameters<typeof calculateVoltageDrop>[0]),
    },
  ],
  [
    'three-phase-vd',
    {
      id: 'three-phase-vd',
      name: '3상 전압강하 (기동전류 포함)',
      nameEn: 'Three-Phase Voltage Drop',
      category: 'voltage-drop',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateThreePhaseVD(input as Parameters<typeof calculateThreePhaseVD>[0]),
    },
  ],
  [
    'complex-voltage-drop',
    {
      id: 'complex-voltage-drop',
      name: '임피던스 기반 전압강하',
      nameEn: 'Complex (Impedance) Voltage Drop',
      category: 'voltage-drop',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateComplexVoltageDrop(input as Parameters<typeof calculateComplexVoltageDrop>[0]),
    },
  ],
  [
    'busbar-vd',
    {
      id: 'busbar-vd',
      name: '부스바 누적 전압강하',
      nameEn: 'Busbar Cascaded Voltage Drop',
      category: 'voltage-drop',
      difficulty: 'advanced',
      calculator: (input) =>
        calculateBusbarVD(input as Parameters<typeof calculateBusbarVD>[0]),
    },
  ],
  [
    'country-compare-vd',
    {
      id: 'country-compare-vd',
      name: '국가별 전압강하 기준 비교',
      nameEn: 'Country Comparison Voltage Drop',
      category: 'voltage-drop',
      difficulty: 'advanced',
      calculator: (input) =>
        calculateCountryCompareVD(input as Parameters<typeof calculateCountryCompareVD>[0]),
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // cable (케이블) — 4 calculators
  // ═══════════════════════════════════════════════════════════════════════════
  [
    'cable-sizing',
    {
      id: 'cable-sizing',
      name: '케이블 사이징',
      nameEn: 'Cable Sizing',
      category: 'cable',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateCableSizing(input as Parameters<typeof calculateCableSizing>[0]),
    },
  ],
  [
    'awg-converter',
    {
      id: 'awg-converter',
      name: 'AWG ↔ mm² 변환',
      nameEn: 'AWG to mm² Converter',
      category: 'cable',
      difficulty: 'basic',
      calculator: (input) =>
        convertAwgMm2(input as Parameters<typeof convertAwgMm2>[0]),
    },
  ],
  [
    'ampacity-compare',
    {
      id: 'ampacity-compare',
      name: '허용전류 국가 비교',
      nameEn: 'Ampacity Country Comparison',
      category: 'cable',
      difficulty: 'basic',
      calculator: (input) =>
        compareAmpacityByCountry(input as Parameters<typeof compareAmpacityByCountry>[0]),
    },
  ],
  [
    'cable-impedance',
    {
      id: 'cable-impedance',
      name: '케이블 임피던스 계산',
      nameEn: 'Cable Impedance',
      category: 'cable',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateCableImpedance(input as Parameters<typeof calculateCableImpedance>[0]),
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // transformer (변압기) — 6 calculators
  // ═══════════════════════════════════════════════════════════════════════════
  [
    'transformer-capacity',
    {
      id: 'transformer-capacity',
      name: '변압기 용량 선정',
      nameEn: 'Transformer Capacity',
      category: 'transformer',
      difficulty: 'basic',
      calculator: (input) =>
        calculateTransformerCapacity(input as Parameters<typeof calculateTransformerCapacity>[0]),
    },
  ],
  [
    'transformer-loss',
    {
      id: 'transformer-loss',
      name: '변압기 손실 계산',
      nameEn: 'Transformer Loss',
      category: 'transformer',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateTransformerLoss(input as Parameters<typeof calculateTransformerLoss>[0]),
    },
  ],
  [
    'transformer-efficiency',
    {
      id: 'transformer-efficiency',
      name: '변압기 효율 계산',
      nameEn: 'Transformer Efficiency',
      category: 'transformer',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateTransformerEfficiency(input as Parameters<typeof calculateTransformerEfficiency>[0]),
    },
  ],
  [
    'impedance-voltage',
    {
      id: 'impedance-voltage',
      name: '임피던스 전압 계산',
      nameEn: 'Impedance Voltage',
      category: 'transformer',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateImpedanceVoltage(input as Parameters<typeof calculateImpedanceVoltage>[0]),
    },
  ],
  [
    'inrush-current',
    {
      id: 'inrush-current',
      name: '변압기 돌입전류 계산',
      nameEn: 'Transformer Inrush Current',
      category: 'transformer',
      difficulty: 'advanced',
      calculator: (input) =>
        calculateInrushCurrent(input as Parameters<typeof calculateInrushCurrent>[0]),
    },
  ],
  [
    'parallel-operation',
    {
      id: 'parallel-operation',
      name: '변압기 병렬운전 계산',
      nameEn: 'Transformer Parallel Operation',
      category: 'transformer',
      difficulty: 'advanced',
      calculator: (input) =>
        calculateParallelOperation(input as Parameters<typeof calculateParallelOperation>[0]),
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // protection (보호 협조) — 5 calculators
  // ═══════════════════════════════════════════════════════════════════════════
  [
    'short-circuit',
    {
      id: 'short-circuit',
      name: '단락 전류 계산',
      nameEn: 'Short-Circuit Current',
      category: 'protection',
      difficulty: 'advanced',
      calculator: (input) =>
        calculateShortCircuit(input as Parameters<typeof calculateShortCircuit>[0]),
    },
  ],
  [
    'breaker-sizing',
    {
      id: 'breaker-sizing',
      name: '차단기 선정',
      nameEn: 'Breaker Sizing',
      category: 'protection',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateBreakerSizing(input as Parameters<typeof calculateBreakerSizing>[0]),
    },
  ],
  [
    'earth-fault',
    {
      id: 'earth-fault',
      name: '지락 전류 계산',
      nameEn: 'Earth Fault Current',
      category: 'protection',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateEarthFault(input as Parameters<typeof calculateEarthFault>[0]),
    },
  ],
  [
    'rcd-sizing',
    {
      id: 'rcd-sizing',
      name: '누전차단기(RCD) 선정',
      nameEn: 'RCD Sizing',
      category: 'protection',
      difficulty: 'basic',
      calculator: (input) =>
        calculateRCDSizing(input as Parameters<typeof calculateRCDSizing>[0]),
    },
  ],
  [
    'relay-basic',
    {
      id: 'relay-basic',
      name: '과전류 계전기 정정',
      nameEn: 'Basic Overcurrent Relay',
      category: 'protection',
      difficulty: 'advanced',
      calculator: (input) =>
        calculateRelayBasic(input as Parameters<typeof calculateRelayBasic>[0]),
    },
  ],
  [
    'arc-flash',
    {
      id: 'arc-flash',
      name: '아크플래시 위험도 (IEEE 1584)',
      nameEn: 'Arc Flash Hazard Analysis',
      category: 'protection',
      difficulty: 'advanced',
      calculator: (input) => {
        const { calculateArcFlash: calc } = require('./protection/arc-flash');
        return calc(input);
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // grounding (접지) — 4 calculators
  // ═══════════════════════════════════════════════════════════════════════════
  [
    'ground-resistance',
    {
      id: 'ground-resistance',
      name: '접지 저항 계산',
      nameEn: 'Ground Resistance',
      category: 'grounding',
      difficulty: 'basic',
      calculator: (input) =>
        calculateGroundResistance(input as Parameters<typeof calculateGroundResistance>[0]),
    },
  ],
  [
    'ground-conductor',
    {
      id: 'ground-conductor',
      name: '접지 도체 사이징',
      nameEn: 'Grounding Conductor Sizing',
      category: 'grounding',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateGroundConductor(input as Parameters<typeof calculateGroundConductor>[0]),
    },
  ],
  [
    'equipotential-bonding',
    {
      id: 'equipotential-bonding',
      name: '등전위 본딩 도체 선정',
      nameEn: 'Equipotential Bonding Conductor',
      category: 'grounding',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateEquipotentialBonding(input as Parameters<typeof calculateEquipotentialBonding>[0]),
    },
  ],
  [
    'lightning-protection',
    {
      id: 'lightning-protection',
      name: '피뢰 시스템 계산',
      nameEn: 'Lightning Protection',
      category: 'grounding',
      difficulty: 'advanced',
      calculator: (input) =>
        calculateLightningProtection(input as Parameters<typeof calculateLightningProtection>[0]),
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // motor (전동기) — 6 calculators
  // ═══════════════════════════════════════════════════════════════════════════
  [
    'motor-capacity',
    {
      id: 'motor-capacity',
      name: '전동기 용량 계산',
      nameEn: 'Motor Capacity',
      category: 'motor',
      difficulty: 'basic',
      calculator: (input) =>
        calculateMotorCapacity(input as Parameters<typeof calculateMotorCapacity>[0]),
    },
  ],
  [
    'starting-current',
    {
      id: 'starting-current',
      name: '전동기 기동전류 계산',
      nameEn: 'Motor Starting Current',
      category: 'motor',
      difficulty: 'basic',
      calculator: (input) =>
        calculateStartingCurrent(input as Parameters<typeof calculateStartingCurrent>[0]),
    },
  ],
  [
    'motor-efficiency',
    {
      id: 'motor-efficiency',
      name: '전동기 효율/IE 등급 비교',
      nameEn: 'Motor Efficiency & IE Class',
      category: 'motor',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateMotorEfficiency(input as Parameters<typeof calculateMotorEfficiency>[0]),
    },
  ],
  [
    'inverter-capacity',
    {
      id: 'inverter-capacity',
      name: '인버터 용량 선정',
      nameEn: 'Inverter (VFD) Capacity',
      category: 'motor',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateInverterCapacity(input as Parameters<typeof calculateInverterCapacity>[0]),
    },
  ],
  [
    'motor-pf-correction',
    {
      id: 'motor-pf-correction',
      name: '전동기 역률 보상',
      nameEn: 'Motor Power Factor Correction',
      category: 'motor',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateMotorPFCorrection(input as Parameters<typeof calculateMotorPFCorrection>[0]),
    },
  ],
  [
    'braking-resistor',
    {
      id: 'braking-resistor',
      name: '제동 저항기 계산',
      nameEn: 'Braking Resistor',
      category: 'motor',
      difficulty: 'advanced',
      calculator: (input) =>
        calculateBrakingResistor(input as Parameters<typeof calculateBrakingResistor>[0]),
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // renewable (신재생/ESS) — 5 calculators
  // ═══════════════════════════════════════════════════════════════════════════
  [
    'solar-generation',
    {
      id: 'solar-generation',
      name: '태양광 발전량 계산',
      nameEn: 'Solar PV Generation',
      category: 'renewable',
      difficulty: 'basic',
      calculator: (input) =>
        calculateSolarGeneration(input as Parameters<typeof calculateSolarGeneration>[0]),
    },
  ],
  [
    'battery-capacity',
    {
      id: 'battery-capacity',
      name: '배터리 용량 계산',
      nameEn: 'Battery Capacity (ESS)',
      category: 'renewable',
      difficulty: 'basic',
      calculator: (input) =>
        calculateBatteryCapacity(input as Parameters<typeof calculateBatteryCapacity>[0]),
    },
  ],
  [
    'solar-cable',
    {
      id: 'solar-cable',
      name: '태양광 DC 케이블 사이징',
      nameEn: 'Solar PV DC Cable Sizing',
      category: 'renewable',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateSolarCable(input as Parameters<typeof calculateSolarCable>[0]),
    },
  ],
  [
    'pcs-capacity',
    {
      id: 'pcs-capacity',
      name: 'PCS 용량 계산',
      nameEn: 'PCS Capacity (ESS)',
      category: 'renewable',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculatePCSCapacity(input as Parameters<typeof calculatePCSCapacity>[0]),
    },
  ],
  [
    'grid-connect',
    {
      id: 'grid-connect',
      name: '계통 연계 용량 검토',
      nameEn: 'Grid Connection Capacity',
      category: 'renewable',
      difficulty: 'advanced',
      calculator: (input) =>
        calculateGridConnect(input as Parameters<typeof calculateGridConnect>[0]),
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // substation (수변전) — 4 calculators
  // ═══════════════════════════════════════════════════════════════════════════
  [
    'substation-capacity',
    {
      id: 'substation-capacity',
      name: '수변전 설비 용량 계산',
      nameEn: 'Substation Capacity',
      category: 'substation',
      difficulty: 'basic',
      calculator: (input) =>
        calculateSubstationCapacity(input as Parameters<typeof calculateSubstationCapacity>[0]),
    },
  ],
  [
    'ct-sizing',
    {
      id: 'ct-sizing',
      name: 'CT (변류기) 선정',
      nameEn: 'CT Sizing',
      category: 'substation',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateCTSizing(input as Parameters<typeof calculateCTSizing>[0]),
    },
  ],
  [
    'vt-sizing',
    {
      id: 'vt-sizing',
      name: 'VT (계기용 변압기) 선정',
      nameEn: 'VT Sizing',
      category: 'substation',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateVTSizing(input as Parameters<typeof calculateVTSizing>[0]),
    },
  ],
  [
    'surge-arrester',
    {
      id: 'surge-arrester',
      name: '피뢰기 선정',
      nameEn: 'Surge Arrester Sizing',
      category: 'substation',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateSurgeArrester(input as Parameters<typeof calculateSurgeArrester>[0]),
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // lighting (조명/설비) — 4 calculators
  // ═══════════════════════════════════════════════════════════════════════════
  [
    'illuminance',
    {
      id: 'illuminance',
      name: '조도 계산 (광속법)',
      nameEn: 'Illuminance (Lumen Method)',
      category: 'lighting',
      difficulty: 'basic',
      calculator: (input) =>
        calculateIlluminance(input as Parameters<typeof calculateIlluminance>[0]),
    },
  ],
  [
    'energy-saving',
    {
      id: 'energy-saving',
      name: '에너지 절감 계산',
      nameEn: 'Energy Saving',
      category: 'lighting',
      difficulty: 'basic',
      calculator: (input) =>
        calculateEnergySaving(input as Parameters<typeof calculateEnergySaving>[0]),
    },
  ],
  [
    'ups-capacity',
    {
      id: 'ups-capacity',
      name: 'UPS 용량 계산',
      nameEn: 'UPS Capacity',
      category: 'lighting',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateUPSCapacity(input as Parameters<typeof calculateUPSCapacity>[0]),
    },
  ],
  [
    'emergency-generator',
    {
      id: 'emergency-generator',
      name: '비상 발전기 용량 계산',
      nameEn: 'Emergency Generator Sizing',
      category: 'lighting',
      difficulty: 'intermediate',
      calculator: (input) =>
        calculateEmergencyGenerator(input as Parameters<typeof calculateEmergencyGenerator>[0]),
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // global (글로벌) — 5 calculators
  // ═══════════════════════════════════════════════════════════════════════════
  [
    'temp-correction',
    {
      id: 'temp-correction',
      name: '온도 보정 계수 계산',
      nameEn: 'Temperature Correction Factor',
      category: 'global',
      difficulty: 'basic',
      calculator: (input) =>
        calculateTempCorrection(input as Parameters<typeof calculateTempCorrection>[0]),
    },
  ],
  [
    'ampacity-global-compare',
    {
      id: 'ampacity-global-compare',
      name: '글로벌 허용전류 비교',
      nameEn: 'Global Ampacity Comparison',
      category: 'global',
      difficulty: 'intermediate',
      calculator: (input) =>
        compareGlobalAmpacity(input as Parameters<typeof compareGlobalAmpacity>[0]),
    },
  ],
  [
    'awg-converter-full',
    {
      id: 'awg-converter-full',
      name: 'AWG/mm²/kcmil 통합 변환',
      nameEn: 'Full AWG/mm²/kcmil Converter',
      category: 'global',
      difficulty: 'intermediate',
      calculator: (input) =>
        convertAwgFull(input as Parameters<typeof convertAwgFull>[0]),
    },
  ],
  [
    'frequency-compare',
    {
      id: 'frequency-compare',
      name: '50Hz vs 60Hz 주파수 비교',
      nameEn: 'Frequency Comparison (50/60Hz)',
      category: 'global',
      difficulty: 'intermediate',
      calculator: (input) =>
        compareFrequency50vs60(input as Parameters<typeof compareFrequency50vs60>[0]),
    },
  ],
  [
    'nec-load-calc',
    {
      id: 'nec-load-calc',
      name: 'NEC 부하 계산 (Article 220)',
      nameEn: 'NEC Load Calculation',
      category: 'global',
      difficulty: 'advanced',
      calculator: (input) =>
        calculateNECLoad(input as Parameters<typeof calculateNECLoad>[0]),
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // ai (AI 특화) — 1 calculator
  // ═══════════════════════════════════════════════════════════════════════════
  [
    'token-cost',
    {
      id: 'token-cost',
      name: 'AI 토큰 비용 계산',
      nameEn: 'AI Token Cost',
      category: 'ai',
      difficulty: 'basic',
      calculator: (input) =>
        calculateTokenCost(input as Parameters<typeof calculateTokenCost>[0]),
    },
  ],
]);

/** Get all calculators in a given category */
export function getCalculatorsByCategory(category: string): CalculatorRegistryEntry[] {
  return Array.from(CALCULATOR_REGISTRY.values()).filter((c) => c.category === category);
}

/** Get all available category names */
export function getCategories(): string[] {
  const cats = new Set<string>();
  for (const entry of CALCULATOR_REGISTRY.values()) {
    cats.add(entry.category);
  }
  return Array.from(cats);
}

/** Lookup a calculator by ID */
export function getCalculator(id: string): CalculatorRegistryEntry | undefined {
  return CALCULATOR_REGISTRY.get(id);
}
