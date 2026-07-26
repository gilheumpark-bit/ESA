/**
 * useOnboarding — Onboarding state management hook
 * ──────────────────────────────────────────────────
 * Tracks whether the user has completed onboarding via localStorage.
 * Provides step navigation (next, prev, skip, complete).
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'esa-onboarding-completed';
const TOTAL_STEPS = 3;

export interface UseOnboardingReturn {
  /** Whether the onboarding modal should be shown */
  shouldShow: boolean;
  /** Current step index (0-based) */
  currentStep: number;
  /** Go to the next step */
  next: () => void;
  /** Go to the previous step */
  prev: () => void;
  /** Skip onboarding entirely (marks as completed) */
  skip: () => void;
  /** Complete onboarding (marks as completed) */
  complete: () => void;
}

export function useOnboarding(): UseOnboardingReturn {
  const [shouldShow, setShouldShow] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Check localStorage on mount
  useEffect(() => {
    // rAF 는 탭이 보이지 않으면 발화하지 않는다 — 배경 탭에서 연 화면은 온보딩
    // 판단 자체가 일어나지 않는다(useSettings 의 같은 결함과 동일 원인,
    // 실측 2026-07-26). 마이크로태스크는 가시성과 무관하게 돈다.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const completed = localStorage.getItem(STORAGE_KEY);
        if (!completed) setShouldShow(true);
      } catch {
        // localStorage unavailable — don't show onboarding to avoid broken state
      }
    });
    return () => { cancelled = true; };
  }, []);

  const markCompleted = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
    setShouldShow(false);
    setCurrentStep(0);
  }, []);

  const next = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
  }, []);

  const prev = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const skip = useCallback(() => {
    markCompleted();
  }, [markCompleted]);

  const complete = useCallback(() => {
    markCompleted();
  }, [markCompleted]);

  return {
    shouldShow,
    currentStep,
    next,
    prev,
    skip,
    complete,
  };
}
