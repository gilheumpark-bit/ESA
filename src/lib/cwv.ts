/**
 * Core Web Vitals Monitoring
 * ----------------------------
 * LCP / FID / CLS / INP / TTFB 실측 + 리포팅.
 * web-vitals 라이브러리 없이 자체 구현 (번들 절약).
 *
 * 사용법: layout.tsx에서 import { initCWV } from '@/lib/cwv'; 후 useEffect로 호출.
 */

import { trackEvent } from './analytics';

interface CWVMetric {
  name: 'LCP' | 'FID' | 'CLS' | 'INP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  FID: [100, 300],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  TTFB: [800, 1800],
};

function rate(name: string, value: number): CWVMetric['rating'] {
  const [good, poor] = THRESHOLDS[name] ?? [0, 0];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

function report(metric: CWVMetric) {
  trackEvent('engagement', `cwv:${metric.name}`, {
    value: Math.round(metric.value),
    metadata: { rating: metric.rating },
  });
}

/**
 * CWV 측정 시작.
 * 클라이언트 전용 (typeof window 체크 내장).
 */
export function initCWV(): void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  // LCP (Largest Contentful Paint)
  try {
    const lcpObs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        const value = last.startTime;
        report({ name: 'LCP', value, rating: rate('LCP', value) });
      }
    });
    lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* 미지원 브라우저 */ }

  // CLS (Cumulative Layout Shift)
  try {
    let clsValue = 0;
    const clsObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // @ts-expect-error: LayoutShift 타입
        if (!entry.hadRecentInput) {
          // @ts-expect-error: LayoutShift 타입
          clsValue += entry.value;
        }
      }
    });
    clsObs.observe({ type: 'layout-shift', buffered: true });

    // 페이지 언로드 시 CLS 리포트
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        report({ name: 'CLS', value: clsValue, rating: rate('CLS', clsValue) });
      }
    }, { once: true });
  } catch { /* 미지원 */ }

  // FID (First Input Delay)
  try {
    const fidObs = new PerformanceObserver((list) => {
      const entry = list.getEntries()[0];
      if (entry) {
        // @ts-expect-error: PerformanceEventTiming
        const value = entry.processingStart - entry.startTime;
        report({ name: 'FID', value, rating: rate('FID', value) });
      }
    });
    fidObs.observe({ type: 'first-input', buffered: true });
  } catch { /* 미지원 */ }

  // TTFB (Time to First Byte)
  try {
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navEntry) {
      const value = navEntry.responseStart - navEntry.requestStart;
      report({ name: 'TTFB', value, rating: rate('TTFB', value) });
    }
  } catch { /* 미지원 */ }
}
