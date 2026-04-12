# ESVA — Electrical Search Vertical AI

## 판단 체계 (Judgment Framework)
- 신규 코드 생성 시: `/first-production-judgment` 스킬 적용 (4-GATE: Intent→Contract→Minimal→Simulation)
- 기존 코드 수정 시: `/multi-agent-judgment-v2` 스킬 적용 (Builder→Critic→Arbiter 2-Pass)

## NOA Unified Stack v2.1
9개 스킬 단일 파이프라인 (noa-unified-anti-sycophancy-stack v2.1):
- MODULE 1: noa-code-structure (PART 구조 강제)
- MODULE 2: noa-3persona-inspection (3관점 검사)
- MODULE 3: noa-confidence-gate (확신도 게이트)
- MODULE 6: noa-repair-strategy (수리 에스컬레이션)
- MODULE 8: noa-anti-repeat (반복 금지)
- MODULE 9: noa-response-tuner (응답 튜닝)
+ first-production-judgment (신규 코드 4-GATE)
+ multi-agent-judgment-v2 (리웍 Builder/Critic)
- ARI Circuit Breaker: 모든 AI 호출에 적용 (EMA 감점, 자동 failover)
- Scope Policy: Global > Workspace > Module 정책 우선순위

The Engineer's Search Engine — Electrical Vertical AI for professionals.

## Persona — 수석 검토 엔지니어

ESVA의 AI는 **30년 경력 수석 전기 엔지니어(Chief Principal Electrical Engineer)** 페르소나로 응답합니다.
- 발송배전기술사 + 건축전기설비기술사 보유 수준의 기술적 권위
- Cold & Professional 어조 — 추측/인사말/감정 표현 금지
- 설계 검토 시 **Engineering Review Report** 5단계 포맷 강제
  (Issue Analysis → Applicable Codes → Technical Verification → Conclusion → Pending RFI)
- 규격 위반 발견 시 즉각 Reject + 사유 명시
- 누락 파라미터는 임의 가정 없이 Hold + RFI 요구

## Project Overview

ESVA is an AI-powered electrical engineering vertical search and verification platform. Multi-model LLM search + deterministic engineering calculators + 4-team agent verification + transparent receipt system.

**Core value proposition:**
- Search electrical standards (KEC 61조, NEC 19조, IEC 10조) with AI-powered context
- 52+ validated engineering calculators (voltage drop, cable sizing, arc flash, etc.)
- 4-Team agent system (계통도/평면도/규정/합의) with debate/consensus protocol
- Every AI answer comes with a verifiable receipt (date-stamped, model-tracked, IPFS-pinned)
- BYOK (Bring Your Own Key) first — users supply their own LLM API keys
- ESVA Verified reports with IDE-style red/yellow/green markings

## Architecture

### 4-Team Agent System (Enhanced)
1. **Orchestrator** (`agent/orchestrator.ts`) — Input classification (SLD/Layout/Text) → team routing → parallel execution → consensus
2. **TEAM-SLD** (`agent/teams/sld-team.ts`) — 계통도 분석: DXF/PDF/Image → topology → calculation chain
3. **TEAM-LAYOUT** (`agent/teams/layout-team.ts`) — 평면도 분석: 배선 경로 → 전선관 → 거리 산출
4. **TEAM-STD** (`agent/teams/standards-team.ts`) — 규정질의: KEC/NEC/IEC 조문 검색 + 판정
5. **TEAM-CONSENSUS** (`agent/teams/consensus-team.ts`) — 합의+출력: 토론 → 마킹 → ESVA Verified 보고서

### Legacy 3-Tier Agent (Still Active)
1. **Main Agent** (`agent/main.ts`) — Text query orchestrator (7개국 키워드, 6단계 라우팅, ARI)
2. **Bridge Agent** (`agent/bridge.ts`) — Parallel sandbox execution (3000ms timeout)
3. **Sandbox Agent** (`agent/sandbox/`) — 17 sandboxes, 6 tools (SEARCH/CALC/STANDARD/TERM/KG/CONVERT)

### Debate Protocol (`agent/debate/`)
- 물리법칙 대조 (V=IR, P=VI) — 0.1% 차이 시 즉시 반려
- 최대 3라운드 토론 → 2/3 합의 or 보수적 채택
- HITL 에스컬레이션 (합의 실패 시)

### Vision Pipeline (`agent/vision/`)
- VRAM 분할 병렬 비전 (N×N 그리드 → 중복 제거)
- VLM 실호출 (Gemini 2.5 Flash / GPT-4.1 Vision) — BYOK
- 150+ 전기 심볼 DB (CAD 블록명 → 표준 타입)

### Key Patterns
- **BYOK-first**: Users provide their own API keys. ESVA never stores keys server-side beyond the session.
- **Receipt transparency**: Every AI response generates a receipt with: timestamp, model, token count, confidence, sources. Optionally IPFS-pinned.
- **Sandbox isolation**: All calculator logic runs in sandboxed pure functions. No network access.
- **Guardrails**: 9 blocking rules + 11 system prompt rules + arc flash/motor starting estimation ban

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Auth | Firebase Auth |
| Database | Supabase (PostgreSQL + Edge Functions) |
| Payments | Stripe |
| AI SDK | Vercel AI SDK (multi-provider) |
| State | Zustand + React Query |
| Vector DB | Weaviate (+ local fallback) |
| Deploy | Vercel |

## AI Models (2026-Q2)

| Provider | Models |
|----------|--------|
| Google | Gemini 2.5 Pro, 2.5 Flash, 2.5 Flash Lite |
| OpenAI | GPT-4.1, 4.1 Mini, 4.1 Nano, o4-mini |
| Anthropic | Claude Opus 4, Sonnet 4, Haiku 4.5 |
| Groq | Llama 4 Maverick/Scout, Llama 3.3 70B |
| Mistral | Large, Small, Codestral |
| Ollama | Llama 4, Gemma 3, Qwen 3, Mistral Small 3.1 |

## File Structure

```
src/
  app/               — Next.js App Router pages (13 pages) and API routes (27 endpoints, incl. /openapi, /team-review)
  agent/
    main.ts          — Legacy text query orchestrator
    bridge.ts        — Parallel sandbox coordinator
    pipeline.ts      — 5-stage DAG (EXTRACT→LOOKUP→CALCULATE→VERIFY→REPORT)
    guardrails.ts    — 9 blocking rules
    orchestrator.ts  — 4-Team enhanced orchestrator
    teams/           — 4 team agents (SLD, Layout, Standards, Consensus)
    debate/          — Debate protocol + physics law validation
    vision/          — VRAM splitter + VLM client + 150+ symbol DB
    sandbox/         — 17 isolated sandboxes
  engine/
    constants/       — 170+ electrical constants (resistivity, IEEE 1584, PPE, KEC/NEC/IEC thresholds)
    calculators/     — 52 pure-function calculators (±0.01% accuracy) + plugin-registry.ts
    standards/
      kec/           — 61 KEC articles + condition tree DSL
      nec/           — 19 NEC 2023 articles
      iec/           — 10 IEC 60364 articles
      registry.ts    — Multi-country standard registry (90 articles total)
    topology/        — BFS graph + DXF/PDF vector parsers
    verification/    — Audit engine + quality checklist + gen-verify-fix + multi-team review
    chain/           — Calc chain executor + standard comparator + design review
    receipt/         — Receipt generator + SHA-256 hash + disclaimer
    llm/             — 22 LLM tools + system prompt (3 languages) + output filter
  search/            — Search logic, embedding, ranking (EngRank)
  components/        — React components (ESVALogo, ESVAVerifiedBadge, VerificationReport, Header, etc.)
  contexts/          — React context providers (Auth, Settings)
  hooks/             — Custom React hooks
  lib/
    api/             — withApiHandler (central error boundary) + performance middleware
    ai/              — AI provider re-exports
    auth/            — Firebase auth helpers
    security/        — sanitizeInput, fetchUrlGuard, rate-limit
    db/              — Supabase client + report-store
    ...              — ARI engine, weaviate-client, logger, etc.
  data/
    iec-60050/       — 250+ electrical terms (4 languages)
    synonyms/        — 200+ abbreviation mappings
    standards/       — Standard reference database
    ampacity-tables/ — KEC/NEC ampacity lookup tables
    unit-prices/     — 40 material + 10 labor cost entries
    standard-drawings/ — 5 standard drawing templates + pattern matching
  types/             — TypeScript type definitions
  services/          — Server-side AI providers (streaming + structured output)
  crawlers/          — KEC/IEC/News crawl pipeline
```

## Development Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm test             # All tests (22 suites)
npm run test:watch   # Watch mode
npm run test:calc    # Calculator accuracy tests only
```

## Testing

Calculator tests enforce **accuracy within +/-0.01%** of reference values. 22 test suites covering:
- 8 calculator test files (voltage-drop, cable-sizing, short-circuit, transformer, grounding, solar, power, arc-flash)
- 4 standard test files (kec-dsl, nec-articles, iec-articles, debate-protocol)
- 4 LLM test files (intent-parser, output-filter, judge, source-tracker)
- 6 lib/search test files (rate-limit, safety-policies, api-helpers, query-parser)

## Conventions

- **Korean comments for domain logic**: Electrical engineering domain code uses Korean comments
- **English for infrastructure**: Framework code, CI/CD, deployment configs use English
- **Error codes**: Use ESA-XXXX format (see `src/data/error-codes.ts`)
- **Calculator functions**: Pure functions, no side effects, all inputs validated at boundary
- **Type safety**: Strict TypeScript. No `any` except in third-party type bridges.
- **Imports**: Absolute imports from `@/` (maps to `src/`)
- **Security**: `sanitizeInput()` on all user-facing API inputs. `assertUrlAllowedForFetch()` on external URLs.
- **Memory**: All in-memory Maps must have size limits (MAX_ENTRIES) and periodic cleanup.

## Error Code Ranges

| Range | Category |
|-------|----------|
| ESA-1xxx | Auth/Permission |
| ESA-2xxx | Plan/Limit |
| ESA-3xxx | Search |
| ESA-4xxx | Calculation |
| ESA-5xxx | Export |
| ESA-6xxx | External Services (LLM/IPFS) |
| ESA-7xxx | Standard Conversion |
| ESA-9xxx | System |

## Data Layer

- `electrical-terms.ts` — 250+ IEC 60050 terms with ko/en/ja/zh translations
- `electrical-synonyms.ts` — 200+ abbreviation-to-full-name mappings
- `standard-refs.ts` — 28+ standard references (KEC 20, NEC 5, IEC 3) with license-type aware display
- `unit-price-db.ts` — 40 material prices + 10 labor costs (2024 KRW)
- `standard-drawing-db.ts` — 5 standard drawing templates with pattern matching
- `error-codes.ts` — Structured error codes with bilingual messages

## API Documentation

- **OpenAPI spec**: `GET /api/openapi` — self-documenting OpenAPI 3.1 schema
- **Health check**: `GET /api/health` — dependency dashboard (Supabase/Weaviate/AI providers)
- **All routes use** `withApiHandler()` pattern for consistent error shape: `{ success, data/error }`
- **Performance headers**: `X-Response-Time`, `Server-Timing` on all responses

## Professional Engineering

- **Disclaimer**: Every calculation includes PE-grade disclaimer (`engine/constants/disclaimer.ts`)
- **Uncertainty**: Each calculator type has documented tolerance range (2~30%)
- **PE Review**: Safety-critical calculations (arc-flash, short-circuit, grounding) flagged as requiring PE review
- **Constants**: All electrical engineering constants centralized in `engine/constants/electrical.ts` — no magic numbers

## Important Notes

- Never hardcode API keys. Always use environment variables or BYOK flow.
- Calculator outputs must include units and reference standard clause.
- All date references in standard lookups must include edition year.
- Receipt CIDs are content-addressed — same input = same CID (idempotent).
- Arc flash / motor starting current / transient estimation is forbidden without tools (system prompt rule 11).
- In-memory Maps (tokenUsage, rateLimit, ariStates) must have MAX_ENTRIES and cleanup.
- Use `withApiHandler()` for new API routes. Do not write manual try-catch + CORS + rate-limit.
- Use constants from `@/engine/constants/electrical` instead of inline magic numbers.
