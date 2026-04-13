# ESVA Architecture

## System Overview

ESVA is a 4-layer architecture: **App → Agent → Engine → Data**.

```
User Request
     │
     ▼
┌─────────────────────────────────────────────────┐
│  APP LAYER (Next.js 16)                         │
│  19 pages + 31 API routes + withApiHandler()    │
│  Rate limiting · CORS · Input sanitization      │
└──────────────────┬──────────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
┌─────────┐ ┌───────────┐ ┌──────────┐
│ Search  │ │ Calculate │ │ Review   │
│ /api/   │ │ /api/     │ │ /api/    │
│ search  │ │ calculate │ │ team-    │
│         │ │           │ │ review   │
└────┬────┘ └─────┬─────┘ └────┬─────┘
     │            │             │
     ▼            ▼             ▼
┌─────────────────────────────────────────────────┐
│  AGENT LAYER                                    │
│                                                 │
│  ┌──────────────────────────────┐               │
│  │ Orchestrator (4-Team)        │               │
│  │ classify → route → dispatch  │               │
│  │ + retry (2x, exp. backoff)   │               │
│  └──────┬───────────────────────┘               │
│         │                                       │
│  ┌──────┼──────────────────┐                    │
│  │      │    Team Layer    │                    │
│  │  ┌───┴───┐ ┌─────────┐ │  ┌──────────────┐ │
│  │  │TEAM-  │ │TEAM-    │ │  │Legacy Agent  │ │
│  │  │SLD    │ │LAYOUT   │ │  │(Main/Bridge/ │ │
│  │  └───────┘ └─────────┘ │  │ 17 Sandboxes)│ │
│  │  ┌───────┐ ┌─────────┐ │  └──────────────┘ │
│  │  │TEAM-  │ │TEAM-    │ │                    │
│  │  │STD    │ │CONSENSUS│ │  ┌──────────────┐ │
│  │  └───────┘ └─────────┘ │  │Vision Pipeline│ │
│  └─────────────────────────┘  │DXF/PDF/VLM  │ │
│                               │150+ symbols  │ │
│  ┌──────────────────────┐     └──────────────┘ │
│  │ Debate Protocol      │                      │
│  │ 8 physics laws       │  ┌────────────────┐  │
│  │ 3-round consensus    │  │ Guardrails     │  │
│  │ HITL escalation      │  │ 9 blocking     │  │
│  └──────────────────────┘  │ rules          │  │
│                            └────────────────┘  │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  ENGINE LAYER                                   │
│                                                 │
│  Calculators (56+)  │  Standards (245+)         │
│  ├─ Pure functions   │  ├─ KEC 160+ articles    │
│  ├─ ±0.01% accuracy  │  ├─ NEC 42 articles      │
│  ├─ Sandboxed        │  ├─ IEC 25 articles       │
│  ├─ Uncertainty      │  ├─ JIS 18 articles       │
│  │  range tracking   │  ├─ Condition-tree DSL    │
│  └─ Config-driven    │  └─ AND/OR composite      │
│     thresholds       │     conditions            │
│                      │                           │
│  Verification        │  Receipt                  │
│  ├─ 5-team review    │  ├─ SHA-256 hash          │
│  ├─ Quality checklist│  ├─ IPFS pinning          │
│  ├─ Sensitivity      │  ├─ Model tracking        │
│  ├─ Gen-Verify-Fix   │  └─ PE disclaimer         │
│  └─ Audit engine     │                           │
│                      │                           │
│  Topology            │  LLM Tools               │
│  ├─ BFS graph        │  ├─ 22 tool definitions   │
│  ├─ DXF parser       │  ├─ 3-language prompts    │
│  └─ PDF parser       │  └─ Output filter         │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  DATA LAYER                                     │
│                                                 │
│  Ampacity Tables     │  Electrical Constants    │
│  ├─ KEC (456 values) │  ├─ 170+ constants       │
│  ├─ NEC (162 values) │  ├─ Calc thresholds      │
│  └─ IEC (200+ values)│  ├─ Safety factors (4국)  │
│                      │  └─ MV/HV voltages       │
│  Reference Data      │                          │
│  ├─ 250+ IEC terms   │  External Services       │
│  ├─ 200+ synonyms    │  ├─ Firebase Auth         │
│  ├─ 56 material prices│ ├─ Supabase DB           │
│  ├─ 11 drawing       │  ├─ Weaviate Vector      │
│  │  templates        │  ├─ Stripe Payments       │
│  └─ 58 error codes   │  └─ IPFS (optional)      │
└─────────────────────────────────────────────────┘
```

## Key Design Patterns

### 1. BYOK (Bring Your Own Key)
Users supply their own LLM API keys. Keys are AES-GCM encrypted in the browser session. Server never stores keys. Timeout-guarded resolution with multi-provider failover.

### 2. Sandbox Isolation
All 56+ calculator functions are pure — no side effects, no network access. Inputs validated at boundary with `assertPositive()`, `assertRange()`, `assertOneOf()`. Config-driven thresholds from `calc-thresholds.ts`.

### 3. Receipt Transparency
Every AI response generates a receipt: timestamp, model ID, token count, confidence score, source tags. SHA-256 hash for integrity verification. Optional IPFS pinning for immutability.

### 4. Condition-Tree DSL
Every standard article is modeled as a `CodeArticle` with `Condition[]`. Conditions are `{ param, operator, value, unit, result, note }`. `CompositeCondition` supports AND/OR nesting. Generic evaluator handles 97% of articles automatically.

### 5. ARI Circuit Breaker
Adaptive Reliability Index tracks provider health via EMA smoothing. Automatic failover when a provider's score drops below threshold. Half-open recovery probes.

### 6. 4-Team Debate Protocol
Multiple teams analyze the same input independently. Results compared for disagreements (>0.1% deviation). Physics-law validation (8 laws) rejects violations instantly. Max 3-round debate with 2/3 consensus requirement.

## Directory Map

| Path | Purpose | Key Files |
|------|---------|-----------|
| `src/app/` | Next.js pages + API routes | 19 pages, 31 routes |
| `src/agent/orchestrator.ts` | 4-team dispatch + retry | `dispatchWithRetry()` |
| `src/agent/teams/` | SLD, Layout, Standards, Consensus | 4 team executors |
| `src/agent/debate/` | Physics validation + consensus | 8 laws, 3 rounds |
| `src/agent/vision/` | VLM + splitter + symbol DB | 150+ symbols |
| `src/agent/sandbox/` | 17 isolated sandboxes | 6 tool types |
| `src/engine/calculators/` | 56+ pure functions | `plugin-registry.ts` |
| `src/engine/standards/` | KEC/NEC/IEC/JIS DSL | `registry.ts` |
| `src/engine/constants/` | 170+ constants + thresholds | `electrical.ts`, `calc-thresholds.ts` |
| `src/engine/verification/` | Audit + quality + sensitivity | `multi-team-review.ts` |
| `src/data/` | Static data (terms, prices, tables) | 7 data modules |
| `src/lib/` | Shared utilities | Security, cache, rate limit |
