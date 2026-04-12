import { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: '면책조항 | ESA',
  description: 'ESVA 면책조항',
};

/**
 * Disclaimer — /disclaimer
 *
 * PART 1: Section data
 * PART 2: Page component
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Section Data
// ═══════════════════════════════════════════════════════════════════════════════

const SECTIONS = [
  {
    title: '계산 결과의 한계',
    body: 'ESA가 제공하는 모든 공학 계산(전압강하, 케이블 사이즈, 단락전류, 접지저항 등)은 추정값이며 법적 문서로 사용할 수 없습니다. 계산 결과는 자격을 갖춘 전기 엔지니어의 검토 및 승인 없이 설계 또는 시공에 직접 적용할 수 없습니다.',
  },
  {
    title: 'AI 검색 결과',
    body: 'AI 기반 검색 답변은 대규모 언어모델(LLM)에 의해 생성됩니다. AI 답변에는 부정확한 정보, 오래된 기준 참조, 또는 맥락에 맞지 않는 해석이 포함될 수 있습니다. 모든 AI 답변은 원문 기준서와 대조하여 검증해야 합니다.',
  },
  {
    title: '기준 및 규격 참조',
    body: 'ESA에서 참조하는 KEC, NEC, IEC 등의 기준은 특정 시점의 판본을 기반으로 합니다. 최신 개정 사항이 반영되지 않을 수 있으며, 관할 지역의 현행 법규를 반드시 확인해야 합니다.',
  },
  {
    title: '전문가 검증 의무',
    body: 'ESA의 출력물은 예비 검토 및 참고 목적으로만 사용되어야 합니다. 최종 설계, 시공, 감리 결정은 반드시 해당 분야의 면허를 보유한 전문 기술자가 수행해야 합니다.',
  },
  {
    title: '손해배상 면책',
    body: 'ESVA 및 운영자는 서비스 이용으로 인한 직접적, 간접적, 우발적, 결과적 손해에 대해 법이 허용하는 최대 범위 내에서 책임을 지지 않습니다. 여기에는 잘못된 계산 결과의 적용, 서비스 중단, 데이터 손실로 인한 손해가 포함됩니다.',
  },
  {
    title: '외부 서비스',
    body: 'ESA는 Firebase, Supabase, OpenAI, Anthropic, Google AI 등 외부 서비스에 의존합니다. 이러한 외부 서비스의 장애, 정책 변경, 또는 데이터 처리 방식에 대해 ESA는 책임을 지지 않습니다.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Page Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <AlertTriangle size={28} className="text-amber-500" />
            면책조항
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Disclaimer
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Warning banner */}
        <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            ESA는 참고용 도구입니다. 모든 공학적 판단은 자격을 갖춘 전문가에 의해 최종 검증되어야 합니다.
          </p>
        </div>

        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
                {section.title}
              </h2>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
