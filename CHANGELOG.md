# Changelog

All notable changes to ESVA are documented in this file.

## [Unreleased]

### Security
- **시크릿 커밋 차단 훅** — `.githooks/pre-commit`. 이 저장소는 공개이고 `.env.example`
  은 추적 대상이라 `git add -A` 한 번이면 로컬 값이 공개된다. 이름이 시크릿인 변수에
  값이 붙은 `.env*` 와, 알려진 시크릿 형태가 추가된 줄을 차단한다. 차단 메시지에 값을
  출력하지 않는다. **클론마다 `git config core.hooksPath .githooks` 를 한 번 실행해야
  켜진다**(CONTRIBUTING 참조). 훅이 실제로 발화하는지는
  `scripts/__tests__/pre-commit-hook.test.ts` 가 임시 저장소에서 실행해 검증한다.

### Fixed
- **아크플래시 입사 에너지 단위** — IEEE 1584-2002 식 (5) 의 결과는 J/cm² 인데
  `cal/cm²` 라벨을 달고 cal 기준 PPE 표와 대조했다. 전 구간 4.184 배 과대였고,
  480V·20kA·0.2s(교과서 예제)가 "작업 금지" 로 판정됐다.
- **아크플래시 중고압 과소평가** — 거리 지수가 전압과 무관하게 1.641(저압 MCC 행)
  이었고 전극 간격도 저압 기본값을 썼다. 13.8kV 에서 **덜 안전한 방향**으로 어긋났다.
  2002 Table 4 를 전압대·기기 종류별로 넣고 `equipmentClass` 입력을 열었다.
- **NFPA 70E 표 선정** — 입사 에너지 분석 결과로 130.7(C)(15)(c) 의 등급을 지정하는
  것은 표준이 허용하지 않는다. 정본 Table 130.5(G)(최소 내아크 정격)로 바꿨다.
- **밀폐공간 인식 누락** — 정규식의 캡처 그룹 오류로 `정화조`·`침전조`·`집수정` 이
  밀폐공간으로 인식되지 않아 산소·가스·환기·감시인 항목이 전부 빠졌다.
- **우천·온도 인식** — `폭우`·`소나기`·`장마` 가 우천이 아니었고, `영하 40도` 가
  폭염으로, `체감온도 100도` 가 안전으로, `35도 각도` 가 폭염으로 판정됐다.
- **자정을 넘기는 작업 일정** — `22시~06시` 의 소요 시간이 0 으로 뭉개져 2 시간 주기
  가스 재측정이 사라졌다. 체크포인트 정렬도 벽시계 순이라 종료 확인이 맨 위에 왔다.
- **출력 필터 우회** — 성공한 계산기 태그 옆 ±200 자의 모든 수치가 근거 없이
  통과했다. 계산기 태그의 근접 승인을 없앴다(실출력은 신뢰 입력으로 이미 통과한다).
  소문자·id 생략 태그도 막고, 돌지 않은 계산기를 댄 태그는 기록한다.
- **오류 분류** — 계산 경로의 거부를 422 로 옮기면서 내부 불변식(우리 표의 구멍)까지
  422 로 바꿔 경보를 죽였다. 되돌리고 조합 커버리지 게이트를 뒀다. 라우트가
  `error.field` 를 버려 화면이 어느 칸도 짚지 못하던 것도 배선했다.
- **표 조회 오류 흡수** — 허용전류표가 깨져도 HTTP 200 으로 "요구 전류를 만족하는
  규격이 없습니다" 가 나갔다. 도메인적으로 거짓인 문장이다.
- **답변 채택 데드락** — 잠금 순서가 답변 → 질문이라 질문 작성자의 더블클릭으로
  순환 대기가 났다(마이그레이션 008).

### Changed
- `ENGINE_VERSION` 0.1.0 → **0.2.0**. KEC PVC 최고허용온도 수리로 표 밖 온도의
  보정계수가 달라졌다. 옛 판 영수증은 재실행이 안 되므로 내보내기 검증이
  `ENGINE_VERSION_DRIFT` 로 "우리가 식을 바꿨다" 와 "영수증이 위조다" 를 구분한다.
- `GET /api/openapi` 의 `/calculate` 응답 목록에 실제로 나가는 상태(401·403·422·429·500)를
  선언했다. 라우트 소스와 선언을 대조하는 검사를 함께 뒀다.
- 현장 안전 체크리스트에 정전 작업 뒷단계(잔류전하 방전·단락접지·재통전 전 확인)와
  밀폐공간 철수·재진입 구간(인원 점검·출입금지·재진입 조건)을 추가했다.
- 파서가 위험을 인식했는데 다룰 항목이 없으면 **그 사실을 항목으로 고지**한다.
  침묵은 "문제없음" 으로 읽힌다.

### Fixed (이전 배치)
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

### Changed
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
