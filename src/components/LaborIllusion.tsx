'use client';

/**
 * LaborIllusion — 노동 착시 + 피크엔드 컴포넌트
 * ------------------------------------------------
 * 계산 결과를 즉시 보여주지 않고,
 * 2~3초간 "검증 중..." 진행 메시지를 보여줘 신뢰감 확보.
 * 완료 시 성공 애니메이션 (피크엔드 법칙).
 */

import { useState, useEffect } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface Props {
  /** 실제 결과 준비 완료 여부 */
  ready: boolean;
  /** 노동 착시 활성 여부 (A/B 테스트 변형) */
  enabled?: boolean;
  /** 결과 렌더 */
  children: React.ReactNode;
}

const STEPS = [
  { message: '입력값 검증 중...', icon: '🔍', duration: 600 },
  { message: 'KEC/NEC/IEC 기준서 대조 중...', icon: '📖', duration: 800 },
  { message: '수식 전개 및 계산 수행 중...', icon: '⚡', duration: 700 },
  { message: '결과 검증 및 영수증 생성 중...', icon: '✅', duration: 500 },
];

export default function LaborIllusion({ ready, enabled = true, children }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (!ready || !enabled) {
      if (ready) setShowResult(true);
      return;
    }

    // 단계별 진행
    let stepIndex = 0;
    const advanceStep = () => {
      if (stepIndex < STEPS.length) {
        setCurrentStep(stepIndex);
        stepIndex++;
        setTimeout(advanceStep, STEPS[stepIndex - 1]?.duration ?? 600);
      } else {
        // 완료 — 성공 애니메이션
        setShowCelebration(true);
        setTimeout(() => {
          setShowResult(true);
          setTimeout(() => setShowCelebration(false), 2000);
        }, 800);
      }
    };

    advanceStep();
  }, [ready, enabled]);

  // 비활성 or 즉시 표시
  if (!enabled && ready) return <>{children}</>;
  if (showResult) {
    return (
      <div className="relative">
        {/* 피크엔드 성공 애니메이션 */}
        {showCelebration && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="animate-bounce rounded-full bg-green-500/10 p-6">
              <CheckCircle2 size={48} className="text-green-500" />
            </div>
          </div>
        )}
        <div className={showCelebration ? 'animate-fade-in' : ''}>{children}</div>
      </div>
    );
  }

  // 진행 중
  if (!ready) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  const step = STEPS[Math.min(currentStep, STEPS.length - 1)];

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* 진행 바 */}
      <div className="mb-4 h-1.5 w-48 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
        <div
          className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
          style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      {/* 단계 메시지 */}
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <span className="text-lg">{step.icon}</span>
        <span className="animate-pulse">{step.message}</span>
      </div>

      {/* 단계 표시 */}
      <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">
        {currentStep + 1} / {STEPS.length}
      </p>
    </div>
  );
}
