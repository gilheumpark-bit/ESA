/**
 * User Override Tracking
 *
 * Tracks when a user manually overrides a calculated or default value.
 * Overridden results are tagged with [USER_OVERRIDE] and trigger
 * downstream recalculation. Both original and overridden values
 * are preserved for audit trail.
 *
 * PART 1: Types
 * PART 2: Override application
 * PART 3: Override registry (in-memory)
 * PART 4: Downstream recalculation trigger
 */

// ---------------------------------------------------------------------------
// PART 1 — Types
// ---------------------------------------------------------------------------

/** Record of a single parameter override */
export interface OverrideRecord {
  /** Unique override identifier */
  id: string;
  /** Receipt ID this override applies to */
  receiptId: string;
  /** Parameter name that was overridden */
  param: string;
  /** Original calculated/default value */
  originalValue: unknown;
  /** User-provided override value */
  overrideValue: unknown;
  /** ISO-8601 timestamp of the override */
  overriddenAt: string;
  /** Optional reason provided by user */
  reason?: string;
  /** Whether downstream recalculation was triggered */
  recalcTriggered: boolean;
  /** New receipt ID if recalculation produced a new receipt */
  newReceiptId?: string;
}

/** Summary of all overrides in a session or receipt */
export interface OverrideSummary {
  /** Number of overrides applied */
  count: number;
  /** Parameters that were overridden */
  params: string[];
  /** All override records */
  records: OverrideRecord[];
  /** Whether any override caused a judgment change */
  judgmentChanged: boolean;
}

/** Callback type for downstream recalculation */
export type RecalcCallback = (
  receiptId: string,
  updatedInputs: Record<string, unknown>,
) => Promise<{ newReceiptId: string; judgmentChanged: boolean }> | { newReceiptId: string; judgmentChanged: boolean };

// ---------------------------------------------------------------------------
// PART 2 — Override Application
// ---------------------------------------------------------------------------

/** Generate a short override ID */
function generateOverrideId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `ovr-${ts}-${rand}`;
}

/**
 * Apply a user override to a receipt parameter.
 *
 * Tags the result with [USER_OVERRIDE] and optionally triggers
 * downstream recalculation.
 *
 * @param receiptId - The receipt to override
 * @param param - Parameter name to override
 * @param originalValue - The original calculated/default value
 * @param overrideValue - The user's replacement value
 * @param reason - Optional explanation for the override
 * @returns OverrideRecord documenting the change
 */
export function applyOverride(
  receiptId: string,
  param: string,
  originalValue: unknown,
  overrideValue: unknown,
  reason?: string,
): OverrideRecord {
  if (param === '') {
    throw new Error('Override parameter name cannot be empty');
  }

  // Validate that override value differs from original
  if (originalValue === overrideValue) {
    throw new Error(
      `Override value is identical to original for param '${param}': ${String(originalValue)}`,
    );
  }

  const record: OverrideRecord = {
    id: generateOverrideId(),
    receiptId,
    param,
    originalValue,
    overrideValue,
    overriddenAt: new Date().toISOString(),
    reason,
    recalcTriggered: false,
  };

  // Store in registry
  _overrideStore.push(record);

  return record;
}

// ---------------------------------------------------------------------------
// PART 3 — Override Registry (In-Memory)
// ---------------------------------------------------------------------------

/** In-memory override store (serverless-compatible) */
let _overrideStore: OverrideRecord[] = [];

/** Get all overrides for a receipt */
export function getOverridesForReceipt(receiptId: string): OverrideRecord[] {
  return _overrideStore.filter(r => r.receiptId === receiptId);
}

/** Get override summary for a receipt */
export function getOverrideSummary(receiptId: string): OverrideSummary {
  const records = getOverridesForReceipt(receiptId);
  return {
    count: records.length,
    params: [...new Set(records.map(r => r.param))],
    records,
    judgmentChanged: records.some(r => r.newReceiptId !== undefined),
  };
}

/** Check if a receipt has any overrides */
export function hasOverrides(receiptId: string): boolean {
  return _overrideStore.some(r => r.receiptId === receiptId);
}

/** Clear all overrides (for testing) */
export function clearOverrides(): void {
  _overrideStore = [];
}

// ---------------------------------------------------------------------------
// PART 4 — Downstream Recalculation
// ---------------------------------------------------------------------------

/**
 * Apply an override and trigger downstream recalculation.
 *
 * This is the full workflow:
 * 1. Record the override
 * 2. Build updated inputs (original + all overrides)
 * 3. Call the recalculation callback
 * 4. Update the override record with new receipt ID
 *
 * @param receiptId - The receipt to override
 * @param param - Parameter to override
 * @param originalValue - Original value
 * @param overrideValue - New value from user
 * @param originalInputs - Full original input set
 * @param recalcFn - Callback to perform recalculation
 * @param reason - Optional explanation
 * @returns Updated OverrideRecord with recalculation result
 */
export async function applyOverrideWithRecalc(
  receiptId: string,
  param: string,
  originalValue: unknown,
  overrideValue: unknown,
  originalInputs: Record<string, unknown>,
  recalcFn: RecalcCallback,
  reason?: string,
): Promise<OverrideRecord> {
  // Step 1: Record the override
  const record = applyOverride(receiptId, param, originalValue, overrideValue, reason);

  // Step 2: Build updated inputs with all overrides for this receipt
  const allOverrides = getOverridesForReceipt(receiptId);
  const updatedInputs = { ...originalInputs };

  for (const ovr of allOverrides) {
    updatedInputs[ovr.param] = ovr.overrideValue;
  }

  // Step 3: Trigger recalculation
  try {
    const result = await recalcFn(receiptId, updatedInputs);
    record.recalcTriggered = true;
    record.newReceiptId = result.newReceiptId;

    // Update the stored record
    const idx = _overrideStore.findIndex(r => r.id === record.id);
    if (idx >= 0) {
      _overrideStore[idx] = record;
    }
  } catch (error) {
    // Recalculation failed — override is still recorded but without new receipt
    record.recalcTriggered = false;
    console.error(`[Override] Recalculation failed for ${receiptId}:`, error);
  }

  return record;
}

/**
 * Build an annotation string for overridden values.
 * Used in receipt/report output to mark user-modified values.
 *
 * @param param - Parameter name
 * @param originalValue - Original value
 * @param overrideValue - User override value
 * @returns Formatted annotation string
 */
export function formatOverrideTag(
  param: string,
  originalValue: unknown,
  overrideValue: unknown,
): string {
  return `[USER_OVERRIDE] ${param}: ${String(originalValue)} -> ${String(overrideValue)}`;
}

/**
 * Build a comparison table of original vs overridden values.
 * Useful for report generation showing what was changed.
 */
export function buildOverrideComparisonTable(
  receiptId: string,
): Array<{ param: string; original: string; override: string; reason?: string }> {
  const records = getOverridesForReceipt(receiptId);
  return records.map(r => ({
    param: r.param,
    original: String(r.originalValue),
    override: String(r.overrideValue),
    reason: r.reason,
  }));
}
