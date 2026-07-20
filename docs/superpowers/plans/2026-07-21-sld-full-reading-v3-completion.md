# SLD Full Reading V3 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계 정본 `2026-07-21-sld-full-reading-proposal-95-design.md`의 §1–15와 FR-AC-01~15를 실제 PDF·이미지·DXF 입력, 작업 API, 보고서 UI, 평가기와 CI 게이트까지 연결한다.

**Architecture:** 입력 바이트는 `drawing-source`가 페이지별 원본 좌표 PNG와 벡터 정보를 준비하고, 오케스트레이터는 전체 페이지 조사 후 모든 예정 구획을 실제 crop하여 역할별 독립 호출을 수행한다. 결과는 런타임 검증 후 증거 그래프에 합산하고, 사용자 교정은 동일한 결정론적 파생 파이프를 다시 실행한다. 95% 평가는 production 예측과 고정 라벨을 공간 일대일 매칭하여 계산하며, 서명된 다층 suite 영수증과 production fingerprint가 모두 맞을 때만 활성화한다.

**Tech Stack:** Next.js 16 Route Handlers, React 19, TypeScript 5.9, Jest 30, Sharp 0.34, pdfjs-dist 6.1, @napi-rs/canvas 1.0.2, dxf-parser 1.1.

## Global Constraints

- 생성형 업스케일을 사용하지 않는다. 원본 좌표가 정본이며 모든 변형은 역변환을 가진다.
- 전체 페이지와 모든 예정 구획 lifecycle이 끝나고 필수 역할 성공 증거가 있을 때만 `COMPLETE`다.
- 역할 호출 실패를 다른 역할 또는 종합 VLM 출력으로 대체하지 않는다.
- 원본 파일 바이트는 보고서 JSON·로그·Git에 저장하지 않는다.
- 외부 공급자 호출은 provider별 키 결박, 45초 timeout, 출력 크기 제한, 런타임 스키마 검증을 적용한다.
- 사용자 작업은 인증된 owner ID에 결박하고 조회·교정·취소·재개에서 소유권을 검사한다.
- 95%는 평균이 아니라 모든 필수 지표와 모든 데이터셋 층의 최소값으로 판정한다.

---

### Task 1: Source Preparation and Physical Crops (§1, §3, §7)

**Files:**
- Create: `src/agent/drawing/drawing-source.ts`
- Modify: `src/agent/vision/image-quality.ts`
- Modify: `src/agent/vision/image-variants.ts`
- Modify: `src/agent/vision/adaptive-regions.ts`
- Test: `src/agent/drawing/__tests__/drawing-source.test.ts`
- Test: `src/agent/vision/__tests__/adaptive-regions.test.ts`

**Interfaces:**
- Produces: `prepareDrawingSource(input): Promise<PreparedDrawingSource>`
- Produces: `cropPreparedRegion(page, region, kind): Promise<ImageVariant>`
- `PreparedPage` includes `pageIndex`, `width`, `height`, `renderMode`, `drawingKind`, `textSample`, `renderHash`, `imageBuffer?`, `vectorAnalysis?`.

- [ ] Write failing tests proving image dimensions are measured, PDF pages are enumerated/rendered, four dense quadrants are created, and distinct regions contain distinct pixels.
- [ ] Run the focused tests and confirm failures are caused by the missing source-preparation API.
- [ ] Implement image normalization, PDF page enumeration/rendering, DXF virtual-canvas normalization, pixel-derived quality profiling, bounded non-generative variants, and arbitrary-region crop.
- [ ] Run the focused tests and `npx tsc --noEmit`.

### Task 2: Independent Role Calls and OCR Adjudication (§2, §4)

**Files:**
- Create: `src/agent/drawing/role-schemas.ts`
- Modify: `src/agent/drawing/role-prompts.ts`
- Modify: `src/agent/drawing/role-runner.ts`
- Modify: `src/agent/drawing/ocr-adjudicator.ts`
- Modify: `src/agent/drawing/types-v3.ts`
- Test: `src/agent/drawing/__tests__/role-runner.test.ts`
- Test: `src/agent/drawing/__tests__/ocr-adjudicator.test.ts`

**Interfaces:**
- Produces: `parseRoleOutput(role, value): RolePayload` that rejects malformed coordinates, paths and invented role fields.
- `runRoleCall` returns `success:false` for timeout, invalid JSON or schema mismatch and never falls back to a mega-prompt.
- `adjudicateOcr` confirms only three distinct variant IDs and call IDs from the same source bounds.

- [ ] Write failing timeout, invalid-schema, prompt-injection and false-majority tests.
- [ ] Run focused tests and confirm the expected failures.
- [ ] Implement provider allowlists, provider-key binding contract, AbortSignal timeout, bounded response parsing, untrusted-image instructions, role schemas and strict OCR provenance.
- [ ] Run focused tests and typecheck.

### Task 3: Coverage, Evidence Graph and Numbering (§1, §5, §6)

**Files:**
- Modify: `src/agent/drawing/coverage-ledger.ts`
- Modify: `src/agent/drawing/evidence-deduplicator.ts`
- Modify: `src/agent/drawing/count-register.ts`
- Modify: `src/agent/drawing/types-v3.ts`
- Test: `src/agent/drawing/__tests__/coverage-ledger.test.ts`
- Test: `src/agent/drawing/__tests__/evidence-deduplicator.test.ts`
- Test: `src/agent/drawing/__tests__/count-register.test.ts`

**Interfaces:**
- Every region stores required-role outcomes, attempts and source bounds.
- Stable IDs derive from document hash, page, entity kind and quantized source geometry; display IDs sort by page and coordinates.
- Deduplication retains all corroborating evidence and rejects incompatible overlap matches.

- [ ] Write failing tests for missing roles, failed-role overwrite, boundary duplicate retention, stable display ordering and type-scoped missing counts.
- [ ] Implement the minimum deterministic ledger, stable-ID and count behavior.
- [ ] Run focused tests and typecheck.

### Task 4: Full Document Orchestration, Budget and Resume (§7)

**Files:**
- Rewrite: `src/agent/drawing/document-orchestrator.ts`
- Modify: `src/agent/drawing/drawing-job-store.ts`
- Modify: `src/agent/drawing/source-lease-store.ts`
- Test: `src/agent/drawing/__tests__/document-orchestrator.test.ts`
- Test: `src/agent/drawing/__tests__/drawing-job-store.test.ts`

**Interfaces:**
- `runDocumentAnalysis` consumes a prepared source, runs full-page survey plus every planned crop, performs at most two targeted rescans, and never synthesizes successful role receipts.
- Page snapshots persist page-local evidence with document/render/model/prompt/preprocess/graph fingerprints; reuse restores the snapshot rather than only skipping work.
- Job operations require `ownerId`; cancellation is observed between calls and leases are released on completion/cancel/expiry.

- [ ] Write failing tests for all-region execution, budget PARTIAL, role failure PARTIAL, cancellation, snapshot restore and mismatched-fingerprint rejection.
- [ ] Implement orchestration with bounded calls and actual rescan targets.
- [ ] Run focused tests and typecheck.

### Task 5: Cross-page Graph, Calculations and Recommendations (§8, §9)

**Files:**
- Modify: `src/agent/drawing/cross-page-graph.ts`
- Create: `src/agent/drawing/drawing-calculations.ts`
- Modify: `src/agent/drawing/recommendation-engine.ts`
- Test: `src/agent/drawing/__tests__/cross-page-graph.test.ts`
- Test: `src/agent/drawing/__tests__/drawing-calculations.test.ts`
- Test: `src/agent/drawing/__tests__/recommendation-engine.test.ts`

**Interfaces:**
- Cross-page confirmation requires an explicit reference plus compatible device type, voltage domain and direction; label-only remains candidate.
- Calculations are emitted only from normalized confirmed rated values and existing calculator functions, with receipt hashes.
- `SUPPORTED` requires evidence plus calculation or versioned rule; absence claims require complete relevant coverage.

- [ ] Write failing false-merge, wrong-direction, missing-input and unsupported-recommendation tests.
- [ ] Implement deterministic relation reconciliation, calculation receipts and fail-closed recommendations.
- [ ] Run focused tests and typecheck.

### Task 6: Corrections and Derived Recalculation (§4.2, §10, §12)

**Files:**
- Create: `src/agent/drawing/recompute-document.ts`
- Modify: `src/app/api/drawing-jobs/[jobId]/corrections/route.ts`
- Test: `src/agent/drawing/__tests__/recompute-document.test.ts`
- Test: `src/app/api/drawing-jobs/__tests__/corrections-route.test.ts`

**Interfaces:**
- `applyDocumentCorrection(document, correctionInput)` validates candidate membership, resolves matching unresolved items, rebuilds relations/counts/rated values/calculations/recommendations/verification, and records before/after summaries.
- Correction requests use authenticated owner identity, optimistic `updatedAt` comparison and idempotency key.

- [ ] Write failing tests for invalid candidates, stale writes, owner mismatch and derived-result refresh.
- [ ] Implement correction transaction and deterministic recomputation.
- [ ] Run route and engine tests plus typecheck.

### Task 7: Secure Job API and Current UI Surface (§7, §10, §13)

**Files:**
- Modify: `src/app/api/drawing-jobs/route.ts`
- Create: `src/app/api/drawing-jobs/[jobId]/route.ts`
- Create: `src/app/api/drawing-jobs/[jobId]/cancel/route.ts`
- Modify: `src/app/(with-nav)/tools/sld/page.tsx`
- Modify: `src/components/DrawingEvidenceOverlay.tsx`
- Modify: `src/components/DrawingIntelligenceReport.tsx`
- Test: `src/app/api/drawing-jobs/__tests__/route.test.ts`
- Test: `src/components/__tests__/drawing-intelligence-report.test.tsx`

**Interfaces:**
- POST validates authentication, origin, magic bytes, MIME, page policy, numeric budgets and exact provider-key pairing before queueing.
- GET/cancel/correction require the same owner and return `private, no-store`.
- UI polls queued jobs, supports cancel/retry/page navigation, displays original image or vector canvas with symbol/line/text/relation overlays, and exposes loading/empty/error/partial states.

- [ ] Write failing API boundary and UI state/navigation tests.
- [ ] Implement secure routes and current `/tools/sld` production callers.
- [ ] Run route/component tests, typecheck and targeted lint.

### Task 8: Spatial Evaluator, Signed Suite Receipt and Gate (§11, §14, §15)

**Files:**
- Rewrite: `src/agent/drawing/sld-evaluator-v2.ts`
- Modify: `src/agent/drawing/sld-benchmark-runner.ts`
- Rewrite: `scripts/sld-golden-gate.mjs`
- Create: `src/agent/drawing/__tests__/sld-evaluator-v2.test.ts`
- Create: `src/agent/drawing/__tests__/verified95.test.ts`
- Create: `scripts/__tests__/sld-golden-gate.test.ts`

**Interfaces:**
- Symbols/texts use page-scoped one-to-one spatial matching; edges use matched endpoint IDs; junctions, cross-page pairs and logic findings are compared by identity, never count-only.
- Suite aggregation requires the configured strata and three repetitions per provider/model; every metric must meet threshold and unsourced PASS must be zero.
- Receipt signature is mandatory, verified with timing-safe comparison, covers dataset/labels/predictions/fingerprints/strata/metrics/time, and expires on any production fingerprint change.
- Gate recomputes or cryptographically verifies trusted receipts; it never trusts `passesAllThresholds` from arbitrary JSON.

- [ ] Write adversarial failing tests for duplicate symbols, shifted boxes, wrong cross-page pairs, hardcoded logic/junction scores, forged booleans/signatures, missing strata and stale fingerprints.
- [ ] Implement matcher, suite aggregation, signature verification and gate.
- [ ] Run evaluator/gate tests and typecheck.

### Task 9: Full Verification and Traceability

**Files:**
- Modify: `docs/superpowers/specs/2026-07-21-sld-full-reading-proposal-95-design.md`
- Modify: `docs/project/IMPLEMENTATION_MAP.md` only if the final diff crosses the project handoff threshold.

- [ ] Map FR-AC-01~15 to exact test names and production callers.
- [ ] Run `npm run test:drawing-v3` without output filtering.
- [ ] Run `npm test -- --runInBand` without output filtering.
- [ ] Run `npx tsc --noEmit` and targeted ESLint without warnings.
- [ ] Run `npm run build`.
- [ ] Run golden gate and report `Not Yet` rather than PASS when signed real-field strata are absent.
- [ ] Run zero-caller and source-byte leakage checks, then exercise the current `/tools/sld` route through upload → poll → report → correction → reload.

