// ============================================================
// Calculator Count — Single Source of Truth
// ============================================================
// One canonical number for UI/marketing/docs to import.
// Update here when adding/removing calculators.
//
// Audit (2026-05-12):
//   - 52 `calculate*` exports in index.ts (functions that return DetailedCalcResult)
//   - 57 module .ts files (includes utility helpers like awg-converter, ampacity-compare)
//   - We standardize on the EXPORTED FUNCTIONS count for user-facing numbers,
//     since "calculator" implies a callable engine, not a utility.
// ============================================================

/**
 * Public-facing calculator count.
 *
 * Source: actual entries in `CALCULATOR_REGISTRY` (engine/calculators/index.ts).
 * Counting method: `^      id:\s+'[a-z]` lines = 57 (2026-05-12 audit).
 *
 * Earlier value (52) was derived from `^export { calculate` patterns in
 * index.ts and undercounted by 5 entries that the registry exposes through
 * helper wrappers (e.g., awg-conversion / unit variants).
 * The registry is what `/api/calculate` actually serves, so it is the SoT.
 *
 * When this number changes:
 *   1. Update this constant.
 *   2. Run `npm test` (calculator accuracy tests assume this many engines).
 *   3. Update CLAUDE.md mentions.
 */
export const CALCULATOR_COUNT = 57;

/**
 * Standalone module file count (one `.ts` per category in `engine/calculators/<category>/`).
 * Equals `CALCULATOR_COUNT` after the 2026-05-12 reconciliation — kept as a separate
 * symbol so future drift between registry entries and source files is observable.
 */
export const CALCULATOR_MODULE_COUNT = 57;

// IDENTITY_SEAL: calculators/count | role=SoT for engine count | inputs=none | outputs=numeric constants
