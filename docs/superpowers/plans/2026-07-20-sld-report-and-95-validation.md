# SLD Evidence Report and 95% Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose numbered evidence, relationships, dissent, HOLD items, and recommendations to users, then block the 95% claim unless offline and live golden-set metrics pass.

**Architecture:** The report builder accepts only the synthesis artifact and produces a serializable evidence report. The UI renders source-linked overlays and tables from that report. A deterministic metrics module measures symbol, text, edge, junction, and logic performance; a gate script exits non-zero when any required metric is below its threshold.

**Tech Stack:** TypeScript 5.9, Next.js 16, React 19, Jest 30, Playwright, Node scripts

## Global Constraints

- Every final claim and recommendation must point to source evidence or a deterministic receipt.
- Unknown, missing, failed, and disputed results remain visible; no empty-success fallback.
- The 95% badge is hidden until the real-drawing golden manifest contains adjudicated labels and every required metric passes.
- Synthetic 95% never substitutes for real-drawing 95%.
- The overlay uses original page coordinates and remains aligned at mobile and desktop widths.
- Existing dirty working-tree changes are user-owned. Stage only task-specific hunks.
- Requires Plans 1–3.

## File Structure

- Create `src/agent/report/drawing-intelligence-report.ts`: serializable evidence report.
- Create `src/agent/report/metrics.ts`: deterministic precision/recall/F1 computation.
- Create `src/components/DrawingEvidenceOverlay.tsx`: numbered source overlay.
- Create `src/components/DrawingIntelligenceReport.tsx`: quantities, relations, issues, recommendations, dissent, HOLD.
- Modify `src/agent/teams/types.ts`: add report extension without breaking stored v1 reports.
- Modify `src/app/api/team-review/route.ts`: return and persist the extension.
- Modify `src/app/(with-nav)/tools/sld/page.tsx`: render the source-linked result.
- Create `fixtures/drawings/golden/sld-golden-manifest.json`: versioned fixture metadata, starting with generated synthetic degradations.
- Create `scripts/sld-golden-gate.mjs`: metric threshold exit gate.
- Create Jest and Playwright tests.

---

### Task 1: Evidence report contract and traceability gate

**Files:**
- Create: `src/agent/report/drawing-intelligence-report.ts`
- Test: `src/agent/report/__tests__/drawing-intelligence-report.test.ts`
- Modify: `src/agent/teams/types.ts`

**Interfaces:**
- Consumes: `DrawingSynthesis` and sealed role envelopes.
- Produces: `DrawingIntelligenceReport`, `buildDrawingIntelligenceReport(input)`.

- [ ] **Step 1: Write the failing report traceability test**

```ts
import {
  buildDrawingIntelligenceReport,
  type DrawingRecommendation,
} from '../drawing-intelligence-report';
import type { DrawingSynthesis } from '../../electrical/synthesis';

const makeReportInput = (options: { recommendationEvidenceIds?: string[] } = {}) => {
  const synthesis: DrawingSynthesis = {
    graph: {
      graph: {
        symbols: [
          { id: 'VCB-01', originalEvidenceId: 'sym-1', typeCandidates: ['VCB'], rawLabel: 'VCB', bounds: { x: 0, y: 0, w: 20, h: 20 }, ports: [{ x: 20, y: 10 }], confidence: 1 },
          { id: 'TR-01', originalEvidenceId: 'sym-2', typeCandidates: ['TR'], rawLabel: 'TR', bounds: { x: 80, y: 0, w: 20, h: 20 }, ports: [{ x: 80, y: 10 }], confidence: 1 },
        ],
        lines: [{ id: 'LINE-001', originalEvidenceId: 'line-raw-1', lineKind: 'power', path: [{ x: 20, y: 10 }, { x: 80, y: 10 }], start: { x: 20, y: 10 }, end: { x: 80, y: 10 }, junctions: [], crossovers: [], confidence: 1 }],
        texts: [],
        junctions: [],
        crossovers: [],
        edges: [{ id: 'EDGE-001', from: 'VCB-01', to: 'TR-01', lineId: 'LINE-001', confidence: 1 }],
        conflicts: [],
      },
      specs: [],
      warnings: [],
    },
    calculations: [],
    issues: [],
    conflicts: [],
    claims: [{ id: 'claim-1', text: 'VCB-01에서 TR-01로 연결됩니다.', evidenceIds: ['EDGE-001'], status: 'verified' }],
    requiresHumanReview: false,
  };
  const recommendation: DrawingRecommendation = {
    id: 'rec-1',
    title: '정격 확인',
    description: '차단기 정격 근거를 확인합니다.',
    impact: 'high',
    evidence: (options.recommendationEvidenceIds ?? ['sym-1']).map((evidenceId) => ({ evidenceId })),
    requiredInputs: [],
  };
  return { drawingHash: 'hash', synthesis, recommendations: [recommendation], verified95: false };
};

it('builds numbered relations and rejects an untraceable recommendation', () => {
  expect(() => buildDrawingIntelligenceReport(makeReportInput({ recommendationEvidenceIds: [] })))
    .toThrow('개선안에 근거가 없습니다');
  const report = buildDrawingIntelligenceReport(makeReportInput());
  expect(report.relations[0].text).toContain('VCB-01');
  expect(report.relations[0].text).toContain('LINE-001');
  expect(report.traceability).toBe(1);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx jest src/agent/report/__tests__/drawing-intelligence-report.test.ts --runInBand`

Expected: FAIL because the report module is missing.

- [ ] **Step 3: Implement the serializable report**

```ts
import type { EvidenceBounds } from '../vision/evidence-types';
import type { DrawingSynthesis } from '../electrical/synthesis';

export interface EvidenceLink { evidenceId: string; bounds?: EvidenceBounds }
export interface DrawingRelation { id: string; from: string; line: string; to: string; text: string; evidence: EvidenceLink[] }
export interface DrawingRecommendation { id: string; title: string; description: string; impact: 'high' | 'medium' | 'low'; evidence: EvidenceLink[]; requiredInputs: string[] }
export interface DrawingIntelligenceReport {
  schemaVersion: 2;
  drawingHash: string;
  symbols: Array<{ id: string; type: string; label: string; bounds: EvidenceBounds; confidence: number }>;
  lines: Array<{ id: string; kind: string; path: Array<{ x: number; y: number }>; confidence: number }>;
  relations: DrawingRelation[];
  issues: DrawingSynthesis['issues'];
  conflicts: DrawingSynthesis['conflicts'];
  calculations: DrawingSynthesis['calculations'];
  recommendations: DrawingRecommendation[];
  holds: string[];
  traceability: number;
  verified95: boolean;
}

export function buildDrawingIntelligenceReport(input: {
  drawingHash: string;
  synthesis: DrawingSynthesis;
  recommendations: DrawingRecommendation[];
  verified95: boolean;
}): DrawingIntelligenceReport {
  for (const item of input.recommendations) {
    if (item.evidence.length === 0) throw new Error('개선안에 근거가 없습니다.');
  }
  const graph = input.synthesis.graph.graph;
  const lines = new Map(graph.lines.map((item) => [item.id, item]));
  const relations = graph.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    line: edge.lineId,
    to: edge.to,
    text: `${edge.from} → ${edge.lineId} → ${edge.to}`,
    evidence: [{ evidenceId: edge.id }, { evidenceId: edge.lineId }],
  }));
  const totalClaims = relations.length + input.recommendations.length;
  const traced = relations.filter((item) => item.evidence.length > 0).length + input.recommendations.filter((item) => item.evidence.length > 0).length;
  return {
    schemaVersion: 2,
    drawingHash: input.drawingHash,
    symbols: graph.symbols.map((item) => ({ id: item.id, type: item.typeCandidates[0] ?? 'unknown', label: item.rawLabel, bounds: item.bounds, confidence: item.confidence })),
    lines: graph.lines.map((item) => ({ id: item.id, kind: item.lineKind, path: item.path, confidence: item.confidence })),
    relations,
    issues: input.synthesis.issues,
    conflicts: input.synthesis.conflicts,
    calculations: input.synthesis.calculations,
    recommendations: input.recommendations,
    holds: [
      ...input.synthesis.issues.filter((item) => item.judgment === 'HOLD' || item.judgment === 'BLOCK').map((item) => item.message),
      ...input.synthesis.conflicts.filter((item) => item.status !== 'resolved').map((item) => item.message),
    ],
    traceability: totalClaims === 0 ? 1 : traced / totalClaims,
    verified95: input.verified95,
  };
}
```

- [ ] **Step 4: Add an optional v2 extension to the existing report type**

```ts
// Add inside ESVAVerifiedReport; keep optional for stored v1 compatibility.
drawingIntelligence?: import('../report/drawing-intelligence-report').DrawingIntelligenceReport;
```

- [ ] **Step 5: Run report tests and typecheck**

Run: `npx jest src/agent/report --runInBand`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 6: Commit task hunks**

```bash
git add src/agent/report/drawing-intelligence-report.ts src/agent/report/__tests__/drawing-intelligence-report.test.ts
git add -p src/agent/teams/types.ts
git diff --cached --check
git commit -m "feat(report): add traceable SLD intelligence report"
```

### Task 2: Numbered source overlay and report UI

**Files:**
- Create: `src/components/DrawingEvidenceOverlay.tsx`
- Create: `src/components/DrawingIntelligenceReport.tsx`
- Modify: `src/app/(with-nav)/tools/sld/page.tsx`
- Test: `src/app/__tests__/sld-report-surface.test.ts`

**Interfaces:**
- Consumes: `DrawingIntelligenceReport`, source image URL, original width/height.
- Produces: responsive SVG overlay and accessible evidence tables.

- [ ] **Step 1: Write a failing source-contract test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

it('keeps evidence IDs, HOLD, and relation text on the SLD surface', () => {
  const overlay = readFileSync(join(process.cwd(), 'src/components/DrawingEvidenceOverlay.tsx'), 'utf8');
  const report = readFileSync(join(process.cwd(), 'src/components/DrawingIntelligenceReport.tsx'), 'utf8');
  expect(overlay).toContain('aria-label={`도면 근거 ${item.id}`}');
  expect(report).toContain('미확인·보류');
  expect(report).toContain('기기 연결관계');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx jest src/app/__tests__/sld-report-surface.test.ts --runInBand`

Expected: FAIL because the components are missing.

- [ ] **Step 3: Create the responsive SVG overlay**

```tsx
'use client';

import type { DrawingIntelligenceReport } from '@/agent/report/drawing-intelligence-report';

export function DrawingEvidenceOverlay({ src, width, height, report, activeId, onSelect }: {
  src: string;
  width: number;
  height: number;
  report: DrawingIntelligenceReport;
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="relative overflow-auto rounded-xl border border-[var(--border)] bg-white">
      <img src={src} alt="분석 원본 단선결선도" className="block h-auto w-full" />
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full" role="group" aria-label="도면 분석 근거 오버레이">
        {report.symbols.map((item) => (
          <g key={item.id} role="button" tabIndex={0} aria-label={`도면 근거 ${item.id}`} onClick={() => onSelect?.(item.id)}>
            <rect x={item.bounds.x} y={item.bounds.y} width={item.bounds.w} height={item.bounds.h} fill="transparent" stroke={activeId === item.id ? '#dc2626' : '#2563eb'} strokeWidth={activeId === item.id ? 4 : 2} />
            <text x={item.bounds.x} y={Math.max(12, item.bounds.y - 4)} fill="#111827" fontSize="12">{item.id}</text>
          </g>
        ))}
        {report.lines.map((item) => <polyline key={item.id} points={item.path.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#f97316" strokeWidth="2" />)}
      </svg>
    </div>
  );
}
```

- [ ] **Step 4: Create accessible quantities, relations, problems, proposals, and HOLD sections**

Implement the complete component:

```tsx
'use client';

import type { DrawingIntelligenceReport as DrawingReport } from '@/agent/report/drawing-intelligence-report';

export function DrawingIntelligenceReport({ report, onSelect }: {
  report: DrawingReport;
  onSelect?: (id: string) => void;
}) {
  const counts = Object.entries(report.symbols.reduce<Record<string, number>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1;
    return acc;
  }, {})).sort(([left], [right]) => left.localeCompare(right));
  return (
    <div className="space-y-6">
      {report.verified95 ? <p aria-label="실도면 골든셋 95퍼센트 검증 통과">실도면 검증 95%+</p> : null}
      <section aria-labelledby="quantities-heading">
        <h2 id="quantities-heading">기기 수량</h2>
        <table><thead><tr><th scope="col">종류</th><th scope="col">수량</th></tr></thead>
          <tbody>{counts.map(([type, count]) => <tr key={type}><th scope="row">{type}</th><td>{count}</td></tr>)}</tbody>
        </table>
      </section>
      <section aria-labelledby="relations-heading">
        <h2 id="relations-heading">기기 연결관계</h2>
        <ol>{report.relations.map((item) => <li key={item.id}><button type="button" onClick={() => onSelect?.(item.from)}>{item.text}</button></li>)}</ol>
      </section>
      <section aria-labelledby="issues-heading">
        <h2 id="issues-heading">문제 및 전기적 교차검증</h2>
        {report.issues.length === 0 ? <p>검출된 문제가 없습니다.</p> : <ul>{report.issues.map((item) => <li key={item.id}><strong>{item.severity}</strong> {item.message}</li>)}</ul>}
      </section>
      <section aria-labelledby="calculations-heading">
        <h2 id="calculations-heading">근거 기반 계산</h2>
        {report.calculations.length === 0 ? <p>실행 가능한 계산이 없습니다.</p> : <ul>{report.calculations.map((item) => <li key={item.id}>{item.calculatorId}: {item.status} / {item.judgment}</li>)}</ul>}
      </section>
      <section aria-labelledby="dissent-heading">
        <h2 id="dissent-heading">독립 심사 이견</h2>
        {report.conflicts.length === 0 ? <p>열린 이견이 없습니다.</p> : <ul>{report.conflicts.map((item) => <li key={item.id}>{item.message}</li>)}</ul>}
      </section>
      <section aria-labelledby="recommendations-heading">
        <h2 id="recommendations-heading">개선 제안</h2>
        {report.recommendations.length === 0 ? <p>근거가 확보된 제안이 없습니다.</p> : <ol>{report.recommendations.map((item) => <li key={item.id}><h3>{item.title}</h3><p>{item.description}</p>{item.evidence.map((evidence) => <button type="button" key={evidence.evidenceId} onClick={() => onSelect?.(evidence.evidenceId)}>근거 {evidence.evidenceId}</button>)}</li>)}</ol>}
      </section>
      <section aria-labelledby="holds-heading">
        <h2 id="holds-heading">미확인·보류</h2>
        {report.holds.length === 0 ? <p>보류 항목이 없습니다.</p> : <ul>{report.holds.map((item) => <li key={item}>{item}</li>)}</ul>}
      </section>
    </div>
  );
}
```

Do not render any 95% badge when `verified95` is false.

- [ ] **Step 5: Wire the components into the existing SLD result panel**

Keep existing upload, provider selection, loading, error, and legacy results. Render the new surface when `result.reportFull?.drawingIntelligence` exists and retain a compatibility fallback for old reports.

Run: `npx jest src/app/__tests__/sld-report-surface.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit new components and task-specific page hunks**

```bash
git add src/components/DrawingEvidenceOverlay.tsx src/components/DrawingIntelligenceReport.tsx src/app/__tests__/sld-report-surface.test.ts
git add -p 'src/app/(with-nav)/tools/sld/page.tsx'
git diff --cached --check
git commit -m "feat(ui): show numbered SLD evidence and relationships"
```

### Task 3: Persist and return the v2 report extension

**Files:**
- Create: `src/agent/report/golden-gate.ts`
- Test: `src/agent/report/__tests__/golden-gate.test.ts`
- Modify: `src/app/api/team-review/route.ts`
- Modify: `src/lib/report-store.ts`
- Test: `src/app/api/team-review/__tests__/route.test.ts`
- Test: `src/lib/__tests__/report-store.test.ts`

**Interfaces:**
- Returns: `reportFull.drawingIntelligence` when present.
- Persists: complete v2 report under the existing ownership and integrity rules.
- Produces: fail-closed `isCurrentGoldenGatePassing()`; no receipt or stale receipt always returns `false`.

- [ ] **Step 1: Add a failing API round-trip assertion**

```ts
expect(body.reportFull.drawingIntelligence).toMatchObject({
  schemaVersion: 2,
  drawingHash: expect.any(String),
  verified95: false,
});
expect(saveReport).toHaveBeenCalledWith(expect.objectContaining({
  drawingIntelligence: expect.any(Object),
}), expect.any(String));
```

- [ ] **Step 2: Run and verify failure**

Run: `npx jest src/app/api/team-review/__tests__/route.test.ts src/lib/__tests__/report-store.test.ts --runInBand`

Expected: FAIL because the extension is not assembled/persisted.

- [ ] **Step 3: Attach the report extension before existing persistence**

In the orchestrator/report assembly path, call `buildDrawingIntelligenceReport` and assign:

```ts
verifiedReport.drawingIntelligence = buildDrawingIntelligenceReport({
  drawingHash: drawingArtifact.snapshot.drawingHash,
  synthesis: drawingArtifact.synthesis,
  recommendations: drawingArtifact.recommendations,
  verified95: await isCurrentGoldenGatePassing(),
});
```

Create `src/agent/report/golden-gate.ts`:

```ts
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function isCurrentGoldenGatePassing(options: {
  root?: string;
  now?: number;
  maxAgeMs?: number;
} = {}): Promise<boolean> {
  try {
    const root = options.root ?? process.cwd();
    const manifestRaw = await readFile(join(root, 'fixtures/drawings/golden/sld-golden-manifest.json'), 'utf8');
    const receiptRaw = await readFile(join(root, 'test-results/sld-golden-gate.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw) as { schemaVersion?: number; revision?: string; claimEligible?: boolean };
    const receipt = JSON.parse(receiptRaw) as {
      schemaVersion?: number;
      manifestRevision?: string;
      manifestHash?: string;
      generatedAt?: string;
      thresholdsPassed?: boolean;
      verified95?: boolean;
    };
    const generatedAt = Date.parse(receipt.generatedAt ?? '');
    const age = (options.now ?? Date.now()) - generatedAt;
    const currentHash = createHash('sha256').update(manifestRaw).digest('hex');
    return manifest.schemaVersion === 1 &&
      manifest.claimEligible === true &&
      receipt.schemaVersion === 1 &&
      receipt.manifestRevision === manifest.revision &&
      receipt.manifestHash === currentHash &&
      receipt.thresholdsPassed === true &&
      receipt.verified95 === true &&
      Number.isFinite(generatedAt) &&
      age >= 0 &&
      age <= (options.maxAgeMs ?? DEFAULT_MAX_AGE_MS);
  } catch {
    return false;
  }
}
```

Add tests using a Jest temporary directory for: missing receipt, malformed receipt, manifest-hash mismatch, expired receipt, `claimEligible: false`, and one current passing receipt. Every failure case must resolve to `false` rather than throw.

- [ ] **Step 4: Preserve integrity hashing and owner checks**

Ensure the existing report hash includes the extension before persistence. On read-back, reject a mutated extension using the current report integrity verification. Do not add a second report store.

Run: `npx jest src/app/api/team-review/__tests__/route.test.ts src/lib/__tests__/report-store.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit task hunks**

```bash
git add src/agent/report/golden-gate.ts src/agent/report/__tests__/golden-gate.test.ts
git add -p src/app/api/team-review/route.ts src/lib/report-store.ts src/app/api/team-review/__tests__/route.test.ts src/lib/__tests__/report-store.test.ts
git diff --cached --check
git commit -m "feat(api): persist source-linked SLD reports"
```

### Task 4: Deterministic 95% metric engine and gate receipt

**Files:**
- Create: `src/agent/report/metrics.ts`
- Test: `src/agent/report/__tests__/metrics.test.ts`
- Create: `fixtures/drawings/golden/sld-golden-manifest.json`
- Create: `scripts/sld-golden-gate.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `precisionRecallF1`, `evaluateGoldenPrediction`, gate receipt `test-results/sld-golden-gate.json`.

- [ ] **Step 1: Write exact metric tests**

```ts
import { precisionRecallF1 } from '../metrics';

it('computes exact precision, recall, and F1', () => {
  expect(precisionRecallF1(95, 5, 5)).toEqual({ precision: 0.95, recall: 0.95, f1: 0.95 });
  expect(precisionRecallF1(0, 0, 0)).toEqual({ precision: 1, recall: 1, f1: 1 });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx jest src/agent/report/__tests__/metrics.test.ts --runInBand`

Expected: FAIL because the metric module is missing.

- [ ] **Step 3: Implement the metric primitives**

```ts
export interface PRF1 { precision: number; recall: number; f1: number }

export function precisionRecallF1(tp: number, fp: number, fn: number): PRF1 {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

export interface GoldenCounts {
  symbolsByType: Record<string, { tp: number; fp: number; fn: number }>;
  textFields: { correct: number; total: number };
  edges: { tp: number; fp: number; fn: number };
  junctionsAndCrossovers: { correct: number; total: number };
  criticalLogicIssues: { found: number; total: number };
  unsupportedPassCount: number;
  claims: { traced: number; total: number };
}

export interface GoldenMetrics {
  symbolMacroF1: number;
  textFieldAccuracy: number;
  edgeF1: number;
  junctionAccuracy: number;
  criticalLogicRecall: number;
  unsupportedPassCount: number;
  claimTraceability: number;
}

const ratio = (correct: number, total: number) => total === 0 ? 1 : correct / total;

export function evaluateGoldenPrediction(input: GoldenCounts): GoldenMetrics {
  const symbolScores = Object.values(input.symbolsByType).map((counts) =>
    precisionRecallF1(counts.tp, counts.fp, counts.fn).f1);
  return {
    symbolMacroF1: symbolScores.length === 0 ? 1 : symbolScores.reduce((sum, value) => sum + value, 0) / symbolScores.length,
    textFieldAccuracy: ratio(input.textFields.correct, input.textFields.total),
    edgeF1: precisionRecallF1(input.edges.tp, input.edges.fp, input.edges.fn).f1,
    junctionAccuracy: ratio(input.junctionsAndCrossovers.correct, input.junctionsAndCrossovers.total),
    criticalLogicRecall: ratio(input.criticalLogicIssues.found, input.criticalLogicIssues.total),
    unsupportedPassCount: input.unsupportedPassCount,
    claimTraceability: ratio(input.claims.traced, input.claims.total),
  };
}
```

Add tests for zero-denominator handling, a per-type macro average, and a deliberately degraded count set.

- [ ] **Step 4: Create a non-claiming initial manifest**

```json
{
  "schemaVersion": 1,
  "revision": "sld-golden-v1",
  "claimEligible": false,
  "datasets": [
    { "id": "synthetic-degraded", "kind": "synthetic", "labels": "fixtures/drawings/synthetic", "predictions": "test-results/sld-synthetic-predictions.json" }
  ],
  "thresholds": {
    "symbolMacroF1": 0.95,
    "textFieldAccuracy": 0.95,
    "edgeF1": 0.95,
    "junctionAccuracy": 0.98,
    "criticalLogicRecall": 0.95,
    "unsupportedPassCount": 0,
    "claimTraceability": 1
  }
}
```

`claimEligible` changes to true only after an adjudicated real-drawing dataset is added. Synthetic-only output may pass regression but must emit `verified95: false`.

- [ ] **Step 5: Implement the exit-code gate**

Implement `scripts/sld-golden-gate.mjs`:

```js
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const manifestPath = join(root, 'fixtures/drawings/golden/sld-golden-manifest.json');
const receiptPath = join(root, 'test-results/sld-golden-gate.json');
const manifestRaw = await readFile(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);
const rows = [];
for (const dataset of manifest.datasets) {
  try {
    const payload = JSON.parse(await readFile(resolve(root, dataset.predictions), 'utf8'));
    if (payload.schemaVersion !== 1 || !payload.metrics) throw new Error(`Invalid metrics payload: ${dataset.id}`);
    rows.push({ id: dataset.id, kind: dataset.kind, metrics: payload.metrics });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const lowerBoundKeys = [
  'symbolMacroF1',
  'textFieldAccuracy',
  'edgeF1',
  'junctionAccuracy',
  'criticalLogicRecall',
  'claimTraceability',
];
const aggregate = rows.length === 0 ? null : Object.fromEntries([
  ...lowerBoundKeys.map((key) => [key, Math.min(...rows.map((row) => row.metrics[key]))]),
  ['unsupportedPassCount', rows.reduce((sum, row) => sum + row.metrics.unsupportedPassCount, 0)],
]);
const failures = aggregate == null ? ['NO_PREDICTION_DATA'] : [
  ...lowerBoundKeys.filter((key) => !Number.isFinite(aggregate[key]) || aggregate[key] < manifest.thresholds[key]),
  ...(!Number.isFinite(aggregate.unsupportedPassCount) ||
      aggregate.unsupportedPassCount > manifest.thresholds.unsupportedPassCount ? ['unsupportedPassCount'] : []),
];
const thresholdsPassed = aggregate != null && failures.length === 0;
const hasAdjudicatedRealData = rows.some((row) => row.kind === 'real-adjudicated');
const verified95 = manifest.claimEligible === true && hasAdjudicatedRealData && thresholdsPassed;
const receipt = {
  schemaVersion: 1,
  manifestRevision: manifest.revision,
  manifestHash: createHash('sha256').update(manifestRaw).digest('hex'),
  generatedAt: new Date().toISOString(),
  datasetsEvaluated: rows.map(({ id, kind }) => ({ id, kind })),
  metrics: aggregate,
  failures,
  thresholdsPassed,
  verified95,
};
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
if (aggregate != null && !thresholdsPassed) process.exitCode = 1;
```

Missing prediction data writes a fail-closed receipt with `verified95: false` and does not claim a threshold pass. When any prediction set is present, a missing/non-finite metric or threshold failure sets exit code 1.

Add to `package.json`:

```json
"test:sld-golden": "node scripts/sld-golden-gate.mjs"
```

- [ ] **Step 6: Run metric and gate tests**

Run: `npx jest src/agent/report/__tests__/metrics.test.ts --runInBand`

Expected: PASS.

Run: `npm run test:sld-golden`

Expected before a real adjudicated dataset: exit 0 for regression receipt generation, receipt contains `verified95: false`. A deliberately degraded prediction fixture must produce exit 1 in a dedicated Jest child-process test.

- [ ] **Step 7: Commit**

```bash
git add src/agent/report/metrics.ts src/agent/report/__tests__/metrics.test.ts fixtures/drawings/golden/sld-golden-manifest.json scripts/sld-golden-gate.mjs
git add -p package.json
git diff --cached --check
git commit -m "test(sld): add evidence-based 95 percent gate"
```

### Task 5: Live user path and failure-state verification

**Files:**
- Create: `tests/e2e/sld-independent-review.spec.ts`
- Modify: `docs/DRAWING_VALIDATION_RESULT.md`

**Interfaces:**
- Verifies: upload → role calls → source overlay → relation selection → report persistence/read-back → HOLD on role failure.

- [ ] **Step 1: Add a deterministic E2E fixture mode**

Use a server-only test flag that replaces provider calls with recorded sealed role responses. The flag must be rejected outside `NODE_ENV=test` and must never accept response data from the browser.

- [ ] **Step 2: Write the user-path Playwright test**

```ts
test('uploads an SLD and reaches numbered relationships with visible HOLD', async ({ page }) => {
  await page.goto('/tools/sld');
  await page.getByLabel('도면 파일').setInputFiles('fixtures/drawings/golden/ui-radial.png');
  await page.getByRole('button', { name: '정밀 분석 시작' }).click();
  await expect(page.getByRole('heading', { name: '기기 연결관계' })).toBeVisible();
  await expect(page.getByText('VCB-01 → LINE-001 → TR-01')).toBeVisible();
  await page.getByText('VCB-01 → LINE-001 → TR-01').click();
  await expect(page.getByLabel('도면 근거 VCB-01')).toBeVisible();
  await expect(page.getByRole('heading', { name: '미확인·보류' })).toBeVisible();
});
```

- [ ] **Step 3: Add a role-failure scenario**

Record a fixture in which the connection reviewer fails. Assert that the report is conditional, the failure is visible, and no 95% badge appears.

- [ ] **Step 4: Run the production user path**

Run: `npx playwright test tests/e2e/sld-independent-review.spec.ts`

Expected: all SLD E2E scenarios PASS with browser console errors 0.

- [ ] **Step 5: Record measured evidence without promoting synthetic results**

Update `docs/DRAWING_VALIDATION_RESULT.md` with exact commands, exit codes, fixture revision, metric receipt, and the statement that real-drawing accuracy remains `HOLD` until adjudicated labels exist.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/sld-independent-review.spec.ts
git add -p docs/DRAWING_VALIDATION_RESULT.md
git diff --cached --check
git commit -m "test(sld): verify independent review user path"
```

## Plan 4 Completion Gate

Run without pipes:

```bash
npx jest src/agent/report src/app/api/team-review src/lib/__tests__/report-store.test.ts --runInBand
npx tsc --noEmit
npm run test:sld-golden
npx playwright test tests/e2e/sld-independent-review.spec.ts
```

Expected: all commands exit 0. `verified95` remains false until the manifest includes an adjudicated real-drawing dataset and every threshold passes.
