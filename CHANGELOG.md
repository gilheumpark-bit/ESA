# Changelog

All notable changes to ESVA are documented in this file.

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
