/**
 * Onboarding — First-visit onboarding modal
 * ───────────────────────────────────────────
 * 3-step walkthrough for new users:
 *   1. ESVA 소개 (what ESVA does)
 *   2. BYOK AI 검색 (how to set up API key)
 *   3. 전기 계산기 (CALCULATOR_COUNT 정본) (try your first calculation)
 *
 * PART 1: Step definitions
 * PART 2: Onboarding component
 */

'use client';

import { useOnboarding } from '@/hooks/useOnboarding';
import { CALCULATOR_COUNT } from '@/engine/calculators/count';
import { Calculator, KeyRound, Search, type LucideIcon } from 'lucide-react';

// ─── PART 1: Step Definitions ──────────────────────────────────

interface OnboardingStep {
  title: string;
  description: string;
  icon: LucideIcon;
}

const STEPS: OnboardingStep[] = [
  {
    title: 'ESA에 오신 것을 환영합니다',
    description:
      'ESVA(Electrical Search Vertical AI)는 전기 엔지니어용 검색·계산 작업대입니다. ' +
      '저장소의 기준서 스냅샷을 찾고 계산 과정과 경고를 다시 확인할 수 있습니다.',
    icon: Search,
  },
  {
    title: 'BYOK로 AI 검색',
    description:
      'ESVA는 BYOK(Bring Your Own Key) 방식입니다. ' +
      'OpenAI, Anthropic, Google 등 원하는 AI 모델의 API 키를 설정하면 ' +
      '조건부 AI 검색을 사용할 수 있습니다. 원문 키는 브라우저 결합 암호화로 저장되고, ' +
      '요청할 때 ESVA 서버를 거쳐 공급자에 일시 전달됩니다.',
    icon: KeyRound,
  },
  {
    title: `${CALCULATOR_COUNT}개 전기 계산기`,
    description:
      '전압강하, 케이블 사이징, 단락전류, 접지저항 등 ' +
      `${CALCULATOR_COUNT}개 계산기의 입력·공식·단계·경고를 확인할 수 있습니다. ` +
      '결과 영수증은 동일성 확인용 SHA-256 해시를 포함합니다.',
    icon: Calculator,
  },
];

// ─── PART 2: Onboarding Component ──────────────────────────────

export default function Onboarding() {
  const { shouldShow, currentStep, next, prev, skip, complete } = useOnboarding();

  if (!shouldShow) return null;

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;
  const StepIcon = step.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="esa-onboarding-title"
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 bg-blue-50 dark:bg-blue-950 rounded-full flex items-center justify-center mb-6">
            <StepIcon size={32} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
          </div>

          {/* Title */}
          <h2 id="esa-onboarding-title" className="text-xl font-bold text-gray-900 dark:text-white mb-3">
            {step.title}
          </h2>

          {/* Description */}
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-8">
            {step.description}
          </p>

          {/* Step indicator */}
          <div className="flex justify-center gap-2 mb-6">
            {STEPS.map((_, i) => (
              <div
                key={i}
                aria-hidden="true"
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentStep
                    ? 'bg-blue-600'
                    : i < currentStep
                      ? 'bg-blue-300'
                      : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={prev}
              disabled={currentStep === 0}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300
                         disabled:opacity-0 disabled:cursor-default transition-opacity"
            >
              이전
            </button>

            <button
              type="button"
              onClick={isLast ? complete : next}
              className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg
                         hover:bg-blue-700 transition-colors"
            >
              {isLast ? '시작하기' : '다음'}
            </button>
          </div>
        </div>

        {/* Skip / Don't show again */}
        <div className="px-8 pb-4 flex items-center justify-center gap-4 border-t border-gray-100 dark:border-gray-800 pt-3">
          <button
            type="button"
            onClick={skip}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            건너뛰기
          </button>
          <span className="text-gray-200 dark:text-gray-700">|</span>
          <button
            type="button"
            onClick={complete}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            다시 보지 않기
          </button>
        </div>
      </div>
    </div>
  );
}
