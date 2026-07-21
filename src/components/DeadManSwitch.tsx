'use client';

/**
 * ESVA 데드맨 스위치 컴포넌트
 *
 * 3단계 에스컬레이션:
 *   idle → active → warn1 → warn2 → sos
 *
 * PART 1: 타입 및 상수
 * PART 2: 타이머 훅
 * PART 3: UI 컴포넌트
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DeadManStage } from '@/engine/safety/types';
import type { DeadManConfig } from '@/lib/safety-scheduler';
import { CheckCircle2, Play, RotateCcw, Siren } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 타입 및 상수
// ═══════════════════════════════════════════════════════════════════════════════

interface DeadManSwitchProps {
  config: DeadManConfig;
  supervisorCount: number;
  onSos?: (timestamp: number) => void;  // SOS 발동 콜백
  className?: string;
}

const STAGE_STYLES: Record<DeadManStage, { bg: string; border: string; badge: string; label: string }> = {
  idle:    { bg: 'bg-[var(--color-surface)]', border: 'border-[var(--color-border)]',    badge: 'bg-gray-400',                    label: '대기 중' },
  active:  { bg: 'bg-green-950/30',           border: 'border-green-600',                badge: 'bg-green-500',                   label: '체크 타이머 작동' },
  warn1:   { bg: 'bg-yellow-950/30',          border: 'border-yellow-500',               badge: 'bg-yellow-400 animate-pulse',    label: '1차 경고' },
  warn2:   { bg: 'bg-orange-950/30',          border: 'border-orange-500',               badge: 'bg-orange-500 animate-pulse',    label: '2차 경고' },
  sos:     { bg: 'bg-red-950/40',             border: 'border-red-500',                  badge: 'bg-red-600 animate-ping',        label: 'SOS 표시' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 타이머 훅
// ═══════════════════════════════════════════════════════════════════════════════

interface TimerState {
  stage: DeadManStage;
  elapsedMs: number;
  nextDeadlineMs: number;
  progress: number; // 0~1 (현재 단계 진행률)
}

/**
 * 마지막 생존 신고 이후 경과 시간만으로 단계를 판정하는 순수 함수.
 *
 * tick이 몇 번 돌았는지에 의존하지 않는 것이 핵심이다. 백그라운드에서
 * 타이머가 throttle 되거나 아예 멈췄다 복귀해도, 복귀 시점의 벽시계
 * 경과만 넣으면 올바른 단계가 나온다.
 */
export function computeDeadManStage(
  elapsedMs: number,
  config: Pick<DeadManConfig, 'intervalMs' | 'warn1Multiplier' | 'warn2Multiplier' | 'sosMultiplier'>,
): { stage: DeadManStage; nextDeadlineMs: number; progress: number } {
  const { intervalMs, warn1Multiplier, warn2Multiplier, sosMultiplier } = config;

  const warn1At = intervalMs * warn1Multiplier;
  const warn2At = intervalMs * warn2Multiplier;
  const sosAt = intervalMs * sosMultiplier;

  if (elapsedMs < warn1At) {
    return {
      stage: 'active',
      nextDeadlineMs: warn1At - elapsedMs,
      progress: elapsedMs / warn1At,
    };
  }
  if (elapsedMs < warn2At) {
    return {
      stage: 'warn1',
      nextDeadlineMs: warn2At - elapsedMs,
      progress: (elapsedMs - warn1At) / (warn2At - warn1At),
    };
  }
  if (elapsedMs < sosAt) {
    return {
      stage: 'warn2',
      nextDeadlineMs: sosAt - elapsedMs,
      progress: (elapsedMs - warn2At) / (sosAt - warn2At),
    };
  }
  return { stage: 'sos', nextDeadlineMs: 0, progress: 1 };
}

function useDeadManTimer(
  config: DeadManConfig,
  isRunning: boolean,
  onSos?: (ts: number) => void,
): [TimerState, () => void, () => void] {
  const [state, setState] = useState<TimerState>({
    stage: 'idle',
    elapsedMs: 0,
    nextDeadlineMs: config.intervalMs,
    progress: 0,
  });

  const startRef = useRef<number>(0);
  const lastAckRef = useRef<number>(0);
  const sosCalledRef = useRef(false);

  // 생존 신고 (리셋)
  const acknowledge = useCallback(() => {
    lastAckRef.current = Date.now();
    sosCalledRef.current = false;
    setState({
      stage: 'active',
      elapsedMs: 0,
      nextDeadlineMs: config.intervalMs,
      progress: 0,
    });
  }, [config.intervalMs]);

  const reset = useCallback(() => {
    setState({
      stage: 'idle',
      elapsedMs: 0,
      nextDeadlineMs: config.intervalMs,
      progress: 0,
    });
  }, [config.intervalMs]);

  useEffect(() => {
    if (!isRunning) return;

    startRef.current = Date.now();
    lastAckRef.current = Date.now();
    sosCalledRef.current = false;

    const tick = () => {
      const now = Date.now();
      const elapsed = now - lastAckRef.current;
      const { stage, nextDeadlineMs, progress } = computeDeadManStage(elapsed, config);

      if (stage === 'sos' && !sosCalledRef.current) {
        sosCalledRef.current = true;
        onSos?.(now);
      }

      setState({ stage, elapsedMs: elapsed, nextDeadlineMs, progress });
    };

    tick();
    // 1초 간격 벽시계 폴링. 이전에는 requestAnimationFrame 루프였는데,
    // 브라우저가 숨겨진 탭에서 rAF를 완전히 정지시키므로 화면이 꺼지면
    // 감시가 멈췄다. setInterval도 백그라운드에서 throttle 되지만 정지하지는
    // 않으며, 단계 판정이 tick 횟수가 아닌 경과 시간 기준이므로 복귀 시점에
    // 올바른 단계가 즉시 계산된다.
    const intervalId = setInterval(tick, 1000);
    // 복귀 즉시 재계산해 throttle로 인한 표시 지연을 없앤다.
    document.addEventListener('visibilitychange', tick);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [isRunning, config, onSos]);

  return [state, acknowledge, reset];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — UI 컴포넌트
// ═══════════════════════════════════════════════════════════════════════════════

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function DeadManSwitch({ config, supervisorCount, onSos, className = '' }: DeadManSwitchProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [{ stage, nextDeadlineMs, progress }, acknowledge, reset] = useDeadManTimer(config, isRunning, onSos);

  const styles = STAGE_STYLES[stage];
  const intervalMin = Math.round(config.intervalMs / 60000);

  const handleStart = () => {
    setIsRunning(true);
  };

  const handleStop = () => {
    reset();
    setIsRunning(false);
  };

  return (
    <div className={`rounded-xl border-2 p-5 transition-all duration-300 ${styles.bg} ${styles.border} ${className}`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${styles.badge}`} />
          <span className="font-semibold text-[var(--color-text-primary)]">
            데드맨 체크 타이머
          </span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]">
          {styles.label}
        </span>
      </div>

      {/* 주기 안내 */}
      <p className="text-xs text-[var(--color-text-secondary)] mb-4">
        {intervalMin}분마다 생존 신고 필요 →{' '}
        <span className="text-[var(--color-text-primary)] font-medium">
          미응답 {intervalMin * 2}분 시 이 화면에 응급 경보 표시 (외부 자동 신고 없음 — 별도 연락 수단 필수)
        </span>
      </p>
      <p className="mb-4 text-xs text-[var(--color-text-secondary)]">
        입력된 감시인 {supervisorCount}명 — 실제 배치·연락 가능 상태는 현장에서 직접 확인해야 합니다.
      </p>

      {/* 상태 메시지 (경고 단계) */}
      {stage === 'warn1' && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-900/40 border border-yellow-600 text-yellow-200 text-sm">
          {config.messages.warn1}
        </div>
      )}
      {stage === 'warn2' && (
        <div className="mb-4 p-3 rounded-lg bg-orange-900/40 border border-orange-500 text-orange-200 text-sm">
          {config.messages.warn2}
        </div>
      )}
      {stage === 'sos' && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500 bg-red-900/50 p-3 text-sm font-semibold text-red-200">
          <Siren size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{config.messages.sos}</span>
        </div>
      )}

      {/* 진행 바 */}
      {isRunning && stage !== 'sos' && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mb-1">
            <span>다음 마감까지</span>
            <span className="font-mono font-semibold text-[var(--color-text-primary)]">
              {formatCountdown(nextDeadlineMs)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--color-surface-2)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                stage === 'warn2' ? 'bg-orange-500' :
                stage === 'warn1' ? 'bg-yellow-400' :
                'bg-green-500'
              }`}
              style={{ width: `${Math.max(0, (1 - progress) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* 버튼 */}
      <div className="flex gap-3">
        {!isRunning ? (
          <button
            type="button"
            onClick={handleStart}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white transition-all hover:bg-green-500 active:scale-95"
          >
            <Play size={16} aria-hidden="true" /> 체크 타이머 시작
          </button>
        ) : stage === 'sos' ? (
          <button
            type="button"
            onClick={acknowledge}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-bold text-white transition-all hover:bg-red-500 active:scale-95 animate-pulse"
          >
            <RotateCcw size={16} aria-hidden="true" /> SOS 표시 확인 후 타이머 재시작
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={acknowledge}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] py-3 text-sm font-bold text-white transition-all hover:bg-[var(--color-primary-hover)] active:scale-95"
            >
              <CheckCircle2 size={16} aria-hidden="true" /> 생존 확인
            </button>
            <button
              type="button"
              onClick={handleStop}
              className="px-4 py-3 rounded-xl text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-all"
            >
              중지
            </button>
          </>
        )}
      </div>

      {/* 법적 면책 */}
      <p className="mt-3 text-[10px] text-[var(--color-text-muted)] leading-relaxed">
        본 기능은 보조 수단입니다. 밀폐공간 작업에는 「산업안전보건기준에 관한 규칙」 제623조의 감시인 배치·연락설비 의무가 적용되며, 이 기능으로 대체할 수 없습니다.
      </p>
    </div>
  );
}
