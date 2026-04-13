# Contributing to ESVA

## Development Setup

```bash
git clone https://github.com/gilheumpark-bit/ESA.git
cd ESA
npm install
npm run dev
```

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code |
| `feat/*` | New features |
| `fix/*` | Bug fixes |
| `docs/*` | Documentation updates |

## Code Conventions

### Language
- **Korean comments** for electrical engineering domain logic
- **English** for infrastructure code, CI/CD, configs

### TypeScript
- Strict mode enabled (`strict: true`)
- No `any` except in documented third-party type bridges
- Absolute imports from `@/` (maps to `src/`)

### Calculator Functions
- Pure functions only — no side effects
- All inputs validated at boundary
- Outputs must include units and reference standard clause
- Accuracy target: ±0.01% of reference values

### API Routes
- Use `withApiHandler()` wrapper — do not write manual try-catch
- Response shape: `{ success: true, data }` or `{ success: false, error: { code, message } }`
- Error codes: `ESA-XXXX` format

### Security
- `sanitizeInput()` on all user-facing inputs
- `assertUrlAllowedForFetch()` on external URLs
- In-memory Maps must have `MAX_ENTRIES` and periodic cleanup
- Never hardcode API keys

### Constants
- Use `@/engine/constants/electrical` — no inline magic numbers
- All electrical constants centralized with source references

## Testing

```bash
npm test             # All 22 suites / 336 tests
npm run test:calc    # Calculator accuracy only
npm run test:watch   # Watch mode
```

- Calculator tests enforce ±0.01% accuracy
- New calculators must include test file with reference values
- Standards tests must validate condition-tree DSL evaluation

## Pull Request Process

1. Create feature branch from `main`
2. Implement changes following conventions above
3. Ensure all tests pass: `npm test`
4. Ensure build succeeds: `npm run build`
5. Ensure lint passes: `npm run lint`
6. Submit PR with clear description of changes

## Standards Data

- **KEC** — Copyright-free per Korean Copyright Act Article 7 (government works)
- **NEC/IEC/JIS** — Self-authored Korean descriptions only. Do not copy English original text.
- All standard articles use condition-tree DSL format

## Commit Message Format

```
type: short description

type = feat | fix | docs | refactor | test | chore
```

Examples:
```
feat: add JIS C 0364 grounding articles
fix: correct voltage drop formula for 3-phase balanced load
docs: update README with API documentation
test: add arc flash calculator accuracy tests
```
