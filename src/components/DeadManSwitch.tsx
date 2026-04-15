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
  active:  { bg: 'bg-green-950/30',           border: 'border-green-600',                badge: 'bg-green-500',                   label: '모니터링 중' },
  warn1:   { bg: 'bg-yellow-950/30',          border: 'border-yellow-500',               badge: 'bg-yellow-400 animate-pulse',    label: '1차 경고' },
  warn2:   { bg: 'bg-orange-950/30',          border: 'border-orange-500',               badge: 'bg-orange-500 animate-pulse',    label: '2차 경고' },
  sos:     { bg: 'bg-red-950/40',             border: 'border-red-500',                  badge: 'bg-red-600 animate-ping',        label: '🚨 SOS 발동' },
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

function useDeadManTimer(
  config: DeadManConfig,
  isRunning: boolean,
  onSos?: (ts: number) => void,
): [TimerState, () => void] {
  const [state, setState] = useState<TimerState>({
    stage: 'idle',
    elapsedMs: 0,
    nextDeadlineMs: config.intervalMs,
    progress: 0,
  });

  const startRef = useRef<number>(0);
  const lastAckRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
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

  useEffect(() => {
    if (!isRunning) {
      cancelAnimationFrame(rafRef.current);
      setState(prev => ({ ...prev, stage: 'idle', elapsedMs: 0, progress: 0 }));
      return;
    }

    startRef.current = Date.now();
    lastAckRef.current = Date.now();
    sosCalledRef.current = false;

    const tick = () => {
      const now = Date.now();
      const elapsed = now - lastAckRef.current;
      const { intervalMs, warn1Multiplier, warn2Multiplier, sosMultiplier } = config;

      const warn1At = intervalMs * warn1Multiplier;
      const warn2At = intervalMs * warn2Multiplier;
      const sosAt = intervalMs * sosMultiplier;

      let stage: DeadManStage;
      let nextDeadline: number;
      let progress: number;

      if (elapsed < warn1At) {
        stage = 'active';
        nextDeadline = warn1At - elapsed;
        progress = elapsed / warn1At;
      } else if (elapsed < warn2At) {
        stage = 'warn1';
        nextDeadline = warn2At - elapsed;
        progress = (elapsed - warn1At) / (warn2At - warn1At);
      } else if (elapsed < sosAt) {
        stage = 'warn2';
        nextDeadline = sosAt - elapsed;
        progress = (elapsed - warn2At) / (sosAt - warn2At);
      } else {
        stage = 'sos';
        nextDeadline = 0;
        progress = 1;
        if (!sosCalledRef.current) {
          sosCalledRef.current = true;
          onSos?.(now);
        }
      }

      setState({ stage, elapsedMs: elapsed, nextDeadlineMs: nextDeadline, progress });

      if (stage !== 'sos') {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isRunning, config, onSos]);

  return [state, acknowledge];
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
  const [{ stage, nextDeadlineMs, progress }, acknowledge] = useDeadManTimer(config, isRunning, onSos);

  const styles = STAGE_STYLES[stage];
  const intervalMin = Math.round(config.intervalMs / 60000);

  const handleStart = () => {
    setIsRunning(true);
  };

  const handleStop = () => {
    setIsRunning(false);
  };

  return (
    <div className={`rounded-xl border-2 p-5 transition-all duration-300 ${styles.bg} ${styles.border} ${className}`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${styles.badge}`} />
          <span className="font-semibold text-[var(--color-text-primary)]">
            데드맨 스위치
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
          미응답 {intervalMin * 2}분 시 관리자 {supervisorCount}명 자동 신고
        </span>
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
        <div className="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-500 text-red-200 text-sm font-semibold">
          🚨 {config.messages.sos}
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
            onClick={handleStart}
            className="flex-1 py-3 rounded-xl font-semibold text-sm bg-green-600 hover:bg-green-500 active:scale-95 text-white transition-all"
          >
            ▶ 모니터링 시작
          </button>
        ) : stage === 'sos' ? (
          <button
            onClick={() => { acknowledge(); handleStop(); handleStart(); }}
            className="flex-1 py-3 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-500 active:scale-95 text-white transition-all animate-pulse"
          >
            🆘 SOS 취소 & 재시작
          </button>
        ) : (
          <>
            <button
              onClick={acknowledge}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] active:scale-95 text-white transition-all"
            >
              ✅ 생존 신고
            </button>
            <button
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
        본 기능은 보조 안전 수단입니다. 법적 의무 감시인 배치(산안법 제623조)를 대체하지 않습니다.
      </p>
    </div>
  );
}
