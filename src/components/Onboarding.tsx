/**
 * Onboarding — First-visit onboarding modal
 * ───────────────────────────────────────────
 * 3-step walkthrough for new users:
 *   1. ESVA 소개 (what ESVA does)
 *   2. BYOK AI 검색 (how to set up API key)
 *   3. 56개 전기 계산기 (try your first calculation)
 *
 * PART 1: Step definitions
 * PART 2: Onboarding component
 */

'use client';

import { useOnboarding } from '@/hooks/useOnboarding';

// ─── PART 1: Step Definitions ──────────────────────────────────

interface OnboardingStep {
  title: string;
  description: string;
  icon: string;
}

const STEPS: OnboardingStep[] = [
  {
    title: 'ESA에 오신 것을 환영합니다',
    description:
      'ESVA(Electrical Search Vertical AI)는 전기 엔지니어를 위한 AI 검색 엔진입니다. ' +
      'KEC, NEC, IEC 등 전기설비기술기준을 AI로 검색하고, ' +
      '검증된 계산기로 정확한 결과를 얻을 수 있습니다.',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z', // lightning bolt
  },
  {
    title: 'BYOK로 AI 검색',
    description:
      'ESVA는 BYOK(Bring Your Own Key) 방식입니다. ' +
      'OpenAI, Anthropic, Google 등 원하는 AI 모델의 API 키를 설정하면 ' +
      '강력한 전기설비 기준 검색이 가능합니다. ' +
      '키는 브라우저에만 저장되어 안전합니다.',
    icon: 'M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3M8 12h8', // link
  },
  {
    title: '56개 전기 계산기',
    description:
      '전압강하, 케이블 사이징, 단락전류, 접지저항 등 ' +
      '56개 이상의 검증된 전기공학 계산기를 무료로 사용하세요. ' +
      '모든 결과에는 검증 가능한 영수증이 발행됩니다.',
    icon: 'M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5zM4 13a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6zM16 13a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-6z', // calculator
  },
];

// ─── PART 2: Onboarding Component ──────────────────────────────

export default function Onboarding() {
  const { shouldShow, currentStep, next, prev, skip, complete } = useOnboarding();

  if (!shouldShow) return null;

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-600 dark:text-blue-400"
            >
              <path d={step.icon} />
            </svg>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
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
              onClick={prev}
              disabled={currentStep === 0}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300
                         disabled:opacity-0 disabled:cursor-default transition-opacity"
            >
              이전
            </button>

            <button
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
            onClick={skip}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            건너뛰기
          </button>
          <span className="text-gray-200 dark:text-gray-700">|</span>
          <button
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
