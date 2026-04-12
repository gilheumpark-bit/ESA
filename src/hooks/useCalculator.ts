'use client';

/**
 * useCalculator Hook
 *
 * PART 1: Types
 * PART 2: Hook implementation — execute, cache, error handling
 */

import { useState, useCallback } from 'react';
import type { Receipt } from '@/engine/receipt/types';
import type { DetailedCalcResult } from '@/engine/calculators/types';
import { cacheReceipt } from '@/lib/receipt-cache';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface UseCalculatorReturn {
  execute: (inputs: Record<string, unknown>) => Promise<void>;
  result: DetailedCalcResult | null;
  receipt: Receipt | null;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

interface CalculateApiResponse {
  result: DetailedCalcResult;
  receipt: Receipt;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Hook
// ═══════════════════════════════════════════════════════════════════════════════

export function useCalculator(calculatorId: string): UseCalculatorReturn {
  const [result, setResult] = useState<DetailedCalcResult | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (inputs: Record<string, unknown>) => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calculatorId, inputs }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error ?? `Calculation failed (${res.status})`,
          );
        }

        const data: CalculateApiResponse = await res.json();
        setResult(data.result);
        setReceipt(data.receipt);

        // Cache receipt client-side for offline export support
        if (data.receipt) {
          cacheReceipt(data.receipt);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown calculation error';
        setError(message);
        setResult(null);
        setReceipt(null);
      } finally {
        setIsLoading(false);
      }
    },
    [calculatorId],
  );

  const reset = useCallback(() => {
    setResult(null);
    setReceipt(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { execute, result, receipt, isLoading, error, reset };
}
