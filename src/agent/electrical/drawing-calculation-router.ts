import { getCalculator } from '@/engine/calculators';
import type { CalculatorRegistryEntry, DetailedCalcResult } from '@/engine/calculators';
import { DEFAULT_REACTANCE_OHM_PER_KM } from '@/engine/constants/calc-thresholds';
import { activeDefaults } from '@/engine/calculators/country-defaults';
import type { VoltageDropInput } from '@/engine/calculators/voltage-drop/voltage-drop';
import type { BreakerSizingInput } from '@/engine/calculators/protection/breaker-sizing';
import type { TransformerCapacityInput } from '@/engine/calculators/transformer/transformer-capacity';
import type { CTSizingInput } from '@/engine/calculators/substation/ct-sizing';
import type { NormalizedElectricalGraph, NormalizedSpec } from './domain-normalizer';

type CalculatorId = 'voltage-drop' | 'breaker-sizing' | 'transformer-capacity' | 'ct-sizing';
type CalculatorStatus = 'SKIPPED' | 'CALCULATED' | 'ERROR';

export interface CalculationInputIssue {
  readonly adapterField: string;
  readonly normalizedFields: readonly string[];
}

export interface CalculationInputEvidence {
  readonly adapterField: string;
  readonly normalizedField: string;
  readonly value: number | string;
  readonly sourceUnit: string;
  readonly targetUnit: string;
  readonly evidenceId: string;
  readonly originalEvidenceIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly bounds: Readonly<{ page: number; x: number; y: number; w: number; h: number }>;
  readonly confidence: number;
  readonly transform: string;
}

export interface CalculationDefaultDisclosure {
  readonly name: string;
  readonly value?: number | string;
  readonly meaning: string;
}

export interface DrawingCalculationReceipt {
  readonly id: string;
  readonly calculatorId: CalculatorId;
  readonly scopeKey: string;
  readonly status: CalculatorStatus;
  readonly judgment: 'HOLD';
  readonly missingInputs: readonly CalculationInputIssue[];
  readonly ambiguousInputs: readonly CalculationInputIssue[];
  readonly inputEvidence: readonly CalculationInputEvidence[];
  readonly optionalDefaultsUsed: readonly CalculationDefaultDisclosure[];
  readonly internalMechanics: readonly CalculationDefaultDisclosure[];
  readonly scopeIssues: readonly string[];
  readonly calculatorResult?: DetailedCalcResult;
  readonly error?: { readonly code: 'CALCULATOR_UNAVAILABLE' | 'CALCULATOR_EXECUTION_FAILED'; readonly message: string };
}

export interface DrawingCalculationRouterOptions {
  readonly getCalculator?: (id: string) => CalculatorRegistryEntry | undefined;
}

type Scope = { readonly ownerId: string; readonly page: number; readonly key: string; readonly specs: readonly NormalizedSpec[]; readonly issues: readonly string[]; readonly isResolvedOwnerContext: boolean };
type Binding = { readonly adapterField: string; readonly fields: readonly NormalizedSpec['field'][]; readonly unit: string; readonly targetUnit: string; readonly valid: (value: number | string) => boolean };
type Resolved = { readonly evidence: CalculationInputEvidence; readonly value: number | string };

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function issue(binding: Binding): CalculationInputIssue {
  return { adapterField: binding.adapterField, normalizedFields: [...binding.fields].sort(compareText) };
}

function hasLineageOverlap(left: NormalizedSpec, right: NormalizedSpec): boolean {
  return left.originalEvidenceIds.some((id) => right.originalEvidenceIds.includes(id))
    || left.sourceIds.some((id) => right.sourceIds.includes(id));
}

function validSpec(spec: NormalizedSpec, drawingHash: string, binding: Binding): boolean {
  return spec.drawingHash === drawingHash
    && spec.unit === binding.unit
    && spec.evidenceId.length > 0
    && spec.originalEvidenceIds.length > 0
    && spec.sourceIds.length > 0
    && Number.isInteger(spec.bounds.page)
    && spec.bounds.page > 0
    && [spec.bounds.x, spec.bounds.y, spec.bounds.w, spec.bounds.h, spec.confidence].every(Number.isFinite)
    && binding.valid(spec.value);
}

function evidenceFor(binding: Binding, spec: NormalizedSpec): CalculationInputEvidence {
  return {
    adapterField: binding.adapterField,
    normalizedField: spec.field,
    value: spec.value,
    sourceUnit: spec.unit,
    targetUnit: binding.targetUnit,
    evidenceId: spec.evidenceId,
    originalEvidenceIds: [...spec.originalEvidenceIds].sort(compareText),
    sourceIds: [...spec.sourceIds].sort(compareText),
    bounds: { ...spec.bounds },
    confidence: spec.confidence,
    transform: 'identity',
  };
}

function resolve(scope: Scope, drawingHash: string, binding: Binding): { readonly resolved?: Resolved; readonly missing?: CalculationInputIssue; readonly ambiguous?: CalculationInputIssue } {
  for (const field of binding.fields) {
    const candidates = scope.specs
      .filter((spec) => spec.field === field)
      .sort((left, right) => compareText(left.evidenceId, right.evidenceId));
    if (candidates.length === 0) continue;
    if (candidates.some((spec) => !validSpec(spec, drawingHash, binding))) return { missing: issue(binding) };
    const canonical = candidates[0];
    if (candidates.some((spec) => String(spec.value) !== String(canonical.value) || !hasLineageOverlap(spec, canonical))) return { ambiguous: issue(binding) };
    const merged: NormalizedSpec = {
      ...canonical,
      originalEvidenceIds: [...new Set(candidates.flatMap((spec) => spec.originalEvidenceIds))].sort(compareText),
      sourceIds: [...new Set(candidates.flatMap((spec) => spec.sourceIds))].sort(compareText),
    };
    return { resolved: { evidence: evidenceFor(binding, merged), value: merged.value } };
  }
  return { missing: issue(binding) };
}

function resolveOptional(scope: Scope, drawingHash: string, binding: Binding): Resolved | undefined {
  if (!scope.isResolvedOwnerContext) return undefined;
  const result = resolve(scope, drawingHash, binding);
  return result.resolved;
}

function numberValue(input: Resolved): number {
  return input.value as number;
}

function textValue(input: Resolved): string {
  return input.value as string;
}

function makeScopeIssues(graph: NormalizedElectricalGraph): readonly string[] {
  return [
    ...graph.graph.conflicts.map((conflict) => `GRAPH_CONFLICT:${conflict}`),
    ...graph.warnings.map((warning) => `${warning.code}:${warning.evidenceId ?? ''}:${warning.field ?? ''}`),
  ].sort(compareText);
}

function scopesFor(graph: NormalizedElectricalGraph): Scope[] {
  const groups = new Map<string, NormalizedSpec[]>();
  for (const spec of graph.specs) {
    if (!Number.isInteger(spec.bounds.page) || spec.bounds.page <= 0) continue;
    const ownerId = spec.ownerId ?? 'unresolved';
    const key = `${ownerId}@p${spec.bounds.page}`;
    groups.set(key, [...(groups.get(key) ?? []), spec]);
  }
  const issues = makeScopeIssues(graph);
  return [...groups.entries()]
    .map(([key, specs]) => {
      const ownerId = specs[0].ownerId ?? 'unresolved';
      const page = specs[0].bounds.page;
      const owner = graph.graph.symbols.find((symbol) => symbol.id === ownerId);
      const isResolvedOwnerContext = owner !== undefined && owner.bounds.page === page;
      return {
        ownerId,
        page,
        key,
        specs,
        issues: isResolvedOwnerContext ? issues : [...issues, `OWNER_CONTEXT_UNRESOLVED:${ownerId}@p${page}`].sort(compareText),
        isResolvedOwnerContext,
      };
    })
    .sort((left, right) => compareText(left.key, right.key));
}

function positive(value: number | string): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function ranged(min: number, max: number): (value: number | string) => boolean {
  return (value) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function oneOfNumbers(values: readonly number[]): (value: number | string) => boolean {
  return (value) => typeof value === 'number' && values.includes(value);
}

function exactly(values: readonly string[]): (value: number | string) => boolean {
  return (value) => typeof value === 'string' && values.includes(value);
}

const voltage = (): Binding => ({ adapterField: 'voltage', fields: ['voltage_V'], unit: 'V', targetUnit: 'V', valid: positive });
const current = (): Binding => ({ adapterField: 'current', fields: ['current_A', 'loadCurrent_A'], unit: 'A', targetUnit: 'A', valid: positive });
const loadCurrent = (): Binding => ({ adapterField: 'loadCurrent', fields: ['loadCurrent_A'], unit: 'A', targetUnit: 'A', valid: positive });
const faultCurrent = (): Binding => ({ adapterField: 'shortCircuitCurrent', fields: ['faultCurrent_kA'], unit: 'kA', targetUnit: 'kA', valid: positive });
const cableAmpacity = (): Binding => ({ adapterField: 'cableAmpacity', fields: ['cableAmpacity_A'], unit: 'A', targetUnit: 'A', valid: positive });
const length = (): Binding => ({ adapterField: 'length', fields: ['length_m'], unit: 'm', targetUnit: 'm', valid: positive });
const cableSize = (): Binding => ({ adapterField: 'cableSize', fields: ['conductorSize_mm2'], unit: 'mm2', targetUnit: 'mm2', valid: positive });
const conductor = (): Binding => ({ adapterField: 'conductor', fields: ['conductorMaterial'], unit: 'material', targetUnit: 'material', valid: exactly(['Cu', 'Al']) });
const powerFactor = (): Binding => ({ adapterField: 'powerFactor', fields: ['powerFactor'], unit: 'factor', targetUnit: 'factor', valid: ranged(0.01, 1) });
const phase = (): Binding => ({ adapterField: 'phase', fields: ['phase'], unit: 'phase', targetUnit: 'phase', valid: oneOfNumbers([1, 3]) });
const totalLoad = (): Binding => ({ adapterField: 'totalLoad', fields: ['totalLoad_kW'], unit: 'kW', targetUnit: 'kW', valid: positive });
const efficiency = (): Binding => ({ adapterField: 'efficiency', fields: ['efficiency'], unit: 'factor', targetUnit: 'factor', valid: ranged(0.01, 1) });
const demandFactor = (): Binding => ({ adapterField: 'demandFactor', fields: ['demandFactor'], unit: 'factor', targetUnit: 'factor', valid: ranged(0.01, 1) });
const growthMargin = (): Binding => ({ adapterField: 'growthMargin', fields: ['safetyMargin'], unit: 'factor', targetUnit: 'factor', valid: ranged(0, 1) });
const maxLoadCurrent = (): Binding => ({ adapterField: 'maxLoadCurrent', fields: ['maxLoadCurrent_A'], unit: 'A', targetUnit: 'A', valid: positive });
const relayBurden = (): Binding => ({ adapterField: 'relayBurden', fields: ['burden_VA'], unit: 'VA', targetUnit: 'VA', valid: positive });
const leadLength = (): Binding => ({ adapterField: 'leadLength', fields: ['leadLength_m'], unit: 'm', targetUnit: 'm', valid: positive });
const leadSize = (): Binding => ({ adapterField: 'leadSize', fields: ['leadSize_mm2'], unit: 'mm2', targetUnit: 'mm2', valid: positive });
const accuracyClass = (): Binding => ({ adapterField: 'accuracyClass', fields: ['ctAccuracyClass'], unit: 'text', targetUnit: 'class', valid: exactly(['0.2', '0.5', '1.0', '5P', '10P']) });

function run<T>(graph: NormalizedElectricalGraph, scope: Scope, calculatorId: CalculatorId, bindings: readonly Binding[], build: (values: Map<string, Resolved>) => T, lookup: (id: string) => CalculatorRegistryEntry | undefined, optionalDefaultsUsed: readonly CalculationDefaultDisclosure[] = [], internalMechanics: readonly CalculationDefaultDisclosure[] = []): DrawingCalculationReceipt {
  const values = new Map<string, Resolved>();
  const missingInputs: CalculationInputIssue[] = [];
  const ambiguousInputs: CalculationInputIssue[] = [];
  if (!scope.isResolvedOwnerContext) {
    missingInputs.push(...bindings.map(issue));
  } else {
    for (const binding of bindings) {
      const resolved = resolve(scope, graph.drawingHash, binding);
      if (resolved.resolved) values.set(binding.adapterField, resolved.resolved);
      if (resolved.missing) missingInputs.push(resolved.missing);
      if (resolved.ambiguous) ambiguousInputs.push(resolved.ambiguous);
    }
  }
  const inputEvidence = [...values.values()].map((item) => item.evidence).sort((left, right) => compareText(left.adapterField, right.adapterField));
  const base = {
    id: `drawing-calc:${calculatorId}:${scope.key}`,
    calculatorId,
    scopeKey: scope.key,
    judgment: 'HOLD' as const,
    missingInputs: missingInputs.sort((left, right) => compareText(left.adapterField, right.adapterField)),
    ambiguousInputs: ambiguousInputs.sort((left, right) => compareText(left.adapterField, right.adapterField)),
    inputEvidence,
    optionalDefaultsUsed,
    internalMechanics,
    scopeIssues: scope.issues,
  };
  if (missingInputs.length > 0 || ambiguousInputs.length > 0) return { ...base, status: 'SKIPPED', calculatorResult: undefined };
  const calculator = lookup(calculatorId);
  if (!calculator) return { ...base, status: 'ERROR', error: { code: 'CALCULATOR_UNAVAILABLE', message: 'Calculator is unavailable.' } };
  try {
    const result = calculator.calculator(build(values));
    return { ...base, status: 'CALCULATED', calculatorResult: result };
  } catch {
    return { ...base, status: 'ERROR', error: { code: 'CALCULATOR_EXECUTION_FAILED', message: 'Calculator execution failed.' } };
  }
}

function routeVoltageDrop(graph: NormalizedElectricalGraph, scope: Scope, lookup: (id: string) => CalculatorRegistryEntry | undefined): DrawingCalculationReceipt {
  const defaults = activeDefaults();
  return run(graph, scope, 'voltage-drop', [voltage(), current(), length(), cableSize(), conductor(), powerFactor(), phase()], (values) => {
    const input: VoltageDropInput = {
      voltage: numberValue(values.get('voltage')!), current: numberValue(values.get('current')!), length: numberValue(values.get('length')!),
      cableSize: numberValue(values.get('cableSize')!), conductor: textValue(values.get('conductor')!) as VoltageDropInput['conductor'],
      powerFactor: numberValue(values.get('powerFactor')!), phase: numberValue(values.get('phase')!) as VoltageDropInput['phase'],
    };
    return input;
  }, lookup, [
    { name: 'reactance', value: DEFAULT_REACTANCE_OHM_PER_KM, meaning: 'calculator-internal default; not drawing evidence' },
    { name: 'dropLimitPercent', value: defaults.vdBranch, meaning: 'calculator-internal default; not drawing evidence' },
  ]);
}

function routeBreakerSizing(graph: NormalizedElectricalGraph, scope: Scope, lookup: (id: string) => CalculatorRegistryEntry | undefined): DrawingCalculationReceipt {
  const optional = resolveOptional(scope, graph.drawingHash, cableAmpacity());
  const receipt = run(graph, scope, 'breaker-sizing', [loadCurrent(), faultCurrent(), voltage()], (values) => {
    const input: BreakerSizingInput = {
      loadCurrent: numberValue(values.get('loadCurrent')!), shortCircuitCurrent: numberValue(values.get('shortCircuitCurrent')!), voltage: numberValue(values.get('voltage')!),
      ...(optional ? { cableAmpacity: numberValue(optional) } : {}),
    };
    return input;
  }, lookup);
  return optional ? { ...receipt, inputEvidence: [...receipt.inputEvidence, optional.evidence].sort((left, right) => compareText(left.adapterField, right.adapterField)) } : receipt;
}

function routeTransformerCapacity(graph: NormalizedElectricalGraph, scope: Scope, lookup: (id: string) => CalculatorRegistryEntry | undefined): DrawingCalculationReceipt {
  const optional = resolveOptional(scope, graph.drawingHash, growthMargin());
  const defaults = optional ? [] : [{ name: 'growthMargin', value: 0, meaning: 'calculator-internal default; not drawing evidence' }];
  const receipt = run(graph, scope, 'transformer-capacity', [totalLoad(), powerFactor(), efficiency(), demandFactor()], (values) => {
    const input: TransformerCapacityInput = {
      totalLoad: numberValue(values.get('totalLoad')!), powerFactor: numberValue(values.get('powerFactor')!), efficiency: numberValue(values.get('efficiency')!), demandFactor: numberValue(values.get('demandFactor')!),
      ...(optional ? { growthMargin: numberValue(optional) } : {}),
    };
    return input;
  }, lookup, defaults);
  return optional ? { ...receipt, inputEvidence: [...receipt.inputEvidence, optional.evidence].sort((left, right) => compareText(left.adapterField, right.adapterField)) } : receipt;
}

function routeCTSizing(graph: NormalizedElectricalGraph, scope: Scope, lookup: (id: string) => CalculatorRegistryEntry | undefined): DrawingCalculationReceipt {
  return run(graph, scope, 'ct-sizing', [maxLoadCurrent(), relayBurden(), leadLength(), leadSize(), accuracyClass()], (values) => {
    const input: CTSizingInput = {
      maxLoadCurrent: numberValue(values.get('maxLoadCurrent')!), relayBurden: numberValue(values.get('relayBurden')!), leadLength: numberValue(values.get('leadLength')!),
      leadSize: numberValue(values.get('leadSize')!), accuracyClass: textValue(values.get('accuracyClass')!) as CTSizingInput['accuracyClass'],
    };
    return input;
  }, lookup, [], [
    { name: 'secondaryCurrent', value: 5, meaning: 'calculator mechanical constant; not drawing evidence' },
    { name: 'contactResistance', value: 0.1, meaning: 'calculator mechanical constant; not drawing evidence' },
  ]);
}

export function routeDrawingCalculations(graph: NormalizedElectricalGraph, options: DrawingCalculationRouterOptions = {}): readonly DrawingCalculationReceipt[] {
  const lookup = options.getCalculator ?? getCalculator;
  const receipts = scopesFor(graph).flatMap((scope) => [
    routeVoltageDrop(graph, scope, lookup),
    routeBreakerSizing(graph, scope, lookup),
    routeTransformerCapacity(graph, scope, lookup),
    routeCTSizing(graph, scope, lookup),
  ]);
  return receipts.sort((left, right) => compareText(left.calculatorId, right.calculatorId) || compareText(left.scopeKey, right.scopeKey));
}
