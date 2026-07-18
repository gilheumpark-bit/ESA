# Security Policy — ESVA

## Supported Versions

ESVA is in active development. Security patches apply to the current `main` branch only.

## Reporting a Vulnerability

If you discover a security vulnerability, **do NOT open a public GitHub issue.** Instead:

1. Email the maintainer: `gilheumpark@gmail.com`
2. Include: reproduction steps, affected files (with line numbers), impact assessment, suggested fix.
3. Expect acknowledgment within 5 business days.

## Security Posture

### What ESVA does

- **BYOK (Bring Your Own Key)**: API keys for LLM providers (OpenAI / Claude / Gemini / Groq / Mistral / Ollama) are stored in the client session (sessionStorage / IndexedDB), never on the server.
- **Same-origin enforcement**: Public ingestion endpoints (`/api/error-report`, `/api/analytics`, `/api/vitals`) reject cross-origin requests at the server.
- **Per-IP rate limiting**: Sliding-window limits applied to every API route via `lib/rate-limit.ts` (default: 60/min; tighter limits for `notarize`, `chat`, `ocr`, `sld`).
- **Input sanitization**: All user-controlled strings pass through `sanitizeInput()` (`lib/security-hardening.ts`) before reaching calculators or LLM tools.
- **URL allow-listing**: Outbound fetches use `assertUrlAllowedForFetch()` to block SSRF.
- **CSP headers**: `next.config.ts` sets `Content-Security-Policy` with restricted `script-src` / `connect-src`, plus `X-Frame-Options: DENY` and `Referrer-Policy: strict-origin-when-cross-origin`.

### Known gaps (tracked)

- **Sentry SDK installed but not configured.** `@sentry/nextjs` is a dependency, but no `sentry.*.config.ts` files exist. Currently relies on Vercel runtime logs + custom `lib/api-logger.ts` for stdout structured logging. Action item: either wire Sentry (`sentry.client/server/edge.config.ts` + DSN env var) or remove the dependency.
- **No formal threat model documented.** Architecture-level threat modeling (data-flow / trust-boundary diagrams) has not been written.
- **Receipt integrity is SHA-256 only.** No Ed25519 signing or external timestamping yet (LearningGuard-style anchoring is a candidate; see project docs).

### What ESVA explicitly does NOT do

- Server-side storage of user API keys (BYOK enforced).
- Arc-flash / motor-starting / transient estimation without tool calls (system prompt rule 11 — `engine/llm/system-prompt.ts`).
- LLM-only numeric output (every value must come from a deterministic calculator — `engine/llm/tools.ts`).

## Dependency Hygiene

`npm audit` is expected to run clean (production-only):

```bash
npm audit --omit=dev
```

Any CVE flagged at severity ≥ moderate must be patched before deploy.

## Calculator Trust Boundary

- All 57 calculators (`engine/calculators/`) are **pure functions**: input validation at the boundary (`assertRange`, `assertOneOf`, etc.), no network access, no filesystem access, no global state.
- Calculator errors throw `CalcValidationError` with explicit `ESVA-44xx` error codes for traceability.
- The `/api/calculate` route is the only HTTP surface for calculator execution. Direct imports outside `engine/` are blocked by convention.

## Disclosure Timeline

| Phase | Duration |
|-------|----------|
| Acknowledge report | ≤ 5 business days |
| Investigate + reproduce | ≤ 10 business days |
| Fix in `main` | depends on severity |
| Public disclosure | ≥ 90 days after fix lands, or coordinated with reporter |

---

*Last updated: 2026-05-12 (bug-hunter PHASE 3 audit)*
