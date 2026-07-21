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
      '문의 접수 정보 (이름, 이메일, 문의 유형 및 내용)',
      '자동 수집 정보: 접속 IP, 브라우저 유형, 접속 시간',
    ],
  },
  {
    title: '2. BYOK 키 처리',
    items: [
      '사용자의 API 키는 브라우저 내에서 AES-GCM 알고리즘으로 암호화됩니다',
      '암호화된 키 본문은 브라우저의 IndexedDB에 저장되며, 복호화 키는 내보낼 수 없는 브라우저 CryptoKey로 관리됩니다',
      '저장된 평문 API 키는 브라우저 저장소에 남기지 않습니다',
      'AI 요청 시 복호화된 키가 TLS 연결을 통해 ESVA 서버에 전달되어 선택한 LLM 제공자 요청에 사용될 수 있습니다',
    ],
  },
  {
    title: '3. 개인정보의 이용 목적',
    items: [
      '서비스 제공 및 계정 관리',
      '계산 이력 저장 및 영수증 생성',
      '서비스 개선을 위한 최소한의 사용 통계',
      '사용자 문의 접수 및 답변',
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
      '계정 또는 데이터 삭제 요청은 문의 페이지에서 접수하며, 현재 설정 화면에는 자동 계정 삭제 기능이 없습니다',
      '문의 접수 정보에는 접수일로부터 1년의 보존 만료일이 기록됩니다. 실제 운영 환경에는 만료 데이터 삭제 작업을 별도로 구성해야 합니다',
      'IPFS 타임스탬프 기능이 활성화되어 고정된 영수증 데이터는 분산 저장 특성상 완전한 삭제가 어려울 수 있습니다',
    ],
  },
  {
    title: '6. 애널리틱스',
    items: [
      '기능 개선을 위해 이벤트 분류·동작·시각·임시 세션 ID와 접속 IP가 서버 운영 로그에 기록될 수 있습니다',
      '동일 이벤트는 브라우저 localStorage에도 최대 1,000건까지 남으며 브라우저 데이터 삭제로 제거할 수 있습니다',
      '서버 로그 보존 기간은 배포 환경의 로그 보존 설정을 따르며, 애플리케이션 코드에는 별도 장기 분석 DB가 없습니다',
      '브라우저의 Do Not Track 값이 1이면 ESVA는 새 분석 이벤트를 생성하지 않습니다',
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
            최종 수정일: 2026-07-20
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
