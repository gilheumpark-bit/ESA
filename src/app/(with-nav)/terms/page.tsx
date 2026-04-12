import { Metadata } from 'next';
import { Scale } from 'lucide-react';

export const metadata: Metadata = {
  title: '이용약관 | ESA',
  description: 'ESVA 서비스 이용약관',
};

/**
 * Terms of Service — /terms
 *
 * PART 1: Section data
 * PART 2: Page component
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Section Data
// ═══════════════════════════════════════════════════════════════════════════════

const SECTIONS = [
  {
    title: '제1조 (목적)',
    body: 'ESVA(Electrical Search AI) 서비스는 전기공학 전문가를 위한 참고 도구입니다. 본 약관은 서비스 이용에 관한 기본적인 사항을 규정합니다.',
  },
  {
    title: '제2조 (서비스의 성격)',
    body: 'ESA가 제공하는 계산 결과 및 AI 검색 답변은 참고용 정보이며, 법적 준거 문서가 아닙니다. 모든 결과는 자격을 갖춘 전문 엔지니어의 검증을 거쳐야 합니다. 설계, 시공 또는 법적 판단의 근거로 단독 사용할 수 없습니다.',
  },
  {
    title: '제3조 (사용자 책임)',
    body: '사용자는 ESA를 통해 얻은 정보를 반드시 독립적으로 검증할 책임이 있습니다. ESA의 출력물을 근거로 한 설계, 시공, 또는 의사결정에 대한 최종 책임은 사용자에게 있습니다.',
  },
  {
    title: '제4조 (BYOK 정책)',
    body: 'ESVA는 BYOK(Bring Your Own Key) 방식을 채택합니다. 사용자가 입력한 API 키는 브라우저의 로컬 스토리지에 AES-GCM으로 암호화되어 저장되며, ESVA 서버로 전송되지 않습니다. 키 관리의 책임은 사용자에게 있습니다.',
  },
  {
    title: '제5조 (면책)',
    body: 'ESVA는 서비스의 정확성, 완전성, 또는 특정 목적에의 적합성에 대해 명시적이거나 묵시적인 보증을 하지 않습니다. 서비스 이용으로 인한 직접적, 간접적 손해에 대해 책임을 지지 않습니다.',
  },
  {
    title: '제6조 (지적재산권)',
    body: 'ESA의 소프트웨어, 디자인, 로고 및 콘텐츠에 대한 지적재산권은 ESA에 귀속됩니다. 사용자가 생성한 계산 결과 및 영수증에 대한 권리는 사용자에게 있습니다.',
  },
  {
    title: '제7조 (약관 변경)',
    body: '본 약관은 서비스 개선 및 법적 요구에 따라 변경될 수 있습니다. 변경 시 서비스 내 공지를 통해 안내합니다.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Page Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <Scale size={28} className="text-[var(--color-primary)]" />
            이용약관
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            최종 수정일: 2025-04-01
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
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
