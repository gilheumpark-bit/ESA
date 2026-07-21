# SLD Electrical Logic and Synthesis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the spatial evidence graph into normalized electrical data, deterministic checks, independent logic conflicts, targeted re-review requests, and an evidence-bounded synthesis artifact.

**Architecture:** Domain normalization and electrical invariants are deterministic modules. The independent logic envelope is compared to the assembled graph; disagreements become typed conflicts. Existing calculators execute only when every required input has source evidence. The synthesis AI may explain accepted facts and alternatives but cannot create new graph facts.

**Tech Stack:** TypeScript 5.9, existing calculator registry, KEC/custom-rule evaluators, Node crypto, Jest 30

## Global Constraints

- No missing electrical value may be replaced with an assumed default for a PASS/FAIL decision.
- Every calculator input must include an evidence ID and source coordinate.
- A conflict classified as critical remains `HOLD` until targeted re-review resolves it.
- Protection coordination, arc flash, and short circuit remain `HOLD` when required settings or impedances are absent.
- The synthesis model receives sealed envelopes and deterministic receipts; it does not receive API keys or mutable application state.
- Existing dirty working-tree changes are user-owned. Stage only task-specific hunks.
- Requires the spatial graph and council artifacts from Plan 2.

## File Structure

- Create `src/agent/electrical/domain-normalizer.ts`: normalized electrical fields and provenance.
- Create `src/agent/electrical/electrical-invariants.ts`: topology and protection semantic checks.
- Create `src/agent/electrical/drawing-calculation-router.ts`: evidence-gated calculator execution.
- Create `src/agent/electrical/logic-conflicts.ts`: compare independent logic statements to deterministic graph facts.
- Create `src/agent/electrical/synthesis.ts`: evidence-bounded aggregate and targeted re-review decisions.
- Modify `src/agent/teams/sld-team.ts`: attach normalized graph, receipts, issues, and conflicts.
- Modify `src/agent/orchestrator.ts`: replace image-SLD consensus semantics with independent review synthesis.

---

### Task 1: Normalize electrical ratings with provenance

**Files:**
- Create: `src/agent/electrical/domain-normalizer.ts`
- Test: `src/agent/electrical/__tests__/domain-normalizer.test.ts`

**Interfaces:**
- Consumes: `SpatialEvidenceGraph`.
- Produces: `NormalizedElectricalGraph`, `normalizeElectricalGraph(graph)`.

- [ ] **Step 1: Write failing mixed-language rating tests**

```ts
import { normalizeElectricalGraph } from '../domain-normalizer';
import type { SpatialEvidenceGraph } from '../../vision/spatial-graph';

const makeGraphWithTexts = (values: string[]): SpatialEvidenceGraph => ({
  symbols: [],
  lines: [],
  texts: values.map((raw, index) => ({
    id: `TXT-${String(index + 1).padStart(3, '0')}`,
    raw,
    candidates: [raw],
    bounds: { x: 20, y: 20 + index * 30, w: 120, h: 20 },
    confidence: 0.99,
  })),
  junctions: [],
  crossovers: [],
  edges: [],
  conflicts: [],
});

it('normalizes voltage, current, capacity, CT ratio, and cable text without losing evidence', () => {
  const result = normalizeElectricalGraph(makeGraphWithTexts([
    '22.9kV', '630kVA', 'VCB 25.8kV 630A 12.5kA', 'CT 400/5A', 'CV 3C 35mm²',
  ]));
  expect(result.specs).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'voltage_V', value: 22900 }),
    expect.objectContaining({ field: 'capacity_kVA', value: 630 }),
    expect.objectContaining({ field: 'ctRatio', value: '400/5' }),
  ]));
  expect(result.specs.every((item) => item.evidenceId)).toBe(true);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx jest src/agent/electrical/__tests__/domain-normalizer.test.ts --runInBand`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement normalized fields and evidence-first parsing**

```ts
import type { EvidenceBounds } from '../vision/evidence-types';
import type { SpatialEvidenceGraph } from '../vision/spatial-graph';

export type ElectricalField =
  | 'voltage_V' | 'current_A' | 'capacity_kVA' | 'breaking_kA' | 'ctRatio' | 'cableSpec'
  | 'length_m' | 'conductorSize_mm2' | 'phase' | 'loadCurrent_A' | 'cableAmpacity_A'
  | 'faultCurrent_kA' | 'totalLoad_kW' | 'powerFactor' | 'demandFactor' | 'safetyMargin'
  | 'primaryCurrent_A' | 'secondaryCurrent_A' | 'burden_VA' | 'leadResistance_ohm';
export interface NormalizedSpec {
  ownerId?: string;
  field: ElectricalField;
  value: number | string;
  raw: string;
  evidenceId: string;
  bounds: EvidenceBounds;
  confidence: number;
}
export interface NormalizedElectricalGraph { graph: SpatialEvidenceGraph; specs: NormalizedSpec[]; warnings: string[] }

function numberOf(match: RegExpMatchArray | null): number | null {
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : null;
}

export function normalizeElectricalGraph(graph: SpatialEvidenceGraph): NormalizedElectricalGraph {
  const specs: NormalizedSpec[] = [];
  for (const text of graph.texts) {
    const raw = text.raw.replace(/,/g, '').trim();
    const add = (field: ElectricalField, value: number | string | null) => {
      if (value !== null) specs.push({ ownerId: undefined, field, value, raw, evidenceId: text.id, bounds: text.bounds, confidence: text.confidence });
    };
    const voltage = raw.match(/(\d+(?:\.\d+)?)\s*(kV|V)\b/i);
    add('voltage_V', voltage ? Number(voltage[1]) * (voltage[2].toLowerCase() === 'kv' ? 1000 : 1) : null);
    add('capacity_kVA', numberOf(raw.match(/(\d+(?:\.\d+)?)\s*kVA\b/i)));
    add('current_A', numberOf(raw.match(/(\d+(?:\.\d+)?)\s*A\b/i)));
    add('breaking_kA', numberOf(raw.match(/(\d+(?:\.\d+)?)\s*kA\b/i)));
    const ct = raw.match(/CT\s*(\d+)\s*\/\s*(\d+)\s*A?/i);
    add('ctRatio', ct ? `${ct[1]}/${ct[2]}` : null);
    const cable = raw.match(/\b(?:CV|F-CV|XLPE)\b[^\n]*/i);
    add('cableSpec', cable?.[0] ?? null);
  }
  return { graph, specs, warnings: [] };
}
```

- [ ] **Step 4: Add owner association only when unambiguous**

Add these tests:

```ts
it('does not assign a text owner when two compatible devices are inside the association radius', () => {
  const graph = makeGraphWithTexts(['630A']);
  graph.symbols = [
    { id: 'VCB-01', originalEvidenceId: 's1', typeCandidates: ['VCB'], rawLabel: 'VCB', bounds: { x: 0, y: 0, w: 20, h: 20 }, ports: [], confidence: 1 },
    { id: 'VCB-02', originalEvidenceId: 's2', typeCandidates: ['VCB'], rawLabel: 'VCB', bounds: { x: 40, y: 0, w: 20, h: 20 }, ports: [], confidence: 1 },
  ];
  expect(normalizeElectricalGraph(graph).specs[0].ownerId).toBeUndefined();
});

it('assigns a rating when exactly one compatible device is inside the association radius', () => {
  const graph = makeGraphWithTexts(['630A']);
  graph.symbols = [
    { id: 'VCB-01', originalEvidenceId: 's1', typeCandidates: ['VCB'], rawLabel: 'VCB', bounds: { x: 10, y: 10, w: 20, h: 20 }, ports: [], confidence: 1 },
  ];
  expect(normalizeElectricalGraph(graph).specs[0].ownerId).toBe('VCB-01');
});
```

Implement `ownerId` after parsing. Use bounds-center distance with an 80-source-pixel radius and this compatibility map: `capacity_kVA → TR/TRANSFORMER`, `ctRatio → CT`, `cableSpec/length_m/conductorSize_mm2 → CABLE/LINE`, and `voltage_V/current_A/breaking_kA → VCB/ACB/MCCB/ELB/CB/SWITCH/TR/TRANSFORMER`. Assign only when exactly one compatible symbol is inside the radius; zero or multiple candidates leave `ownerId` undefined and append `AMBIGUOUS_TEXT_OWNER:<evidenceId>` when multiple candidates exist.

Run: `npx jest src/agent/electrical/__tests__/domain-normalizer.test.ts --runInBand`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/electrical/domain-normalizer.ts src/agent/electrical/__tests__/domain-normalizer.test.ts
git diff --cached --check
git commit -m "feat(electrical): normalize drawing specs with provenance"
```

### Task 2: Electrical semantic invariants

**Files:**
- Create: `src/agent/electrical/electrical-invariants.ts`
- Test: `src/agent/electrical/__tests__/electrical-invariants.test.ts`

**Interfaces:**
- Consumes: `NormalizedElectricalGraph`.
- Produces: `ElectricalIssue[]`, `validateElectricalInvariants(input)`.

- [ ] **Step 1: Write failing source-path and protection tests**

```ts
import { validateElectricalInvariants } from '../electrical-invariants';
import type { NormalizedElectricalGraph } from '../domain-normalizer';

const makeRadialFixture = (options: { breaker: boolean; dangling: boolean }): NormalizedElectricalGraph => {
  const symbols = [
    { id: 'BUS-01', originalEvidenceId: 'sym-bus', typeCandidates: ['BUS'], rawLabel: 'SOURCE BUS', bounds: { x: 0, y: 0, w: 20, h: 20 }, ports: [], confidence: 1 },
    ...(options.breaker ? [{ id: 'VCB-01', originalEvidenceId: 'sym-vcb', typeCandidates: ['VCB'], rawLabel: 'VCB', bounds: { x: 50, y: 0, w: 20, h: 20 }, ports: [], confidence: 1 }] : []),
    { id: 'LOAD-01', originalEvidenceId: 'sym-load', typeCandidates: ['LOAD'], rawLabel: 'LOAD', bounds: { x: 100, y: 0, w: 20, h: 20 }, ports: [], confidence: 1 },
  ];
  const protectedFrom = options.breaker ? 'VCB-01' : 'BUS-01';
  return {
    graph: {
      symbols,
      lines: [],
      texts: [],
      junctions: [],
      crossovers: [],
      edges: [
        ...(options.breaker ? [{ id: 'EDGE-001', from: 'BUS-01', to: 'VCB-01', lineId: 'LINE-001', confidence: 1 }] : []),
        { id: 'EDGE-002', from: protectedFrom, to: 'LOAD-01', lineId: 'LINE-002', confidence: 1 },
        ...(options.dangling ? [{ id: 'EDGE-003', from: 'LOAD-01', to: 'MISSING-01', lineId: 'LINE-003', confidence: 1 }] : []),
      ],
      conflicts: [],
    },
    specs: [],
    warnings: [],
  };
};

it('blocks dangling edges and holds an unprotected load path', () => {
  const issues = validateElectricalInvariants(makeRadialFixture({ breaker: false, dangling: true }));
  expect(issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'DANGLING_EDGE', judgment: 'BLOCK' }),
    expect.objectContaining({ code: 'NO_UPSTREAM_PROTECTION', judgment: 'HOLD' }),
  ]));
  expect(issues.some((item) => item.judgment === 'PASS' && item.evidenceIds.length === 0)).toBe(false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx jest src/agent/electrical/__tests__/electrical-invariants.test.ts --runInBand`

Expected: FAIL because the validator is missing.

- [ ] **Step 3: Implement typed, evidence-bearing issues**

```ts
import type { NormalizedElectricalGraph } from './domain-normalizer';

export interface ElectricalIssue {
  id: string;
  code: 'DANGLING_EDGE' | 'ISOLATED_DEVICE' | 'NO_UPSTREAM_PROTECTION' | 'VOLTAGE_CONFLICT' | 'GROUND_PATH_UNKNOWN' | 'INPUT_REQUIRED';
  judgment: 'PASS' | 'FAIL' | 'HOLD' | 'BLOCK';
  severity: 'critical' | 'major' | 'minor' | 'info';
  message: string;
  evidenceIds: string[];
  requiredInputs: string[];
}

export function validateElectricalInvariants(input: NormalizedElectricalGraph): ElectricalIssue[] {
  const issues: ElectricalIssue[] = [];
  const nodeIds = new Set(input.graph.symbols.map((item) => item.id));
  for (const edge of input.graph.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({ id: `issue:dangling:${edge.id}`, code: 'DANGLING_EDGE', judgment: 'BLOCK', severity: 'critical', message: `${edge.id}의 끝점이 실기기에 결속되지 않았습니다.`, evidenceIds: [edge.lineId], requiredInputs: [] });
    }
  }
  const connected = new Set(input.graph.edges.flatMap((edge) => [edge.from, edge.to]));
  for (const symbol of input.graph.symbols) {
    if (!connected.has(symbol.id) && input.graph.symbols.length > 1) {
      issues.push({ id: `issue:isolated:${symbol.id}`, code: 'ISOLATED_DEVICE', judgment: 'HOLD', severity: 'major', message: `${symbol.id}가 계통과 연결되지 않았습니다.`, evidenceIds: [symbol.originalEvidenceId], requiredInputs: ['연결선 확인'] });
    }
  }
  return issues;
}
```

- [ ] **Step 4: Add graph traversal for supported protection paths**

Implement breadth-first traversal from recognized sources (`GEN`, `UTILITY`, source-side `BUS`) to loads. If a path contains no recognized `VCB`, `ACB`, `MCCB`, `CB`, `FUSE`, or `RELAY`, return `HOLD`, not `FAIL`, unless the drawing explicitly marks an unprotected direct connection. Add voltage-domain conflict tests using only source-linked voltage specs.

Run: `npx jest src/agent/electrical/__tests__/electrical-invariants.test.ts --runInBand`

Expected: all invariant tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/electrical/electrical-invariants.ts src/agent/electrical/__tests__/electrical-invariants.test.ts
git diff --cached --check
git commit -m "feat(electrical): validate source-linked SLD invariants"
```

### Task 3: Evidence-gated calculator routing

**Files:**
- Create: `src/agent/electrical/drawing-calculation-router.ts`
- Test: `src/agent/electrical/__tests__/drawing-calculation-router.test.ts`

**Interfaces:**
- Consumes: normalized graph and issues.
- Produces: `DrawingCalculationReceipt[]`, `routeDrawingCalculations(input)`.

- [ ] **Step 1: Write a failing no-assumption test**

```ts
import { routeDrawingCalculations } from '../drawing-calculation-router';
import type { ElectricalField, NormalizedElectricalGraph, NormalizedSpec } from '../domain-normalizer';

const makeCalculationFixture = (values: {
  voltage: number | null;
  current: number | null;
  length: number | null;
}): NormalizedElectricalGraph => {
  const rows: Array<[ElectricalField, number | null]> = [
    ['voltage_V', values.voltage],
    ['current_A', values.current],
    ['length_m', values.length],
    ['conductorSize_mm2', 35],
    ['phase', 3],
  ];
  const specs: NormalizedSpec[] = rows.flatMap(([field, value], index) => value == null ? [] : [{
    field,
    value,
    raw: String(value),
    evidenceId: `TXT-${index + 1}`,
    bounds: { x: 0, y: index * 20, w: 20, h: 10 },
    confidence: 1,
  }]);
  return {
    graph: { symbols: [], lines: [], texts: [], junctions: [], crossovers: [], edges: [], conflicts: [] },
    specs,
    warnings: [],
  };
};

it('holds voltage drop when current or length lacks source evidence', () => {
  const receipts = routeDrawingCalculations(makeCalculationFixture({ voltage: 380, current: null, length: 50 }));
  expect(receipts[0]).toMatchObject({ calculatorId: 'voltage-drop', judgment: 'HOLD' });
  expect(receipts[0].missingInputs).toContain('current_A');
  expect(receipts[0].result).toBeUndefined();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx jest src/agent/electrical/__tests__/drawing-calculation-router.test.ts --runInBand`

Expected: FAIL because the router is missing.

- [ ] **Step 3: Implement a fail-closed calculator receipt**

```ts
import { getCalculator } from '@/engine/calculators';
import type { NormalizedElectricalGraph } from './domain-normalizer';

export interface DrawingCalculationReceipt {
  id: string;
  calculatorId: string;
  judgment: 'PASS' | 'FAIL' | 'HOLD';
  status: 'SKIPPED' | 'CALCULATED' | 'ERROR';
  inputEvidenceIds: string[];
  missingInputs: string[];
  result?: unknown;
  error?: string;
}

export function runIfComplete(
  calculatorId: string,
  requiredInputs: string[],
  input: Record<string, number | undefined>,
  evidenceByInput: Record<string, string | undefined>,
): DrawingCalculationReceipt {
  const missingInputs = requiredInputs.filter((key) => !Number.isFinite(input[key]) || !evidenceByInput[key]);
  if (missingInputs.length > 0) {
    return { id: `drawing-calc:${calculatorId}`, calculatorId, judgment: 'HOLD', status: 'SKIPPED', inputEvidenceIds: [], missingInputs };
  }
  const calculator = getCalculator(calculatorId);
  if (!calculator) return { id: `drawing-calc:${calculatorId}`, calculatorId, judgment: 'HOLD', status: 'ERROR', inputEvidenceIds: [], missingInputs: [], error: '등록된 계산기가 없습니다.' };
  try {
    const completeInput = Object.fromEntries(requiredInputs.map((key) => [key, input[key]])) as Record<string, number>;
    return { id: `drawing-calc:${calculatorId}`, calculatorId, judgment: 'HOLD', status: 'CALCULATED', inputEvidenceIds: requiredInputs.map((key) => evidenceByInput[key] as string), missingInputs: [], result: calculator.calculator(completeInput) };
  } catch (error) {
    return { id: `drawing-calc:${calculatorId}`, calculatorId, judgment: 'HOLD', status: 'ERROR', inputEvidenceIds: requiredInputs.map((key) => evidenceByInput[key]).filter(Boolean) as string[], missingInputs: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export function routeDrawingCalculations(_graph: NormalizedElectricalGraph): DrawingCalculationReceipt[] {
  return [];
}
```

- [ ] **Step 4: Add explicit routes one calculator at a time**

Implement routes only when their exact required inputs exist:

```ts
// voltage-drop: voltage_V, current_A, length_m, conductorSize_mm2, phase
// breaker-sizing: loadCurrent_A, cableAmpacity_A, faultCurrent_kA
// transformer-capacity: totalLoad_kW, powerFactor, demandFactor, safetyMargin
// ct-sizing: primaryCurrent_A, secondaryCurrent_A, burden_VA, leadResistance_ohm
```

Each route must have a test for complete input and a test for each missing required input. A calculator output is not automatically compliant; compare limits only in a dedicated standard evaluator and otherwise keep the receipt judgment as `HOLD` with a valid numeric result.

Run: `npx jest src/agent/electrical/__tests__/drawing-calculation-router.test.ts --runInBand`

Expected: all routes and HOLD cases PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/electrical/drawing-calculation-router.ts src/agent/electrical/__tests__/drawing-calculation-router.test.ts
git diff --cached --check
git commit -m "feat(electrical): gate drawing calculations on evidence"
```

### Task 4: Compare independent logic and resolve conflicts

**Files:**
- Create: `src/agent/electrical/logic-conflicts.ts`
- Test: `src/agent/electrical/__tests__/logic-conflicts.test.ts`

**Interfaces:**
- Consumes: `NormalizedElectricalGraph`, logic envelope.
- Produces: `LogicConflict[]`, `compareLogicToGraph(graph, envelope)`.

- [ ] **Step 1: Write a failing contradiction test**

```ts
import { compareLogicToGraph } from '../logic-conflicts';
import type { NormalizedElectricalGraph } from '../domain-normalizer';
import type { RoleReviewEnvelope } from '../../vision/review-types';

const makeGraphDirection = (from: string, to: string): NormalizedElectricalGraph => ({
  graph: {
    symbols: [from, to].map((id, index) => ({
      id,
      originalEvidenceId: `sym-${index + 1}`,
      typeCandidates: [id.split('-')[0]],
      rawLabel: id,
      bounds: { x: index * 100, y: 0, w: 20, h: 20 },
      ports: [],
      confidence: 1,
    })),
    lines: [],
    texts: [],
    junctions: [],
    crossovers: [],
    edges: [{ id: 'EDGE-001', from, to, lineId: 'LINE-001', confidence: 1 }],
    conflicts: [],
  },
  specs: [],
  warnings: [],
});

const makeLogicDirection = (from: string, to: string): RoleReviewEnvelope => ({
  role: 'logic',
  drawingHash: 'hash',
  provider: 'openai',
  model: 'test',
  promptVersion: 'sld-role-v1',
  outputHash: 'c'.repeat(64),
  durationMs: 1,
  data: {
    logic: [{ id: 'logic-1', topic: 'DIRECTION', subjectIds: [from, to], attributes: { fromId: from, toId: to }, statement: `${from} → ${to}`, evidenceBounds: [{ x: 0, y: 0, w: 120, h: 20 }], confidence: 1 }],
    warnings: [],
    confidence: 1,
  },
});

it('keeps a source-load direction disagreement unresolved', () => {
  const conflicts = compareLogicToGraph(makeGraphDirection('VCB-01', 'TR-01'), makeLogicDirection('TR-01', 'VCB-01'));
  expect(conflicts[0]).toMatchObject({ severity: 'critical', status: 'open', action: 'TARGETED_REVIEW' });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx jest src/agent/electrical/__tests__/logic-conflicts.test.ts --runInBand`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement typed conflict preservation**

```ts
import type { NormalizedElectricalGraph } from './domain-normalizer';
import type { RoleReviewEnvelope } from '../vision/review-types';

export interface LogicConflict {
  id: string;
  topic: 'DIRECTION' | 'PROTECTION_CHAIN' | 'VOLTAGE_DOMAIN' | 'DEVICE_IDENTITY' | 'MISSING_RELATION';
  severity: 'critical' | 'major' | 'minor';
  status: 'open' | 'resolved' | 'hold';
  graphEvidenceIds: string[];
  logicEvidenceIds: string[];
  action: 'TARGETED_REVIEW' | 'HUMAN_REVIEW';
  message: string;
}

export function compareLogicToGraph(
  graph: NormalizedElectricalGraph,
  logicEnvelope: RoleReviewEnvelope,
): LogicConflict[] {
  const conflicts: LogicConflict[] = [];
  for (const statement of logicEnvelope.data.logic ?? []) {
    const push = (topic: LogicConflict['topic'], graphEvidenceIds: string[], message: string) => conflicts.push({
      id: `conflict:${topic.toLowerCase()}:${statement.id}`,
      topic, severity: topic === 'DIRECTION' || topic === 'PROTECTION_CHAIN' ? 'critical' : 'major', status: 'open',
      graphEvidenceIds, logicEvidenceIds: [statement.id],
      action: 'TARGETED_REVIEW', message,
    });
    if (statement.topic === 'DIRECTION') {
      const from = statement.attributes?.fromId;
      const to = statement.attributes?.toId;
      const edge = graph.graph.edges.find((item) => item.from === from && item.to === to);
      const reverse = graph.graph.edges.find((item) => item.from === to && item.to === from);
      if (!edge && reverse) push('DIRECTION', [reverse.id], '독립 논리 판독과 공간 그래프의 흐름 방향이 반대입니다.');
    }
    if (statement.topic === 'VOLTAGE_DOMAIN') {
      const ownerId = statement.subjectIds[0];
      const spec = graph.specs.find((item) => item.ownerId === ownerId && item.field === 'voltage_V');
      if (spec && spec.value !== statement.attributes?.voltageV) push('VOLTAGE_DOMAIN', [spec.evidenceId], '독립 판독 전압과 정규화 전압이 다릅니다.');
    }
    if (statement.topic === 'DEVICE_IDENTITY') {
      const symbol = graph.graph.symbols.find((item) => item.id === statement.subjectIds[0]);
      const asserted = statement.attributes?.deviceType?.toUpperCase();
      if (symbol && asserted && !symbol.typeCandidates.map((item) => item.toUpperCase()).includes(asserted)) {
        push('DEVICE_IDENTITY', [symbol.originalEvidenceId], '독립 판독 기기 종류와 심볼 판독이 다릅니다.');
      }
    }
    if (statement.topic === 'PROTECTION_CHAIN') {
      const protectedBy = statement.attributes?.protectedById;
      const loadId = statement.subjectIds[0];
      const adjacent = graph.graph.edges.filter((item) => item.to === loadId || item.from === loadId);
      if (protectedBy && !adjacent.some((item) => item.from === protectedBy || item.to === protectedBy)) {
        push('PROTECTION_CHAIN', adjacent.map((item) => item.id), '독립 판독 보호기기와 그래프 인접 보호기기가 다릅니다.');
      }
    }
  }
  return conflicts;
}
```

- [ ] **Step 4: Add conflict fixtures for protection, voltage, and identity**

Add one table-driven test that clones `makeGraphDirection('VCB-01', 'TR-01')`, supplies a typed logic assertion, and checks the topic:

```ts
it.each([
  {
    topic: 'VOLTAGE_DOMAIN' as const,
    subjectIds: ['TR-01'],
    attributes: { voltageV: 22900 },
    prepare: (graph: NormalizedElectricalGraph) => graph.specs.push({ ownerId: 'TR-01', field: 'voltage_V', value: 380, raw: '380V', evidenceId: 'TXT-V', bounds: { x: 0, y: 0, w: 10, h: 10 }, confidence: 1 }),
  },
  {
    topic: 'DEVICE_IDENTITY' as const,
    subjectIds: ['VCB-01'],
    attributes: { deviceType: 'TR' },
    prepare: (_graph: NormalizedElectricalGraph) => undefined,
  },
  {
    topic: 'PROTECTION_CHAIN' as const,
    subjectIds: ['TR-01'],
    attributes: { protectedById: 'MCCB-99' },
    prepare: (_graph: NormalizedElectricalGraph) => undefined,
  },
])('preserves a $topic contradiction for targeted review', ({ topic, subjectIds, attributes, prepare }) => {
  const graph = makeGraphDirection('VCB-01', 'TR-01');
  prepare(graph);
  const envelope = makeLogicDirection('VCB-01', 'TR-01');
  envelope.data.logic = [{ id: `logic-${topic}`, topic, subjectIds, attributes, statement: topic, evidenceBounds: [{ x: 0, y: 0, w: 20, h: 20 }], confidence: 1 }];
  expect(compareLogicToGraph(graph, envelope)).toEqual(expect.arrayContaining([
    expect.objectContaining({ topic, status: 'open', action: 'TARGETED_REVIEW' }),
  ]));
});
```

Run: `npx jest src/agent/electrical/__tests__/logic-conflicts.test.ts --runInBand`

Expected: all conflict types remain open until an explicit re-review decision is supplied.

- [ ] **Step 5: Commit**

```bash
git add src/agent/electrical/logic-conflicts.ts src/agent/electrical/__tests__/logic-conflicts.test.ts
git diff --cached --check
git commit -m "feat(electrical): preserve independent logic conflicts"
```

### Task 5: Evidence-bounded synthesis and orchestrator integration

**Files:**
- Create: `src/agent/electrical/synthesis.ts`
- Test: `src/agent/electrical/__tests__/synthesis.test.ts`
- Modify: `src/agent/teams/sld-team.ts`
- Modify: `src/agent/orchestrator.ts`
- Test: `src/agent/__tests__/orchestrator-independent-review.test.ts`

**Interfaces:**
- Produces: `DrawingSynthesis`, `synthesizeDrawingReview(input)`.
- Adds to `OrchestratorResponse`: optional `drawingSynthesis` and a consensus reason that explicitly says independent review synthesis.

- [ ] **Step 1: Write a failing no-invention test**

```ts
import { synthesizeDrawingReview, type DrawingSynthesis } from '../synthesis';

const makeSynthesisInput = (
  options: { claimEvidenceIds?: string[] } = {},
): DrawingSynthesis => ({
  graph: {
    graph: {
      symbols: [{ id: 'VCB-01', originalEvidenceId: 'sym-1', typeCandidates: ['VCB'], rawLabel: 'VCB', bounds: { x: 0, y: 0, w: 20, h: 20 }, ports: [], confidence: 1 }],
      lines: [],
      texts: [],
      junctions: [],
      crossovers: [],
      edges: [],
      conflicts: [],
    },
    specs: [],
    warnings: [],
  },
  calculations: [],
  issues: [],
  conflicts: [],
  claims: [{ id: 'claim-1', text: 'VCB-01이 확인되었습니다.', evidenceIds: options.claimEvidenceIds ?? ['sym-1'], status: 'verified' }],
  requiresHumanReview: false,
});

it('rejects a claim whose evidence IDs do not exist', () => {
  expect(() => synthesizeDrawingReview(makeSynthesisInput({ claimEvidenceIds: ['missing'] }))).toThrow('근거가 없는 종합 주장');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx jest src/agent/electrical/__tests__/synthesis.test.ts --runInBand`

Expected: FAIL because the synthesis module is missing.

- [ ] **Step 3: Implement the deterministic synthesis envelope**

```ts
import type { DrawingCalculationReceipt } from './drawing-calculation-router';
import type { ElectricalIssue } from './electrical-invariants';
import type { LogicConflict } from './logic-conflicts';
import type { NormalizedElectricalGraph } from './domain-normalizer';

export interface SynthesisClaim { id: string; text: string; evidenceIds: string[]; status: 'verified' | 'disputed' | 'hold' }
export interface DrawingSynthesis {
  graph: NormalizedElectricalGraph;
  calculations: DrawingCalculationReceipt[];
  issues: ElectricalIssue[];
  conflicts: LogicConflict[];
  claims: SynthesisClaim[];
  requiresHumanReview: boolean;
}

export function synthesizeDrawingReview(input: DrawingSynthesis): DrawingSynthesis {
  const known = new Set([
    ...input.graph.graph.symbols.flatMap((item) => [item.id, item.originalEvidenceId]),
    ...input.graph.graph.lines.flatMap((item) => [item.id, item.originalEvidenceId]),
    ...input.graph.graph.edges.map((item) => item.id),
    ...input.calculations.flatMap((item) => [item.id, ...item.inputEvidenceIds]),
    ...input.issues.flatMap((item) => [item.id, ...item.evidenceIds]),
  ]);
  for (const claim of input.claims) {
    if (claim.evidenceIds.length === 0 || claim.evidenceIds.some((id) => !known.has(id))) {
      throw new Error('근거가 없는 종합 주장입니다.');
    }
  }
  return { ...input, requiresHumanReview: input.conflicts.some((item) => item.status !== 'resolved') || input.issues.some((item) => item.judgment === 'BLOCK' || item.judgment === 'HOLD') };
}
```

- [ ] **Step 4: Integrate image SLD synthesis in the orchestrator**

For `sld_image`, execute the role council inside `TEAM-SLD`, run deterministic normalization/checks, then make the separate synthesis stage consume that artifact. Do not count `TEAM-STD` as an independent image reader. Set the response reason exactly to:

```ts
consensus.reason = '원본 격리 심사 4개를 메인 종합 단계에서 대조했습니다.';
```

If any required role is missing, keep the overall request usable but set `report.requiresHumanReview = true`, verdict `CONDITIONAL`, and expose the missing role.

- [ ] **Step 5: Run agent and regression slices**

Run: `npx jest src/agent/electrical src/agent/__tests__/orchestrator-independent-review.test.ts src/agent/__tests__/orchestrator.test.ts src/agent/teams/__tests__/consensus-report-integrity.test.ts --runInBand`

Expected: all suites PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 6: Commit task-specific hunks**

```bash
git add src/agent/electrical/synthesis.ts src/agent/electrical/__tests__/synthesis.test.ts src/agent/__tests__/orchestrator-independent-review.test.ts
git add -p src/agent/teams/sld-team.ts src/agent/orchestrator.ts
git diff --cached --check
git commit -m "feat(agent): synthesize independent SLD evidence"
```

## Plan 3 Completion Gate

```bash
npx jest src/agent/electrical src/agent --runInBand
npx tsc --noEmit
```

Expected: exit 0. Verify no test passes by supplying invented defaults or claims without evidence.
