<p align="center">
  <img src="public/logo.svg" alt="ESVA Logo" width="80" />
</p>

<h1 align="center">ESVA — Electrical Search Vertical AI</h1>

<p align="center">
  <strong>The Engineer's Search Engine</strong> — AI-powered electrical engineering vertical search & verification platform
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#testing">Testing</a> •
  <a href="#api">API</a> •
  <a href="#license">License</a>
</p>

---

## Overview

ESVA is a professional electrical engineering platform that combines multi-model LLM search with deterministic engineering calculators, 4-team agent verification, and transparent receipt system. Built for licensed electrical engineers, designers, and students.

### Key Value Propositions

- **Multi-Standard Search** — KEC (61), NEC (41), IEC (25), JIS (15) = 142+ articles with condition-tree DSL
- **52+ Validated Calculators** — Voltage drop, cable sizing, arc flash, short-circuit, grounding, solar PV, and more (±0.01% accuracy)
- **4-Team Agent System** — SLD/Layout/Standards/Consensus with debate protocol and physics-law validation
- **Receipt Transparency** — Every AI response comes with a verifiable receipt (SHA-256 hash, date-stamped, model-tracked)
- **BYOK (Bring Your Own Key)** — Users supply their own LLM API keys; ESVA never stores keys server-side

---

## Features

### AI-Powered Search
- Multi-model LLM support: Google Gemini 2.5, OpenAI GPT-4.1, Anthropic Claude 4, Groq Llama 4, Mistral, Ollama
- 7-language keyword extraction (KR/EN/JP/ZH/DE/FR/ES)
- EngRank scoring algorithm optimized for electrical engineering context
- Vector search via Weaviate with local fallback

### Engineering Calculators
| Category | Examples |
|----------|---------|
| Power | Voltage drop, power factor correction, demand factor |
| Protection | Short-circuit current, arc flash (IEEE 1584), breaker coordination |
| Wiring | Cable sizing, conduit fill, ampacity derating |
| Grounding | Ground resistance, mesh voltage, touch/step voltage |
| Solar PV | Array sizing, irradiance lookup, inverter matching |
| Transformer | Impedance, tap selection, inrush current |
| Lighting | Lux calculation, zonal cavity, emergency lighting |
| Motor | Full-load current (NEC 430), starting current, protection |

### Standards Compliance
- **KEC 2021** — 61 articles (전기설비기술기준) + 75 extended articles
- **NEC 2023** — 41 articles (National Electrical Code)
- **IEC 60364** — 25 articles (Low-voltage electrical installations)
- **JIS C 0364** — 15 articles (Japanese Industrial Standard)
- Condition-tree DSL for programmatic code evaluation

### 4-Team Agent Architecture
```
Input → Orchestrator → ┬─ TEAM-SLD (계통도 분석)
                        ├─ TEAM-LAYOUT (평면도 분석)
                        ├─ TEAM-STD (규정 질의)
                        └─ TEAM-CONSENSUS (합의 + 보고서)
```
- Physics-law validation (V=IR, P=VI) — 0.1% deviation triggers rejection
- Max 3-round debate → 2/3 consensus or conservative adoption
- HITL escalation on consensus failure

### Vision Pipeline
- DXF/PDF vector parsing for electrical drawings
- VRAM-split parallel vision (N×N grid → deduplication)
- 150+ electrical symbol database (CAD block name → standard type)

### Professional Output
- ESVA Verified badge with IDE-style red/yellow/green markings
- Engineering Review Report format (Issue Analysis → Applicable Codes → Technical Verification → Conclusion → Pending RFI)
- PE-grade disclaimers on all safety-critical calculations
- Receipt with SHA-256 hash and optional IPFS pinning

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Next.js 16 App                │
│              (19 pages, 31 API routes)          │
├─────────────────────────────────────────────────┤
│  Agent Layer                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │Orchestr. │ │ Legacy   │ │ Vision Pipeline  ││
│  │(4-Team)  │ │(Main/    │ │ (DXF/PDF/VLM)    ││
│  │          │ │Bridge/   │ │                  ││
│  │SLD/LAY/  │ │Sandbox)  │ │ 150+ symbols     ││
│  │STD/CON   │ │17 sbox   │ │                  ││
│  └──────────┘ └──────────┘ └──────────────────┘│
├─────────────────────────────────────────────────┤
│  Engine Layer                                   │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐│
│  │Calc(52)│ │Std(142)│ │Topology│ │Receipt   ││
│  │±0.01%  │ │KEC/NEC/│ │BFS     │ │SHA-256   ││
│  │        │ │IEC/JIS │ │Graph   │ │IPFS      ││
│  └────────┘ └────────┘ └────────┘ └──────────┘│
├─────────────────────────────────────────────────┤
│  Data Layer                                     │
│  250+ IEC terms │ 200+ synonyms │ 170+ consts  │
│  Ampacity tables│ Unit prices   │ TCC curves    │
└─────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Installation

```bash
git clone https://github.com/gilheumpark-bit/ESA.git
cd ESA
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
# Firebase Auth
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# AI Providers (BYOK — users can also supply their own)
GOOGLE_AI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Weaviate Vector DB
WEAVIATE_URL=
WEAVIATE_API_KEY=
```

### Development

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm test             # All tests (22 suites, 323 tests)
npm run test:calc    # Calculator accuracy tests only
npm run test:watch   # Watch mode
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 4 |
| Auth | Firebase Auth |
| Database | Supabase (PostgreSQL + Edge Functions) |
| Payments | Stripe |
| AI SDK | Vercel AI SDK (multi-provider) |
| State | Zustand + React Query |
| Vector DB | Weaviate (+ local fallback) |
| Deploy | Vercel |

### AI Models Supported (2026-Q2)

| Provider | Models |
|----------|--------|
| Google | Gemini 2.5 Pro, 2.5 Flash, 2.5 Flash Lite |
| OpenAI | GPT-4.1, 4.1 Mini, 4.1 Nano, o4-mini |
| Anthropic | Claude Opus 4, Sonnet 4, Haiku 4.5 |
| Groq | Llama 4 Maverick/Scout, Llama 3.3 70B |
| Mistral | Large, Small, Codestral |
| Ollama | Llama 4, Gemma 3, Qwen 3, Mistral Small 3.1 |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router (19 pages, 31 API routes)
│   ├── (with-nav)/         # Pages with navigation layout
│   │   ├── calc/           # Engineering calculators
│   │   ├── search/         # AI-powered search
│   │   ├── standards/      # Standards browser (KEC/NEC/IEC/JIS)
│   │   ├── glossary/       # IEC 60050 electrical terms
│   │   ├── compare/        # Multi-model comparison
│   │   ├── dashboard/      # User dashboard
│   │   └── ...             # 12 more pages
│   └── api/                # API routes
│       ├── search/         # Search endpoints
│       ├── calculate/      # Calculator endpoints
│       ├── team-review/    # 4-team agent review
│       ├── health/         # Dependency health check
│       ├── openapi/        # Self-documenting OpenAPI 3.1
│       └── ...             # 26 more endpoints
├── agent/                  # AI Agent system
│   ├── orchestrator.ts     # 4-Team enhanced orchestrator
│   ├── teams/              # SLD, Layout, Standards, Consensus
│   ├── debate/             # Debate protocol + physics validation
│   ├── vision/             # VRAM splitter + VLM + symbol DB
│   ├── main.ts             # Legacy text query orchestrator
│   ├── bridge.ts           # Parallel sandbox coordinator
│   ├── sandbox/            # 17 isolated sandboxes
│   ├── pipeline.ts         # 5-stage DAG pipeline
│   └── guardrails.ts       # 9 blocking rules
├── engine/                 # Core engineering engine
│   ├── calculators/        # 52+ pure-function calculators
│   ├── standards/          # KEC/NEC/IEC/JIS condition-tree DSL
│   ├── constants/          # 170+ electrical constants
│   ├── topology/           # BFS graph + DXF/PDF parsers
│   ├── verification/       # Audit engine + quality checklist
│   ├── receipt/            # Receipt generator + SHA-256
│   └── llm/                # 22 LLM tools + system prompts
├── data/                   # Static data
│   ├── iec-60050/          # 250+ electrical terms (4 languages)
│   ├── synonyms/           # 200+ abbreviation mappings
│   ├── ampacity-tables/    # KEC/NEC ampacity lookup tables
│   └── ...                 # Unit prices, TCC, certifications
├── components/             # React components (26+)
├── lib/                    # Shared utilities
│   ├── security/           # Input sanitization, rate limiting
│   ├── api/                # withApiHandler, performance middleware
│   └── ai/                 # AI provider re-exports
└── services/               # Server-side AI providers
```

---

## Testing

22 test suites with 323 tests. Calculator tests enforce **±0.01% accuracy** against reference values.

```bash
npm test                # Run all tests
npm run test:calc       # Calculator accuracy tests only
npm run test:watch      # Watch mode
```

| Category | Suites | Coverage |
|----------|--------|----------|
| Calculators | 8 | Voltage drop, cable sizing, short-circuit, transformer, grounding, solar, power, arc flash |
| Standards | 4 | KEC DSL, NEC articles, IEC articles, debate protocol |
| LLM | 4 | Intent parser, output filter, judge, source tracker |
| Lib/Search | 6 | Rate limit, safety policies, API helpers, query parser |

---

## API

### Self-Documenting

```
GET /api/openapi     # OpenAPI 3.1 schema
GET /api/health      # Dependency health dashboard
```

### All routes use `withApiHandler()` for consistent response shape:

```json
{
  "success": true,
  "data": { ... }
}
```

```json
{
  "success": false,
  "error": {
    "code": "ESA-3001",
    "message": "Search query too short"
  }
}
```

### Performance headers on all responses:
- `X-Response-Time`
- `Server-Timing`

### Error Code Ranges

| Range | Category |
|-------|----------|
| ESA-1xxx | Auth/Permission |
| ESA-2xxx | Plan/Limit |
| ESA-3xxx | Search |
| ESA-4xxx | Calculation |
| ESA-5xxx | Export |
| ESA-6xxx | External Services |
| ESA-7xxx | Standard Conversion |
| ESA-9xxx | System |

---

## Security

- `sanitizeInput()` on all user-facing API inputs
- `assertUrlAllowedForFetch()` on external URLs
- AES-GCM encryption for BYOK API keys (session-scoped)
- Rate limiting with sliding window
- 9 guardrail blocking rules + 11 system prompt rules
- In-memory Maps with `MAX_ENTRIES` and periodic cleanup
- No API keys stored server-side

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built for electrical engineers, by engineers.<br/>
  <strong>ESVA</strong> — The Engineer's Search Engine
</p>
