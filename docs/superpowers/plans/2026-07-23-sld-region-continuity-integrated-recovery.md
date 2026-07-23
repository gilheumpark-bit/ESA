# SLD Region Continuity and Integrated Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 4×4 정밀 구획에서 잘린 선의 동일성을 `A/C/U` 계약으로 보존하고, 전역 합산 후 전체 페이지 재검증을 수행하며, 공개 도면 실측에서 확인된 PDF 렌더·표 오염·합성 접점·주석·평면도·스캔 결함을 같은 검증 파이프에 연결한다.

**Architecture:** 전체 페이지 역할을 먼저 실행해 전역 선 후보를 얻고, 겹치지 않는 logical core와 중첩 crop을 분리한다. 결정론적 planner가 logical seam 교차에 C 포트를 배정하고, renderer가 A/C 표지를 crop에 주입한다. 구획별 connections 결과는 허용된 C 앵커만 반환하며 stitcher가 인접성·관측 수·거리·접선·선 종류·전역 근거를 모두 확인한 뒤 local line을 최종 line으로 합친다. C는 감사 원장에만 남고 U가 남으면 COMPLETE를 금지한다. PDF.js 서버 자산과 콘텐츠 구역/스캔 라우팅은 선행 입력 안정화 계층으로 둔다.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Jest 30, Sharp 0.34, pdfjs-dist 6.1, @napi-rs/canvas 1.0.2.

**Working Tree Constraint:** 기준은 `9d49f8b`에서 시작한 `codex/sld-boundary-continuity` 브랜치의 dirty snapshot이다. 기존 55파일 변경은 다른 AI의 작업이므로 되돌리거나 덮어쓰지 않고 현재 내용 위에 국소 patch한다.

---

### Task 1: Logical Analysis Regions and Stable A IDs

**Files:**
- Modify: `src/agent/vision/evidence-types.ts`
- Modify: `src/agent/vision/adaptive-regions.ts`
- Modify: `src/agent/vision/vision-splitter.ts`
- Test: `src/agent/vision/__tests__/adaptive-regions.test.ts`
- Test: `src/agent/vision/__tests__/vision-splitter-crop.test.ts`

**Interfaces:**

```ts
interface AnalysisRegionPlan {
  id: string;
  displayId: string;
  pageIndex: number;
  row: number;
  column: number;
  logicalBounds: EvidenceBounds;
  cropBounds: EvidenceBounds;
}

function planAnalysisRegions(
  width: number,
  height: number,
  gridSize: 4 | 9 | 16,
  overlap: number,
  pageIndex?: number,
): AnalysisRegionPlan[];
```

- [ ] Add a failing test proving 16 row-major IDs `P01-A01`…`P01-A16`, exact non-overlapping core coverage, and overlapping crop bounds.
- [ ] Run `npx jest --runInBand src/agent/vision/__tests__/adaptive-regions.test.ts` and verify RED because `planAnalysisRegions` does not exist.
- [ ] Implement the planner while preserving `planAdaptiveBounds()` compatibility.
- [ ] Extend `PrecisionRegion` with `displayId`, `logicalOriginalBounds`, and `logicalVariantBounds`; make precision preparation use the new plan.
- [ ] Run the two focused suites and confirm GREEN.

### Task 2: Deterministic Boundary Continuation Planner

**Files:**
- Create: `src/agent/vision/continuity-types.ts`
- Create: `src/agent/vision/boundary-continuation-planner.ts`
- Create: `src/agent/vision/__tests__/boundary-continuation-planner.test.ts`

**Interfaces:**

```ts
function planBoundaryContinuations(input: {
  pageIndex: number;
  regions: readonly AnalysisRegionPlan[];
  lines: readonly GlobalLineCandidate[];
  tolerance?: number;
}): BoundaryContinuationPlan;
```

- [ ] Write separate failing tests for single crossings, three independent fragments in one region, two close parallel lines, corner grouping, seam-aligned lines, and seam-over-device exclusion.
- [ ] Verify RED with `npx jest --runInBand src/agent/vision/__tests__/boundary-continuation-planner.test.ts`.
- [ ] Implement finite-geometry validation, segment/seam intersections, deterministic hash IDs and `Pxx-Cnnn` display ordering.
- [ ] Require distinct source-line identity when crossings share coordinates; allow 3–4 observations only for a verified corner junction.
- [ ] Verify all planner tests GREEN and run `npx tsc --noEmit`.

### Task 3: A/C Crop Annotation Without Occlusion

**Files:**
- Create: `src/agent/vision/annotated-region-renderer.ts`
- Create: `src/agent/vision/__tests__/annotated-region-renderer.test.ts`
- Modify: `src/agent/vision/evidence-types.ts`

**Interfaces:**

```ts
function annotatePrecisionRegion(
  region: PrecisionRegion,
  ports: readonly BoundaryContinuation[],
): Promise<PrecisionRegion>;
```

- [ ] Write a failing real-pixel test using Sharp: A label exists, C markers lie in the overlap/core boundary band, output size is unchanged, and a protected central symbol pixel is unchanged.
- [ ] Verify RED with the focused test.
- [ ] Implement bounded SVG overlay composition with semantic colors from existing drawing tokens and no unbounded text.
- [ ] Store only manifest metadata and annotated pixels, never original source bytes in result JSON.
- [ ] Verify GREEN and inspect one generated fixture image only in the test temp area.

### Task 4: Two-Phase Council and Allowed Anchor Contract

**Files:**
- Modify: `src/agent/vision/review-types.ts`
- Modify: `src/agent/vision/role-prompts.ts`
- Modify: `src/agent/vision/drawing-council.ts`
- Modify: `src/agent/vision/vlm-client.ts`
- Modify: `src/agent/teams/types.ts`
- Modify: `src/agent/teams/sld-team.ts`
- Test: `src/agent/vision/__tests__/review-types.test.ts`
- Test: `src/agent/vision/__tests__/drawing-council.test.ts`
- Test: `src/agent/vision/__tests__/vlm-role-prompt.test.ts`
- Test: `src/agent/teams/__tests__/sld-team-independent-review.test.ts`

**Interfaces:**

```ts
interface LineEvidence {
  // existing fields
  startAnchorId?: string | null;
  endAnchorId?: string | null;
  openEndReason?: 'page-edge' | 'device-boundary' | 'unresolved' | null;
}
```

- [ ] Write RED tests proving full-page connections complete before any region connection call, annotated region context contains only its allowed C IDs, unknown `C999` is rejected, and C markers are forbidden as symbols.
- [ ] Split council execution into full primary survey, continuation planning/annotation, precision role calls, and final coverage audit without increasing the existing base 55-call cap.
- [ ] Add per-source context (`REGION_ID`, logical core, allowed C list); keep coverage context separate from drawing instructions.
- [ ] Parse optional anchors but validate them against the source manifest after remapping; unknown or cross-region anchors become role failures.
- [ ] Bump prompt/preprocess fingerprints so stale page digests cannot be reused.
- [ ] Run the four focused suites and typecheck.

### Task 5: Stitch Local Lines, Register U, and Preserve Receipts

**Files:**
- Create: `src/agent/drawing/boundary-line-stitcher.ts`
- Create: `src/agent/drawing/__tests__/boundary-line-stitcher.test.ts`
- Modify: `src/agent/drawing/types-v3.ts`
- Modify: `src/agent/drawing/evidence-deduplicator.ts`
- Modify: `src/agent/drawing/team-result-adapter.ts`
- Modify: `src/agent/drawing/document-orchestrator.ts`
- Modify: `src/agent/drawing/drawing-document-report.ts`
- Test: `src/agent/drawing/__tests__/evidence-deduplicator.test.ts`
- Test: `src/agent/drawing/__tests__/team-result-adapter.test.ts`
- Test: `src/agent/drawing/__tests__/document-orchestrator.test.ts`
- Test: `src/agent/drawing/__tests__/drawing-document-report.test.ts`

**Interfaces:**

```ts
function stitchBoundaryLines(input: {
  regions: readonly AnalysisRegionPlan[];
  continuations: readonly BoundaryContinuation[];
  localLines: readonly RawLineHit[];
  globalLines: readonly RawLineHit[];
}): {
  lines: RawLineHit[];
  continuations: BoundaryContinuation[];
  unresolvedEndpoints: UnresolvedEndpoint[];
  receipts: StitchReceipt[];
};
```

- [ ] Write RED tests for exact pair merge, missing half→U, tangent mismatch→U, line-kind mismatch→U, close parallel isolation, and confirmed corner junction.
- [ ] Implement endpoint-to-C binding, overlap trimming and receipt generation; never merge on C ID alone.
- [ ] Add `DrawingDocumentV3.continuity` as a backward-compatible optional read field but always emit it for new documents.
- [ ] Run stitch before `deduplicateLines()` and `buildPageRelations()`; retain the global whole-page line as corroboration, not a duplicate physical line.
- [ ] Add unresolved items with `Pxx-Unnn`; any unresolved U forces PARTIAL/HOLD and prevents supported recommendations derived from that line.
- [ ] Prove C/U never enter `SymbolNode` or equipment counts.
- [ ] Run the five focused suites and typecheck.

### Task 6: UI Overlay and Human Audit Surface

**Files:**
- Modify: `src/components/DrawingDocumentV3Overlay.tsx`
- Modify: `src/components/DrawingDocumentV3Report.tsx`
- Modify: `src/components/drawing-v3-labels.ts`
- Modify: `src/app/(with-nav)/tools/sld/page.tsx`
- Test: `src/app/__tests__/sld-report-surface.test.ts`

- [ ] Add a failing surface test proving A/C/U labels, continuity status, stitch receipt navigation and separate “근거 연결률” wording.
- [ ] Render A boundaries as low-emphasis dashed overlays, C as cyan continuation gates, and U as warning targets using existing CSS variables.
- [ ] Make every label keyboard-selectable and link the report row to original-page evidence.
- [ ] Keep C out of equipment/count tabs and show it only in a “구획 연결” audit section.
- [ ] Run the focused UI source test and targeted ESLint.

### Task 7: PDF.js Server Asset Closure

**Files:**
- Create: `src/agent/drawing/pdfjs-assets.ts`
- Modify: `src/agent/drawing/drawing-source.ts`
- Modify: `scripts/prepare-pdf-worker.mjs`
- Modify: `package.json`
- Test: `src/agent/drawing/__tests__/drawing-source.test.ts`
- Test: `scripts/__tests__/prepare-pdf-assets.test.ts`

- [ ] Write RED tests proving both PDF page-count and render calls receive `wasmUrl`, `standardFontDataUrl`, `cMapUrl`, and `useSystemFonts`, and prepared asset directories contain non-empty JBIG2/OpenJPEG/QCMS/standard-font files.
- [ ] Extend the preparation script to copy worker, wasm/image decoder, CMap and standard font assets into `public/vendor/pdfjs/` with explicit existence checks.
- [ ] Centralize Node URL/path options in `pdfjs-assets.ts`; use file URLs with trailing separators for server reads.
- [ ] Render ERIC-40/41 representative pages and assert non-white/non-empty pixels plus zero missing-asset warnings.
- [ ] Run focused tests and `npm run prepare:pdf-worker`.

### Task 8: Content-Zone, Synthetic Junction, Note and Scan Safeguards

**Files:**
- Create: `src/agent/drawing/content-zone-classifier.ts`
- Create: `src/agent/drawing/__tests__/content-zone-classifier.test.ts`
- Modify: `src/engine/topology/pdf-vector-parser.ts`
- Modify: `src/agent/drawing/count-register.ts`
- Modify: `src/agent/drawing/team-result-adapter.ts`
- Modify: `src/agent/drawing/page-classifier.ts`
- Modify: `src/agent/vision/image-variants.ts`
- Test: `src/agent/drawing/__tests__/count-register.test.ts`
- Test: `src/agent/drawing/__tests__/team-result-adapter.test.ts`
- Test: `src/agent/vision/__tests__/image-variants.test.ts`

- [ ] Write RED tests for cable-schedule table rejection, title-block line exclusion, note sentence non-device behavior, synthetic junction count=0, layout vocabulary routing and low-quality scan variant routing.
- [ ] Implement conservative `contentZone` classification; ambiguous/mixed content remains available and is not silently discarded.
- [ ] Mark parser-created junctions explicitly and exclude them from physical counts while retaining relation support.
- [ ] Add sentence-shape rejection before device promotion and a layout-specific prompt vocabulary.
- [ ] Verify deskew/contrast/non-generative upscale variants preserve inverse coordinate transforms.
- [ ] Run focused suites and typecheck.

### Task 9: Integrated Simulation, Regression and Live Round Trip

**Files:**
- Create: `scripts/simulate-region-continuity.mjs`
- Create: `fixtures/drawings/continuity/manifest.json`
- Modify: `docs/project/handoffs/2026-07-23-public-drawing-benchmark.md`
- Modify: `docs/DRAWING_VALIDATION_RESULT.md`

- [ ] Run the deterministic 4×4 geometry manifest and require exact 100% C pairing, zero cross-pair merges, and every intentional open end represented as U.
- [ ] Run focused drawing/vision suites without output filtering.
- [ ] Run `npm run test:drawing-v3`, `npx tsc --noEmit`, targeted ESLint, and `npm run build` once on the final snapshot.
- [ ] Start the production server and exercise upload→poll→report→A/C/U selection→correction→reload with the built-in fixture.
- [ ] If a test key is present, run UM-MCC, UM-SUB, SLO-E2, SLO-E4, ERIC-40/41 and KIMM representative pages; never persist the key or source binaries.
- [ ] Report per-layer symbol/text/C endpoint/relation/junction metrics. Keep `verified95=false` unless every fixed labeled stratum is at least 0.95 with a valid signed receipt.
- [ ] Run zero-caller checks for every new production module and check that no C/U entity reaches equipment counts.

### Task 10: Final Repair-Radius Sweep and Handoff

**Files:**
- Modify: `PROJECT_STATE.md` only if the 25-file/3-area threshold is crossed and the file exists.
- Modify: `docs/project/IMPLEMENTATION_MAP.md` only if required by the project handoff threshold.

- [ ] Inspect callers, sibling helpers, failure paths and tests around every repaired boundary.
- [ ] Run stub/placeholder/dead-caller searches and classify every hit.
- [ ] Review the final diff for accidental overwrite of the pre-existing dirty work.
- [ ] Record exact commands, exit codes, test counts, residual HOLD items and public-drawing results.
- [ ] Do not commit or push until the user explicitly requests the resulting branch to be published.
