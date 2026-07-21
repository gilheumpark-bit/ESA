import { canonicalize, verifyReceipt, type ReceiptClaim } from '@engine/receipt/receipt-hash';
import type { Receipt } from '@engine/receipt/types';
import type { CalcResult } from '@engine/standards/types';
import type { CalculationReceipt } from '@/lib/supabase';

export type ReceiptIntegrity = 'VALID' | 'TAMPERED' | 'UNVERIFIABLE';

const SHA256_HEX = /^[0-9a-f]{64}$/i;
const isString = (value: unknown): value is string => typeof value === 'string';
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Recompute a stored receipt seal without inventing missing legacy fields.
 * Duplicate column/metadata values must also agree before the hash is checked.
 */
export async function computeReceiptIntegrity(
  row: CalculationReceipt,
): Promise<ReceiptIntegrity> {
  try {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const storedHash = isString(meta.receiptHash)
      ? meta.receiptHash
      : isString(meta.hash) ? meta.hash : null;
    if (!storedHash || !SHA256_HEX.test(storedHash)) return 'UNVERIFIABLE';

    const duplicated: ReadonlyArray<readonly [unknown, unknown]> = [
      [meta.calcId, row.calculator_id],
      [meta.inputs, row.inputs],
      [meta.formulaUsed, row.formula_used],
      [meta.result, row.outputs],
      [meta.standardVersion, row.standard_ref],
    ];
    if (duplicated.some(
      ([metadataValue, columnValue]) => metadataValue != null
        && columnValue != null
        && canonicalize(metadataValue) !== canonicalize(columnValue),
    )) {
      return 'TAMPERED';
    }

    const calcId = isString(meta.calcId) ? meta.calcId : isString(row.calculator_id) ? row.calculator_id : null;
    const appliedStandard = isString(meta.appliedStandard) ? meta.appliedStandard : null;
    const standardVersion = isString(meta.standardVersion)
      ? meta.standardVersion
      : isString(row.standard_ref) ? row.standard_ref : null;
    const unitSystem = isString(meta.unitSystem) ? meta.unitSystem : null;
    const inputs = isObject(meta.inputs) ? meta.inputs : isObject(row.inputs) ? row.inputs : null;
    const result = isObject(meta.result) ? meta.result : isObject(row.outputs) ? row.outputs : null;
    const steps = Array.isArray(meta.steps) ? meta.steps : null;
    const standardsUsed = Array.isArray(meta.standardsUsed) && meta.standardsUsed.every(isString)
      ? meta.standardsUsed
      : null;
    const engineVersion = isString(meta.engineVersion) ? meta.engineVersion : null;
    const formulaUsed = isString(meta.formulaUsed)
      ? meta.formulaUsed
      : isString(row.formula_used) ? row.formula_used : null;

    if (
      !calcId || !appliedStandard || !standardVersion || !unitSystem || !inputs
      || !result || !steps || !standardsUsed || !engineVersion || formulaUsed === null
    ) {
      return 'UNVERIFIABLE';
    }

    const claim: ReceiptClaim & { receiptHash: string } = {
      calcId,
      appliedStandard,
      standardVersion,
      unitSystem,
      inputs,
      result: result as CalcResult,
      steps,
      formulaUsed,
      standardsUsed,
      engineVersion,
      receiptHash: storedHash,
    };

    return await verifyReceipt(claim as unknown as Receipt) ? 'VALID' : 'TAMPERED';
  } catch (error) {
    console.warn('[ESVA Receipt Integrity] Verification failed:', error);
    return 'UNVERIFIABLE';
  }
}
