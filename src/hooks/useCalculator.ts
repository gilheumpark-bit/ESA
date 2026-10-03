'use client';

/**
 * useCalculator Hook
 *
 * PART 1: Types
 * PART 2: Hook implementation — execute, cache, error handling
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Receipt } from '@/engine/receipt/types';
import type { DetailedCalcResult } from '@/engine/calculators/types';
import { cacheReceipt } from '@/lib/receipt-cache';
import { readStoredCountry, readStoredLanguage } from '@/hooks/useSettings';
import { optionalAuthenticatedFetch } from '@/lib/client-auth';
import { useAuth } from '@/contexts/AuthContext';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface UseCalculatorReturn {
  execute: (inputs: Record<string, unknown>) => Promise<void>;
  result: DetailedCalcResult | null;
  receipt: Receipt | null;
  /** 로그인 사용자의 계산이 계정에 저장되지 않았을 때만 true. */
  saveFailed: boolean;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

interface CalculateApiResponse {
  result: DetailedCalcResult;
  receipt: Receipt;
  persisted?: boolean | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Hook
// ═══════════════════════════════════════════════════════════════════════════════

export function useCalculator(calculatorId: string): UseCalculatorReturn {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;
  // The owner is known once Firebase reports a user, before the tier lookup
  // that also holds `loading`; a calculation never waits on that lookup.
  const identityPending = authLoading && !user;
  const [result, setResult] = useState<DetailedCalcResult | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The account the visible result belongs to (undefined = no result yet).
  const [resultScope, setResultScope] = useState<string | null | undefined>(undefined);
  // A request made before auth settles waits for it instead of being dropped:
  // callers such as InlineCalcResult execute exactly once on mount.
  const [pendingInputs, setPendingInputs] = useState<Record<string, unknown> | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    // Reset synchronously with scope disposal, not in the aborted request's
    // finally: a replacement request may already own the ref when it settles.
    setResultScope(undefined);
    setResult(null);
    setReceipt(null);
    setSaveFailed(false);
    setError(null);
    setIsLoading(false);
  }, [uid, identityPending]);

  const execute = useCallback(
    async (inputs: Record<string, unknown>) => {
      // Until the account is known the request cannot carry (or deliberately omit) the owner.
      if (identityPending) {
        setPendingInputs(inputs);
        return;
      }
      activeRequestRef.current?.abort();
      const controller = new AbortController();
      activeRequestRef.current = controller;
      // A new request owns the screen; previous receipts are not its result.
      setResultScope(uid);
      setResult(null);
      setReceipt(null);
      setSaveFailed(false);
      setIsLoading(true);
      setError(null);

      try {
        // Forward the user's selected country so the Country/Standard setting
        // actually reaches the engine (bug M2 — was always defaulting to KR).
        // A signed-in user's bearer lets the API save the calculation to the account.
        const res = await optionalAuthenticatedFetch('/api/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            calculatorId,
            inputs,
            countryCode: readStoredCountry(),
            language: readStoredLanguage(),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const errMsg = typeof body.error === 'string'
            ? body.error
            : body.error?.message ?? `Calculation failed (${res.status})`;
          throw new Error(errMsg);
        }

        const body = await res.json();
        // API returns { success, data: { result, receipt } }
        const data: CalculateApiResponse = body.data ?? body;
        if (controller.signal.aborted || activeRequestRef.current !== controller) return;
        setResult(data.result);
        setReceipt(data.receipt);
        setSaveFailed(data.persisted === false);

        // Cache receipt client-side for offline export support
        if (data.receipt) {
          cacheReceipt(data.receipt, uid);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : 'Unknown calculation error';
        setError(message);
        setResult(null);
        setReceipt(null);
        setSaveFailed(false);
      } finally {
        if (activeRequestRef.current === controller) {
          activeRequestRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [calculatorId, uid, identityPending],
  );

  // Run the request that arrived while auth was loading, under the settled identity.
  useEffect(() => {
    if (identityPending || pendingInputs === null) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setPendingInputs(null);
      void execute(pendingInputs);
    });
    return () => { cancelled = true; };
  }, [identityPending, pendingInputs, execute]);

  const reset = useCallback(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setPendingInputs(null);
    setResult(null);
    setReceipt(null);
    setSaveFailed(false);
    setError(null);
    setIsLoading(false);
  }, []);

  // A result produced for another account (or before auth settled) is not shown.
  const current = !identityPending && resultScope === uid;
  return {
    execute,
    result: current ? result : null,
    receipt: current ? receipt : null,
    saveFailed: current && saveFailed,
    isLoading: (identityPending && pendingInputs !== null) || (current && isLoading),
    error: current ? error : null,
    reset,
  };
}
