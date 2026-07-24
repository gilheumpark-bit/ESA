# Changelog

All notable changes to ESVA are documented in this file.

## [Unreleased]

### Fixed
- **도면 제안 계층의 근거 결박 결함 3건** — (1) 차단기 정격 보류 판정이 기기별로 결박한 계산을 구해놓고 실제 게이트는 문서 전역 `some()`을 썼다. 도면 어딘가에 부하전류 계산이 하나만 있으면 근거가 전혀 없는 다른 모든 차단기의 보류 소견이 사라졌다 — 주의를 누락하는 방향이었다. 기기 근거에 결박된 계산만 인정하도록 고쳤다. (2) `confirmedType`은 선택 필드라 `certainty: 'confirmed'`인 기호도 종류가 비어 있을 수 있고, 그때 분류가 `typeCandidates[0]`(확정 안 된 1순위 추측)으로 내려갔다. 그 추측이 `critical` 소견("보호기 미확인")의 입력이므로, 소견은 남기되 SUPPORTED로 확정하지 않고 HOLD로 두며 `기기 종류 확정`을 필요 입력으로 제시한다. (3) `standardRefs`에 아무 문자열이나 들어가도 SUPPORTED 승인 근거로 인정됐다. `'KEC 접지'` 같은 자유 문구는 조항 번호가 아니라 사용자가 원문을 찾아갈 수 없다. `ESA-SLD-RULE:*` 내부 규칙 식별자이거나 인용 레지스트리에서 해석되는 실제 조항일 때만 인정하고, 기존 자유 문구 2건을 내부 규칙 ID로 교체했다.
- **근거 없는 PASS가 나가던 경로 차단(BLOCK 배선)** — 범용 조건 트리 평가기는 `article.conditions`를 순회해 판정하는데, 조건이 0개면 루프가 한 번도 돌지 않아 `hasFail=false`로 남고 `matchedConditions`·`notes`가 전부 빈 채 **어떤 입력에도 PASS**가 나갔다. `Verdict`에 `BLOCK`("근거 없는 판정")이 정의돼 있고 `makeBlock` 헬퍼까지 만들어져 있었으나 호출처가 0이었다. 자리표시자 임계값(`value: 0`)은 `evaluator-guard`가 이미 HOLD로 막고 있었지만 조건 자체가 없는 경우는 뚫려 있었다. 입력 부족(HOLD)이 아니라 조항이 판정 근거를 갖고 있지 않은 경우이므로 BLOCK으로 차단한다.
- **전압강하 조항 인용 불일치(9곳)** — 계산기 계층은 `KEC 232.51`, 기준서 엔진·전문팀·전체 테스트는 `KEC 232.52`로 갈라져 있었다. 같은 규칙에 두 번호가 붙어 영수증과 팀 판정이 서로 다른 조항을 가리켰다. 저장소에서 이미 다수인 `232.52`로 정렬했다. 산업통상자원부 공고 원문과의 대조는 아직이며 그 사실을 `UNVERIFIED_AGAINST_ORIGIN`에 남겼다.
- **CI가 어떤 커밋도 검증하지 못하던 결함 2건** — (1) `docs/README.md`가 저장소에서 제외된 `NOA_RULES_v1.2.md`를 링크해 `check:docs`가 exit 1이었고, CI 5단계에서 죽어 tsc·lint·test·build·게이트가 전부 `skipped`였다(최근 30 run 연속 red). (2) `jest.config.ts`는 Jest가 파싱할 때 `ts-node`를 요구하는데 `ts-node`가 package.json·package-lock.json 어디에도 없어 clean install 후 `npm test`가 설정 파싱 단계에서 즉시 실패했다. 링크를 제거하고 설정을 `jest.config.mjs`로 옮겨 두 차단을 해소했다. 테스트의 TypeScript 변환은 그대로 `ts-jest`가 담당한다.
- **부팅 환경변수 검증 미배선** — `lib/env.ts`의 `validateEnv()`가 어디에서도 호출되지 않았다. `instrumentation.ts`의 nodejs 런타임 부팅 경로에 연결했다. 배포를 막지 않고 누락된 키 '이름'만 기록하며 값은 남기지 않는다.
- **AI 계산 경로** — 홈 일반 질문과 Studio 무파일 질문을 공용 `/api/chat` 경로에 연결했다. 완전한 계산 질문은 정본 계산기 레지스트리를 먼저 실행하고 입력·결과 영수증을 모델과 UI에 전달하며, 불완전한 입력은 임의 계산하지 않는다.
- **호환 모델 전송 방식** — Groq, Ollama, LM Studio, 온프레미스 OpenAI 호환 공급자를 Responses API가 아닌 Chat Completions 계약으로 호출한다.
- **채팅 지침 경계** — 클라이언트 `systemPrompt` 신뢰를 제거하고 서버 소유 전기 직무 지침과 사용자 메시지를 분리했다.
- **False compliance (SLD/Layout/Standards)** — Hardcoded `compliant: true` and assumed 100A load removed. Unverified ratings return `compliant: null` (HOLD) with explicit notes; consensus no longer scores HOLD as pass/fail.
- **Receipt 404 path** — Added `GET /api/receipt/[id]` alias (loads calculation receipts); UI path no longer dead.
- **Demo verification report** — Removed demo fallback and `/report/demo` nav link; missing reports show honest empty state. Excel export uses POST `/api/export`.
- **Quality checklist empty PASS** — Required missing params yield `needs-data` (not pass); empty input overall score is 0.
- **Chat unsourced numbers** — Wired `filterLLMOutput` after stream; search chat panel replaces text when filter fails.
- **DXF/PDF when FLAG-OFF** — SLD tabs disabled with reason when `DRAWING_PARSER=false`.
- **SOS honesty** — API/UI state that only in-app log exists (no SMS/email/push).
- **Calculator input-contract drift (57/57 restored)** — `CALCULATOR_PARAMS` (the UI form field names) had drifted from the calculator functions' actual input names. With no rename layer between form → API → calculator, 52 of 57 calculators threw `"<field> ... got undefined"` in production; unit tests missed it because they call the functions directly. Realigned every field name to the calculator contract (verbatim from each interface), fixed silent unit bugs (surge-arrester kV→V 1000× error, power-loss Ω/km·km, ground-resistance rod diameter mm) and enum values. Now 57/57 produce a value + `SourceTag` through the real form path.
- **Rate limiting not actually invoked** — `applyRateLimit` was imported but never called on API routes; wired across routes (note: the Next.js 16 `src/proxy.ts` entry also applies a 60/min gate first, so route-level `default` profiles are redundant — tracked).
- **Safety features**: confined-space returned an empty checklist (risk "low") for hazardous non-confined locations (e.g. 전기실); dead-man switch used `requestAnimationFrame` and froze when the tab backgrounded; SOS state auto-reset within frames; checked safety items were not recorded in the completion receipt (compliance always 0%).
- **Standards judgment**: articles carrying a `value: 0` placeholder threshold auto-PASS'd (`>= 0`) or always-FAIL'd (`<= 0`); now return **HOLD** with the source rule.

### Added
- **AI 계산 실왕복 게이트** — `npm run gate:chat-live`가 production 서버, 정본 전압강하 계산기, 모델 입력 영수증, SSE 표시 순서를 실제 HTTP로 검증한다.
- **SLD 구획 경계 연속성** — `Pxx-A` 논리 구획, `Pxx-C` 경계선, `Pxx-U` 미확정 끝점과 전체 도면 재합성 영수증을 추가했다.
- **문서 정본 지도와 자동 검사** — 현재 정본, 검증 원장, 설계 참고, 역사 기록을 분류하고 로컬 링크·환경 변수 중복을 검사한다.
- **Array-input calculator forms** — `CalculatorForm` gains `type: 'array'` (repeatable rows, `flatten` for primitive arrays); wires the 7 list-input calculators (loads/sections/transformers/emergencyLoads) that a flat form could not express.
- **Dedicated standards evaluators** — breaking-capacity (IEC-434.1/533.1, JIS-434.1) and ampacity (NEC-310.16, IEC-523.1) promoted from HOLD to real judgment; thresholds come only from authoritative tables or measured inputs.
- **AX design** — `/preview/ax` (thread home + answer + mobile, receipt-as-first-class, governance status bar); AX palette + typography (navy + amber, warm paper, IBM Plex Sans KR / Noto Serif KR / IBM Plex Mono) applied app-wide via the token system.
- **Observability** — Sentry instrumentation + client/server/edge configs (DSN-gated, no hardcoded secrets); `SECURITY.md`; `/api/analytics`.
- **Regression guard** — `calculator-params-contract.test.ts` exercises all 57 calculators through the real form-submit path (value + source), preventing contract drift from returning.

### Added
- **인용 정본 레지스트리와 원문 유도** (`engine/standards/citation-registry.ts`) — 이 저장소는 저작권·판본 변경 때문에 기준서 원문 문장을 담지 않는다. 그래서 제품이 내보내는 근거는 조항 번호 하나뿐이고, 대조할 원문이 내부에 없어 번호가 틀려도 잡히지 않았다. 발행기관 16곳의 원문 확보 경로와 인용 허용 조항 72건을 한 곳에 모았다. `createSource`가 호출자가 링크를 주지 않으면 발행기관 원문 경로를 자동으로 붙이므로, 모든 영수증이 원문 확인 경로를 갖는다. 조항 단위 딥링크가 아니라 발행기관 단위인 것은 유료 표준에 조항별 공개 URL이 없기 때문이며, 없는 링크를 지어내지 않는다.
- **인용 무결성 계약 테스트** — production 코드의 `createSource` 인용 126건(고유 71쌍)을 전수로 허용 목록과 대조한다. 목록에 없는 조항을 인용하면 실패하므로 조항 번호가 코드 여기저기서 조용히 갈라지는 것을 커밋 시점에 막는다. 이 계약이 없어서 `232.51`이 9곳에 퍼질 때까지 아무도 잡지 못했다.

### Changed
- **CI를 두 레인으로 분리했다** — `verify`(모든 push·PR: docs·tsc·lint·jest·SLD V3 계약·build)와 `live-gates`(PR·주간 예약·수동 실행: production 서버 기동·`gate:chat-live`·Chromium 설치·`gate:pdf`·Playwright). 브라우저 설치와 서버 기동이 필요한 무거운 게이트가 push마다 돌지 않으므로 Actions 분 소모가 줄고, 같은 ref의 연속 push는 concurrency로 앞선 run을 취소한다.
- **휴면 대장 등재** — `src/lib` 하위에서 정적·동적 import가 모두 0인 모듈 6건(약 1,450줄: `fetch-url-guard`+`security/index`, `env`의 설정 상수, `api-helpers`, `cache`, `chunker`, `error-messages`)을 `docs/DORMANT_MANIFEST.md`에 사유·활성 조건과 함께 등재했다. 대장의 자체 규칙("여기 없는 휴면 모듈 발견 = 대장 위반") 위반 상태를 해소했다.
- `scripts/enforce.ps1`에 `check:docs`를 첫 단계로 추가해 Windows 전체 게이트와 CI가 같은 문서 계약을 확인하게 했다.
- App-wide theme re-mapped to AX: `--color-primary` navy `#1e3a5f`, `--color-accent` amber `#b45309`, warm-paper surfaces, IBM Plex Sans KR body font (light + warm-dark).
- README, 아키텍처, 사용자·API·평가·기여·보안 문서를 현재 production 배선과 검증 경계 기준으로 재구성했다. 고정 페이지·테스트 수와 외부 근거 없는 경쟁 우위·범용 정확도 주장은 제거했다.

### Removed
- Safety copy that promised delivery not yet implemented ("관리자에게 즉시 발송", "자동 신고") — no SMS/push/email channel exists, so the claims were removed until delivery is built.

## [0.2.0] - 2026-04-14

### Added
- **IEC 60364-5-52 Ampacity Tables** — 19 sizes x 6 methods x Cu/Al x PVC/XLPE/EPR (~200+ values)
- **Calculator Thresholds Config** — Centralized 7 hardcoded constants into `calc-thresholds.ts`
- **CompositeCondition DSL** — AND/OR logic for multi-condition article evaluation
- **8 Physics Laws** — V=IR, P=VI, VD%, Q=Ptan(phi), S=P/cos(phi), I^2R, Z=sqrt(R^2+X^2), E=Pt
- **MV/HV Voltage Constants** — 3.3kV through 765kV (11 levels)
- **6 New Standard Drawing Templates** — EV charging, Solar PV, UPS/Emergency, MV switchgear, Data center, total 11
- **12 New Material Prices** — Oil transformers, EV chargers, PV modules, UPS, ESS (56 total)
- **4 New JIS Articles** — Short-circuit, insulation, seismic, medical (18 total)
- **NEC Cross-References** — All 42 articles now have relatedClauses (KEC/IEC/JIS equivalents)
- **7 Page Loading Skeletons** — Dashboard, SLD, OCR, Community, Projects, Settings, History
- **Orchestrator Retry** — Exponential backoff (500ms, 1s) on team dispatch failure
- **VLM Retry + Key Validation** — 2-retry with backoff, API key format checks
- **Server AI Timeout** — 5s timeout guard + multi-provider failover
- **BFS Cache** — Knowledge graph query cache (5-min TTL, 200-entry LRU)
- **Ranking Reasoning** — EngRank now explains why each result ranked high

### Improved
- **Calculator Types** — Added `uncertaintyRange` and `warnings[]` fields
- **Debate Protocol** — Enum-based CALC_TO_PARAM mapping (17 calculators)
- **Safety Policies** — 17 injection patterns (was 8), 16 test cases (was 2)
- **Vision Splitter** — Dynamic image dimension parsing from PNG/JPEG headers
- **Layout Team** — LAYOUT_CONFIG object, 24 cable OD entries, configurable conduit fill
- **Standards Team** — Type-safe param extraction, error logging
- **Sandbox Agent** — Safe array access, dataScope parsing fix
- **Notifications API** — PATCH authentication + rate limiting
- **Admin API** — `isDemo` field for demo data detection
- **Multi-Team Review** — Team score breakdown + top findings/commendations
- **Gen-Verify-Fix** — `convergenceReason` field explaining loop termination
- **Pages** — aria-label/aria-pressed on SLD/Community buttons, search debounce (300ms)

### Fixed
- Standard drawing connection validation bug (was checking extractedTypes[0])
- JIS 523.1 loadCurrent stub (value: 0 placeholder)
- Cable sizing hardcoded `0.08` reactance, `3%` voltage drop
- Short-circuit hardcoded `kPeak = 1.8` (now dynamic per voltage level)

### Stats
- 22 test suites / 336 tests (was 323)
- 245+ standard articles (was 211)
- 56 material prices (was 44)
- 11 drawing templates (was 5)
- E2E: 28 Playwright tests (was 12)

## [0.1.0] - 2026-04-13

### Added
- **4-Team Agent System** — Orchestrator + SLD/Layout/Standards/Consensus teams
- **Debate Protocol** — Physics-law validation (V=IR, P=VI), 3-round consensus, HITL escalation
- **Vision Pipeline** — DXF/PDF vector parsing, VRAM-split parallel vision, 150+ electrical symbol DB
- **52+ Engineering Calculators** — Voltage drop, cable sizing, arc flash (IEEE 1584), short-circuit, grounding, solar PV, transformer, lighting, motor, power factor, demand factor, conduit fill, and more
- **Standards Engine** — KEC (61+75 extended), NEC (41), IEC (25), JIS (15) = 211+ articles in condition-tree DSL
- **Receipt System** — SHA-256 hash, timestamp, model tracking, optional IPFS pinning
- **BYOK System** — AES-GCM encrypted API key storage (session-scoped)
- **5-Stage DAG Pipeline** — EXTRACT → LOOKUP → CALCULATE → VERIFY → REPORT
- **19 Pages** — Search, calculators, standards browser, glossary, comparison, dashboard, projects, receipts, settings, admin, community, and more
- **31 API Endpoints** — Including OpenAPI 3.1 self-documenting spec and health check dashboard
- **Multi-Model LLM Support** — Google Gemini 2.5, OpenAI GPT-4.1, Anthropic Claude 4, Groq Llama 4, Mistral, Ollama
- **170+ Electrical Constants** — Centralized with source references (IEEE 1584, KEC, NEC, IEC)
- **250+ IEC 60050 Terms** — 4-language electrical terminology (KR/EN/JP/ZH)
- **200+ Synonym Mappings** — Abbreviation to full-name
- **ARI Circuit Breaker** — EMA-based automatic failover for LLM providers
- **9 Guardrail Rules** — Blocking rules for safety-critical estimations
- **Chief Principal Engineer Persona** — 30-year experience, Engineering Review Report format
- **22 Test Suites / 323 Tests** — Calculator accuracy ±0.01%, standards DSL, LLM tools
- **PWA Support** — Service Worker + IndexedDB for offline capability
- **Accessibility** — Skip links, ARIA labels, keyboard navigation, focus management
- **Security** — Input sanitization, URL allowlist, rate limiting, BYOK encryption

### Technical
- Next.js 16 (App Router) with Turbopack
- TypeScript strict mode
- Tailwind CSS 4 with `@layer components`
- Firebase Auth + Supabase + Stripe
- Vercel AI SDK (multi-provider)
- Zustand + React Query
- Weaviate vector DB with local fallback
