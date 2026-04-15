'use client';

/**
 * ESVA 현장 안전관리 페이지
 *
 * 플로우: 자연어 입력 → 파싱 → 체크리스트 → 스케줄러 → 데드맨 스위치 → 작업 완료
 *
 * PART 1: 타입 및 상수
 * PART 2: 스케줄러 UI 서브컴포넌트
 * PART 3: 메인 페이지
 */

import { useState, useCallback, useId } from 'react';
import { SafetyCheckList } from '@/components/SafetyCheckList';
import { DeadManSwitch } from '@/components/DeadManSwitch';
import { parseSafetyIntent } from '@/lib/safety-intent-parser';
import { analyzeSafety } from '@/engine/safety/confined-space';
import { generateSafetySchedule, calcDeadManConfig } from '@/lib/safety-scheduler';
import type { SafetyAnalysisResult, SafetySchedule } from '@/engine/safety/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 타입 및 상수
// ═══════════════════════════════════════════════════════════════════════════════

type PageStep = 'input' | 'checklist' | 'monitor' | 'done';

const EXAMPLE_QUERIES = [
  '지하 공동구, 비 옴, 4명, 입선 작업, 09시~18시, 관리자 3명',
  '맨홀, 맑음, 2명, 접속 작업, 10시~14시, 관리자 1명',
  '전기실, 폭염, 3명, 배전반 작업, 08시~17시, 관리자 2명',
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 스케줄러 UI 서브컴포넌트
// ═══════════════════════════════════════════════════════════════════════════════

function SchedulePanel({ schedule }: { schedule: SafetySchedule }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
        <span>📅</span> 자동 안전 스케줄
        <span className="text-xs font-normal text-[var(--color-text-muted)]">
          (데드맨 체크인 {schedule.deadManIntervalMinutes}분 간격)
        </span>
      </h3>
      <div className="space-y-2">
        {schedule.checkpoints.map((cp, i) => (
          <div key={i} className={`flex gap-3 p-2.5 rounded-lg border ${
            cp.isMandatory
              ? 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5'
              : 'border-[var(--color-border)] bg-[var(--color-surface-2)]'
          }`}>
            <div className="flex-shrink-0 text-center">
              <span className="font-mono text-sm font-bold text-[var(--color-text-primary)]">
                {cp.time}
              </span>
              {cp.isGasMeasurement && (
                <div className="text-[10px] text-orange-400 mt-0.5">가스측정</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{cp.title}</p>
              <p className="text-xs text-[var(--color-text-secondary)] truncate">{cp.description}</p>
              <p className="text-[10px] text-[var(--color-text-muted)]">{cp.regulation}</p>
            </div>
            {cp.isMandatory && (
              <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 h-fit rounded bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 font-medium">
                필수
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 메인 페이지
// ═══════════════════════════════════════════════════════════════════════════════

export default function FieldSafetyPage() {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [step, setStep] = useState<PageStep>('input');
  const [analysis, setAnalysis] = useState<SafetyAnalysisResult | null>(null);
  const [schedule, setSchedule] = useState<SafetySchedule | null>(null);
  const [sessionId] = useState(() => `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [sosLog, setSosLog] = useState<number[]>([]);
  const [isDone, setIsDone] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  const handleAnalyze = useCallback(() => {
    if (!query.trim()) return;
    const intent = parseSafetyIntent(query);
    const result = analyzeSafety(intent);
    const sched = generateSafetySchedule(intent);
    setAnalysis(result);
    setSchedule(sched);
    setStep('checklist');
  }, [query]);

  const handleExampleClick = (ex: string) => {
    setQuery(ex);
  };

  const handleSos = useCallback((ts: number) => {
    setSosLog(prev => [...prev, ts]);
    // 실제 SOS: /api/field/complete API 또는 알림 시스템 호출
    console.warn('[ESVA 데드맨] SOS 발동:', new Date(ts).toISOString());
  }, []);

  const handleWorkComplete = async () => {
    if (!analysis) return;
    try {
      const res = await fetch('/api/field/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          workSite: analysis.intent.location?.ko ?? '현장',
          workerCount: analysis.intent.workers ?? 0,
          supervisorIds: [],
          checklistDone: [],
          checklistTotal: analysis.checkItems.length,
          completedAt: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      setDoneMsg(data.data?.receipt?.hash ? `영수증 해시: ${(data.data.receipt.hash as string).slice(0, 16)}…` : '완료 처리됨');
      setIsDone(true);
      setStep('done');
    } catch {
      setDoneMsg('완료 처리 중 오류 발생. 수동으로 기록해주세요.');
      setStep('done');
    }
  };

  const deadManConfig = analysis ? calcDeadManConfig(analysis.intent) : null;

  // ── 완료 화면
  if (step === 'done') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-6">✅</div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">작업 완료</h1>
        <p className="text-[var(--color-text-secondary)] mb-4">전원 이상 없음 및 작업 종료 — 관리자에게 알림 발송됨.</p>
        {doneMsg && (
          <p className="text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--color-text-muted)] mb-6">
            {doneMsg}
          </p>
        )}
        <button
          onClick={() => { setStep('input'); setQuery(''); setAnalysis(null); setSchedule(null); setIsDone(false); }}
          className="px-6 py-3 rounded-xl bg-[var(--color-primary)] text-white font-semibold hover:bg-[var(--color-primary-hover)] transition-all"
        >
          새 작업 시작
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <span>⚡</span> 현장 안전관리
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          작업 정보를 자연어로 입력하면 산안법/KEC 기반 체크리스트와 안전 스케줄을 자동 생성합니다.
        </p>
      </div>

      {/* STEP 1: 입력 */}
      {step === 'input' && (
        <div className="space-y-4">
          <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              작업 정보 입력
            </label>
            <textarea
              id={inputId}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleAnalyze(); }}
              placeholder="예) 지하 공동구, 비 옴, 4명, 입선 작업, 09시~18시, 관리자 3명"
              rows={3}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] px-4 py-3 text-sm resize-none focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">장소, 날씨, 인원, 작업종류, 시간, 관리자 수를 포함하면 더 정확합니다. Ctrl+Enter로 분석.</p>
          </div>

          {/* 예시 버튼 */}
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-2">예시 클릭:</p>
            <div className="space-y-2">
              {EXAMPLE_QUERIES.map(ex => (
                <button
                  key={ex}
                  onClick={() => handleExampleClick(ex)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50 hover:text-[var(--color-text-primary)] transition-colors truncate"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!query.trim()}
            className="w-full py-3.5 rounded-xl font-semibold text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all active:scale-95"
          >
            안전 분석 시작
          </button>
        </div>
      )}

      {/* STEP 2: 체크리스트 */}
      {step === 'checklist' && analysis && (
        <div className="space-y-4">
          {/* 입력 요약 */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--color-text-secondary)]">
              <span className="font-medium text-[var(--color-text-primary)]">{analysis.intent.location?.ko ?? '현장'}</span>
              {analysis.intent.workers ? `, ${analysis.intent.workers}명` : ''}
              {analysis.intent.hours ? `, ${analysis.intent.hours.start}~${analysis.intent.hours.end}` : ''}
            </div>
            <button
              onClick={() => { setStep('input'); setAnalysis(null); setSchedule(null); }}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            >
              ← 다시 입력
            </button>
          </div>

          {/* 체크리스트 */}
          <SafetyCheckList analysis={analysis} />

          {/* 스케줄 */}
          {schedule && <SchedulePanel schedule={schedule} />}

          {/* 모니터링 시작 */}
          <button
            onClick={() => setStep('monitor')}
            className="w-full py-3.5 rounded-xl font-semibold text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white transition-all active:scale-95"
          >
            작업 시작 → 모니터링 켜기
          </button>
        </div>
      )}

      {/* STEP 3: 모니터링 (데드맨 스위치) */}
      {step === 'monitor' && analysis && deadManConfig && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[var(--color-text-primary)]">실시간 안전 모니터링</h2>
            <button
              onClick={() => setStep('checklist')}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            >
              ← 체크리스트
            </button>
          </div>

          {/* 데드맨 스위치 */}
          <DeadManSwitch
            config={deadManConfig}
            supervisorCount={analysis.intent.supervisors ?? 1}
            onSos={handleSos}
          />

          {/* SOS 이력 */}
          {sosLog.length > 0 && (
            <div className="rounded-xl border border-red-700/60 bg-red-950/20 p-4">
              <p className="text-sm font-semibold text-red-400 mb-2">⚠️ SOS 발동 이력</p>
              {sosLog.map((ts, i) => (
                <p key={i} className="text-xs font-mono text-red-300">
                  {i + 1}회: {new Date(ts).toLocaleTimeString('ko-KR')}
                </p>
              ))}
            </div>
          )}

          {/* 스케줄 요약 */}
          {schedule && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2">오늘의 점검 일정</p>
              <div className="flex flex-wrap gap-2">
                {schedule.checkpoints.map((cp, i) => (
                  <span key={i} className={`text-xs px-2 py-1 rounded-lg border ${
                    cp.isGasMeasurement
                      ? 'border-orange-700/50 bg-orange-950/20 text-orange-300'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]'
                  }`}>
                    {cp.time} {cp.isGasMeasurement ? '⛽' : '✓'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 작업 완료 버튼 */}
          <button
            onClick={handleWorkComplete}
            className="w-full py-4 rounded-xl font-bold text-sm bg-green-700 hover:bg-green-600 text-white transition-all active:scale-95"
          >
            🏁 퇴근 완료 — 관리자에게 알림 발송
          </button>
        </div>
      )}
    </div>
  );
}
