/**
 * ESVA Accessibility (a11y) Utilities
 * --------------------------------------
 * 접근성 강화 유틸리티.
 *
 * PART 1: Focus management
 * PART 2: Screen reader announcements
 * PART 3: Keyboard navigation
 * PART 4: ARIA helpers
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Focus Management
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 포커스 트랩 — 모달/드롭다운 내에서 Tab 키가 빠져나가지 않게.
 */
export function trapFocus(container: HTMLElement): () => void {
  const focusable = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }

  container.addEventListener('keydown', handleKeyDown);
  first?.focus();

  return () => container.removeEventListener('keydown', handleKeyDown);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Screen Reader Announcements
// ═══════════════════════════════════════════════════════════════════════════════

let liveRegion: HTMLDivElement | null = null;

function ensureLiveRegion(): HTMLDivElement {
  if (liveRegion) return liveRegion;
  if (typeof document === 'undefined') return null as unknown as HTMLDivElement;

  liveRegion = document.createElement('div');
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.className = 'sr-only'; // Tailwind screen-reader-only
  liveRegion.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
  document.body.appendChild(liveRegion);
  return liveRegion;
}

/**
 * 스크린리더에 메시지 알림.
 * 시각적으로 보이지 않지만 스크린리더가 읽음.
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const region = ensureLiveRegion();
  if (!region) return;
  region.setAttribute('aria-live', priority);
  region.textContent = '';
  // 비동기로 내용 변경해야 스크린리더가 감지
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Keyboard Navigation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 화살표 키로 목록 탐색.
 * 계산기 목록, 기준서 목록 등에서 사용.
 */
export function handleArrowNavigation(
  e: KeyboardEvent,
  items: HTMLElement[],
  currentIndex: number,
): number {
  let newIndex = currentIndex;

  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowRight':
      e.preventDefault();
      newIndex = (currentIndex + 1) % items.length;
      break;
    case 'ArrowUp':
    case 'ArrowLeft':
      e.preventDefault();
      newIndex = (currentIndex - 1 + items.length) % items.length;
      break;
    case 'Home':
      e.preventDefault();
      newIndex = 0;
      break;
    case 'End':
      e.preventDefault();
      newIndex = items.length - 1;
      break;
  }

  items[newIndex]?.focus();
  return newIndex;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — ARIA Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** 계산 결과 스크린리더 알림 */
export function announceCalcResult(
  label: string,
  value: number,
  unit: string,
  compliant: boolean,
): void {
  const verdict = compliant ? '적합' : '부적합';
  announce(`${label} 계산 결과: ${value} ${unit}, 판정: ${verdict}`, 'assertive');
}

/** 에러 스크린리더 알림 */
export function announceError(message: string): void {
  announce(`오류: ${message}`, 'assertive');
}

/** 로딩 완료 스크린리더 알림 */
export function announceLoaded(section: string): void {
  announce(`${section} 로딩 완료`, 'polite');
}
