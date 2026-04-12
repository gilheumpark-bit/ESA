import { Metadata } from 'next';
import { Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: '개인정보처리방침 | ESA',
  description: 'ESVA 개인정보처리방침',
};

/**
 * Privacy Policy — /privacy
 *
 * PART 1: Section data
 * PART 2: Page component
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Section Data
// ═══════════════════════════════════════════════════════════════════════════════

const SECTIONS = [
  {
    title: '1. 수집하는 개인정보',
    items: [
      'Firebase Auth를 통한 인증 정보 (이메일, 표시 이름, 프로필 사진 URL)',
      '서비스 이용 기록 (계산 이력, 검색 기록)',
      '자동 수집 정보: 접속 IP, 브라우저 유형, 접속 시간',
    ],
  },
  {
    title: '2. BYOK 키 처리',
    items: [
      '사용자의 API 키는 브라우저 내에서 AES-GCM 알고리즘으로 암호화됩니다',
      '암호화된 키는 브라우저의 로컬 스토리지에만 저장됩니다',
      'API 키는 ESVA 서버로 전송되지 않습니다',
      'AI 요청 시 키는 클라이언트에서 직접 LLM 프로바이더로 전달됩니다',
    ],
  },
  {
    title: '3. 개인정보의 이용 목적',
    items: [
      '서비스 제공 및 계정 관리',
      '계산 이력 저장 및 영수증 생성',
      '서비스 개선을 위한 최소한의 사용 통계',
    ],
  },
  {
    title: '4. 개인정보 제3자 제공',
    items: [
      'ESVA는 사용자의 개인정보를 제3자에게 판매하지 않습니다',
      'Firebase Auth (Google) — 인증 서비스 제공',
      'Supabase — 데이터베이스 호스팅',
      'Vercel — 서비스 호스팅 및 배포',
    ],
  },
  {
    title: '5. 데이터 보존 및 삭제',
    items: [
      '계정 삭제 시 관련 개인정보는 30일 이내에 영구 삭제됩니다',
      'IPFS에 핀된 영수증은 탈중앙화 특성상 완전한 삭제가 보장되지 않습니다',
      '사용자는 설정 페이지에서 언제든지 데이터 삭제를 요청할 수 있습니다',
    ],
  },
  {
    title: '6. 애널리틱스',
    items: [
      'ESVA는 최소한의 분석 데이터만 수집합니다',
      '개인 식별이 불가능한 집계 형태로만 사용됩니다',
      '사용자는 브라우저 설정에서 추적을 거부할 수 있습니다',
    ],
  },
  {
    title: '7. 문의',
    items: [
      '개인정보 관련 문의는 /contact 페이지를 통해 접수할 수 있습니다',
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Page Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <Shield size={28} className="text-[var(--color-primary)]" />
            개인정보처리방침
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
              <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
                {section.title}
              </h2>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2 text-sm leading-relaxed text-[var(--text-secondary)]"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
