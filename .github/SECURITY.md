# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public issue
2. Email the maintainer directly with details
3. Include steps to reproduce if possible

## Security Measures

ESVA implements the following security controls:

- **Input Sanitization** — `sanitizeInput()` on all user-facing API inputs
- **URL Allowlist** — `assertUrlAllowedForFetch()` blocks unauthorized external requests
- **Rate Limiting** — Sliding window rate limiter on all API endpoints
- **BYOK Encryption** — AES-GCM encryption for user API keys (session-scoped, never stored server-side)
- **Memory Limits** — All in-memory Maps have `MAX_ENTRIES` with periodic cleanup
- **Guardrails** — 9 blocking rules prevent unsafe estimations
- **No Server-Side Key Storage** — ESVA never persists user API keys beyond the session

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
