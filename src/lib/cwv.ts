/** Core Web Vitals 측정 — web-vitals API 활용 */
export function initCWV(): void {
  if (typeof window === 'undefined') return;
  // web-vitals 라이브러리 없이 Performance API 기본 측정
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint' ||
            entry.entryType === 'first-input' ||
            entry.entryType === 'layout-shift') {
          console.debug('[CWV]', entry.entryType, entry.startTime.toFixed(1));
        }
      }
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
    observer.observe({ type: 'first-input', buffered: true });
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // PerformanceObserver 미지원 브라우저 무시
  }
}
