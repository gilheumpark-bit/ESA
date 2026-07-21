'use client';

/**
 * 회로 검토 패널 — 검토 엔진(circuit-review) 출력을 AX 언어로 렌더한다.
 * ────────────────────────────────────────────────────────────────────────
 * 시너지 지점: `reviewAnalysis`가 생산하던 판정(적합/부적합/보류)과 **무발명 시정
 * 제안**(ReviewFinding.proposal)은 지금까지 API가 만들고 화면이 버렸다. 이 패널이
 * 그 출력을 1급 요소로 세운다 — verdict + 근거(계산·기준) + "이렇게 고쳐라"(표준
 * 역산 후보·출처 결박). 제안값은 엔진이 지어내지 않으므로(§2.10) 각 후보에 basis를
 * 붙여 그대로 노출한다. 색은 전부 토큰(AX 팔레트)만 → 다크모드 자동.
 */

import type { ReviewReport, ReviewFinding } from '@/engine/review/circuit-review';
import { Wrench, CheckCircle2, AlertTriangle, XCircle, HelpCircle, Info } from 'lucide-react';

export type ReviewLike =
  | (ReviewReport & { extractionSource?: string; disclaimer?: string })
  | { skipped: true; reason: string };

type Sev = ReviewFinding['severity'];

const SEVERITY: Record<Sev, { label: string; token: string; icon: typeof Info }> = {
  FAIL: { label: '부적합', token: 'var(--color-error)', icon: XCircle },
  WARN: { label: '주의', token: 'var(--color-accent)', icon: AlertTriangle },
  PASS: { label: '적합', token: 'var(--color-success)', icon: CheckCircle2 },
  UNKNOWN: { label: '판정 보류', token: 'var(--text-tertiary)', icon: HelpCircle },
  INFO: { label: '참고', token: 'var(--color-primary)', icon: Info },
};

// 심각도 순서 — 부적합을 위로.
const SEV_ORDER: Sev[] = ['FAIL', 'WARN', 'UNKNOWN', 'INFO', 'PASS'];

function SeverityChip({ severity }: { severity: Sev }) {
  const s = SEVERITY[severity];
  const Icon = s.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ color: s.token, backgroundColor: `color-mix(in srgb, ${s.token} 10%, transparent)` }}
    >
      <Icon size={13} strokeWidth={2.5} />
      {s.label}
    </span>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[11px] text-[var(--text-tertiary)]">{label}</span>
      <span className="font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--text-primary)]">{value}</span>
    </span>
  );
}

function FindingCard({ f }: { f: ReviewFinding }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip severity={f.severity} />
        <span className="text-[13.5px] font-semibold text-[var(--text-primary)]">{f.subject}</span>
        <span className="ml-auto font-[family-name:var(--font-mono)] text-[10.5px] text-[var(--text-tertiary)]">{f.rule}</span>
      </div>

      {/* 근거 수치 — 도면에 적힌 값 / 계산값 / 기준 */}
      {(Object.keys(f.given).length > 0 || f.computed || f.limit) && (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {Object.entries(f.given).map(([k, v]) => <KV key={k} label={k} value={v} />)}
          {f.computed && Object.entries(f.computed).map(([k, v]) => <KV key={k} label={k} value={v} />)}
          {f.limit && <KV label="기준" value={`${f.limit.value} · ${f.limit.source}`} />}
        </div>
      )}

      <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">{f.verdict}</p>

      {/* 무발명 시정 제안 — 표준/KEC 역산 후보. 각 후보에 출처(basis) 결박. */}
      {f.proposal && f.proposal.length > 0 && (
        <div className="mt-3 rounded-lg border border-[var(--border-hover)] bg-[var(--bg-secondary)] p-3">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--color-accent)]">
            <Wrench size={13} strokeWidth={2.5} />
            시정 제안 · 표준 역산 (무발명)
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {f.proposal.map((opt, i) => (
              <li key={i} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <span className="text-[13px] text-[var(--text-primary)]">{opt.action}</span>
                <span className="shrink-0 self-start rounded-full border border-[var(--border-hover)] bg-[var(--bg-primary)] px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10.5px] text-[var(--text-tertiary)]">
                  {opt.basis}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ReviewReportPanel({ review }: { review: ReviewLike | null }) {
  if (!review) return null;

  if ('skipped' in review) {
    return (
      <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-5">
        <h3 className="text-[15px] font-bold text-[var(--text-primary)]">회로 검토</h3>
        <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">{review.reason}</p>
      </section>
    );
  }

  const { findings, summary, disclaimer, extractionSource } = review;
  const sorted = [...findings].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));

  // 요약 배지 — 0인 항목은 숨긴다(신호 압축).
  const counts: Array<[Sev, number]> = [
    ['FAIL', summary.fail], ['WARN', summary.warn], ['PASS', summary.pass],
    ['UNKNOWN', summary.unknown], ['INFO', summary.info],
  ];

  return (
    <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5 shadow-[0_4px_24px_rgba(28,27,23,0.05)]">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-[15px] font-bold text-[var(--text-primary)]">회로 검토</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {counts.filter(([, n]) => n > 0).map(([sev, n]) => {
            const s = SEVERITY[sev];
            return (
              <span
                key={sev}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                style={{ color: s.token, backgroundColor: `color-mix(in srgb, ${s.token} 10%, transparent)` }}
              >
                {s.label} {n}
              </span>
            );
          })}
        </div>
        {extractionSource && (
          <span className="ml-auto rounded-full border border-[var(--border-hover)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[10.5px] text-[var(--text-tertiary)]">
            {extractionSource}
          </span>
        )}
      </div>

      {sorted.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2.5">
          {sorted.map((f, i) => <FindingCard key={f.componentId ?? `${f.rule}-${i}`} f={f} />)}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-[var(--text-tertiary)]">판정 항목이 없습니다.</p>
      )}

      {disclaimer && (
        <p className="mt-4 border-t border-[var(--border-default)] pt-3 text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">
          {disclaimer}
        </p>
      )}
    </section>
  );
}
