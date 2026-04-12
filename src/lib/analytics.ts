/**
 * ESVA Event Analytics — 1급 측정 인프라
 * ----------------------------------------
 * 사용자 행동 이벤트 수집 + 전환율 추적.
 * 측정 → 분석 → 실험 → 채택 루프의 기반.
 *
 * PART 1: Event types
 * PART 2: Tracker
 * PART 3: Conversion tracking
 * PART 4: Session metrics
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Event Types
// ═══════════════════════════════════════════════════════════════════════════════

export type EventCategory =
  | 'calc'         // 계산기 사용
  | 'search'       // 검색
  | 'sld'          // 도면 분석
  | 'report'       // 보고서
  | 'nav'          // 네비게이션
  | 'auth'         // 인증
  | 'export'       // 내보내기
  | 'error'        // 에러
  | 'engagement';  // 참여도

export interface AnalyticsEvent {
  category: EventCategory;
  action: string;
  label?: string;
  value?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
  /** A/B 테스트 변형 ID */
  variant?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Event Tracker
// ═══════════════════════════════════════════════════════════════════════════════

const EVENT_BUFFER: AnalyticsEvent[] = [];
const FLUSH_INTERVAL = 10_000; // 10초마다 플러시
const MAX_BUFFER = 50;

let sessionId = '';

function getSessionId(): string {
  if (sessionId) return sessionId;
  if (typeof window !== 'undefined') {
    sessionId = sessionStorage.getItem('esva-session-id') ?? '';
    if (!sessionId) {
      sessionId = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      sessionStorage.setItem('esva-session-id', sessionId);
    }
  }
  return sessionId;
}

/**
 * 이벤트 기록.
 * 즉시 전송하지 않고 버퍼에 쌓았다가 배치 전송.
 */
export function trackEvent(
  category: EventCategory,
  action: string,
  options?: {
    label?: string;
    value?: number;
    metadata?: Record<string, unknown>;
    variant?: string;
  },
): void {
  if (typeof window === 'undefined') return;

  const event: AnalyticsEvent = {
    category,
    action,
    label: options?.label,
    value: options?.value,
    metadata: options?.metadata,
    variant: options?.variant,
    timestamp: Date.now(),
    sessionId: getSessionId(),
  };

  EVENT_BUFFER.push(event);

  // 버퍼 가득 차면 즉시 플러시
  if (EVENT_BUFFER.length >= MAX_BUFFER) {
    flushEvents();
  }
}

/** 버퍼 플러시 — sendBeacon으로 비동기 전송 */
function flushEvents(): void {
  if (EVENT_BUFFER.length === 0) return;

  const events = EVENT_BUFFER.splice(0, MAX_BUFFER);

  // 1차: Vercel Analytics (있으면)
  try {
    if (typeof navigator?.sendBeacon === 'function') {
      navigator.sendBeacon('/api/analytics', JSON.stringify({ events }));
    }
  } catch {
    // sendBeacon 실패 시 로컬 저장
  }

  // 2차: 로컬 히스토리 (분석용)
  try {
    const stored = JSON.parse(localStorage.getItem('esva-events') ?? '[]');
    stored.push(...events);
    // 최대 1000건 유지
    if (stored.length > 1000) stored.splice(0, stored.length - 1000);
    localStorage.setItem('esva-events', JSON.stringify(stored));
  } catch {
    // 스토리지 초과 시 무시
  }
}

// 주기적 플러시
if (typeof window !== 'undefined') {
  setInterval(flushEvents, FLUSH_INTERVAL);
  window.addEventListener('beforeunload', flushEvents);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Conversion Tracking (전환율 추적)
// ═══════════════════════════════════════════════════════════════════════════════

export type ConversionGoal =
  | 'calc_complete'    // 계산 완료
  | 'report_download'  // 보고서 다운로드
  | 'signup'           // 회원가입
  | 'byok_setup'       // API 키 등록
  | 'export_pdf'       // PDF 내보내기
  | 'search_success';  // 검색 성공 (결과 클릭)

/**
 * 전환 이벤트 기록.
 * A/B 테스트 변형별 전환율 계산에 사용.
 */
export function trackConversion(
  goal: ConversionGoal,
  value?: number,
  variant?: string,
): void {
  trackEvent('engagement', `conversion:${goal}`, {
    value,
    variant,
    metadata: { goal, convertedAt: new Date().toISOString() },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Session Metrics (체류시간/이탈 감지)
// ═══════════════════════════════════════════════════════════════════════════════

let pageEntryTime = 0;

/** 페이지 진입 기록 */
export function trackPageView(path: string): void {
  pageEntryTime = Date.now();
  trackEvent('nav', 'page_view', { label: path });
}

/** 페이지 이탈 기록 (체류시간 포함) */
export function trackPageExit(path: string): void {
  const dwellTime = pageEntryTime > 0 ? Date.now() - pageEntryTime : 0;
  trackEvent('nav', 'page_exit', {
    label: path,
    value: dwellTime,
    metadata: { dwellTimeMs: dwellTime },
  });
}

/** 이탈 의도 감지 (마우스가 뷰포트 밖으로) */
export function trackExitIntent(): void {
  if (typeof document === 'undefined') return;
  let triggered = false;
  document.addEventListener('mouseout', (e) => {
    if (triggered) return;
    if (e.clientY <= 0) {
      triggered = true;
      trackEvent('engagement', 'exit_intent');
    }
  });
}

/** 로컬 저장된 이벤트 조회 (분석용) */
export function getStoredEvents(): AnalyticsEvent[] {
  try {
    return JSON.parse(localStorage.getItem('esva-events') ?? '[]');
  } catch {
    return [];
  }
}
