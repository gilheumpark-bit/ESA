# Changelog

All notable changes to ESVA are documented in this file.

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
