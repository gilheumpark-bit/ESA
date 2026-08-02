'use client';

/**
 * Receipt Viewer Page — owner receipt at /receipt/[id]
 *
 * PART 1: Skeleton and error states
 * PART 2: Receipt header with share/print
 * PART 3: Integrity verification panel
 * PART 4: Main page component
 */

import { use, useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Share2,
  Printer,
  Copy,
  Check,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  ExternalLink,
  Stamp,
} from 'lucide-react';
import ReceiptCard from '@/components/ReceiptCard';
import type { Receipt } from '@/engine/receipt/types';
import { authenticatedFetch, optionalAuthenticatedFetch } from '@/lib/client-auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { getCachedReceipt } from '@/lib/receipt-cache';
import { receiptLoadErrorMessage, safeReceiptLoadError } from '@/lib/receipt-load-error';
import { OPEN_BETA } from '@/lib/tier-gate';

/** 서버가 재계산으로 붙여 주는 판정. 응답에 늘 있지만 구 캐시 대비 optional. */
type ReceiptWithIntegrity = Receipt & { integrity?: 'VALID' | 'TAMPERED' | 'UNVERIFIABLE' };

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Skeleton & Error States
// ═══════════════════════════════════════════════════════════════════════════════

function ReceiptSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse px-4 py-8">
      <div className="mb-6 h-8 w-1/3 rounded bg-[var(--bg-tertiary)]" />
      <div className="rounded-xl border border-[var(--border-default)] p-6">
        <div className="mb-4 h-6 w-1/2 rounded bg-[var(--bg-tertiary)]" />
        <div className="mb-8 h-24 rounded bg-[var(--bg-tertiary)]" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-4 rounded bg-[var(--bg-tertiary)]" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
      <div className="mx-4 max-w-md text-center">
        <ShieldAlert size={48} className="mx-auto mb-4 text-[var(--color-error)]" />
        <h1 className="mb-2 text-xl font-bold text-[var(--text-primary)]">
          영수증을 불러올 수 없습니다
        </h1>
        <p className="mb-6 text-sm text-[var(--text-secondary)]">{message}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft size={16} />
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Receipt Header
// ═══════════════════════════════════════════════════════════════════════════════

function ReceiptHeader({
  receipt,
  onShare,
  onPrint,
}: {
  receipt: Receipt;
  onShare: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 no-print">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">
            계산 영수증
          </h1>
          <span className="font-mono text-xs text-[var(--text-tertiary)]">
            #{receipt.id.slice(0, 8)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onShare}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Share2 size={14} />
          내 링크 복사
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Printer size={14} />
          인쇄
        </button>
        <Link
          href="/calc"
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm text-white hover:bg-[var(--color-primary-hover)]"
        >
          <ExternalLink size={14} />
          계산기 목록
        </Link>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Integrity Verification
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 서버는 저장된 열로 해시를 다시 만들어 봉인 당시 값과 대조한다
 * (`computeReceiptIntegrity` → `/api/receipt/[id]` 응답의 `integrity`).
 * 그 판정이 화면까지 오지 못하고 있었다 — **변조된 영수증이 정상과 똑같이
 * 보였다**(2026-07-28 실측: 응답에는 있고 읽는 코드가 없었다).
 *
 * `UNVERIFIABLE` 을 경고로 칠하지 않는다. 구 영수증은 봉인에 들어간 열이
 * 저장돼 있지 않을 수 있고, 그건 변조가 아니라 확인 불가다.
 */
const VERDICT_VIEW = {
  VALID: {
    icon: ShieldCheck,
    tone: 'text-emerald-700 dark:text-emerald-300',
    box: 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20',
    title: '재계산 일치',
    body: '저장된 내용으로 해시를 다시 만들었더니 봉인 당시 값과 같습니다.',
  },
  TAMPERED: {
    icon: ShieldAlert,
    tone: 'text-red-700 dark:text-red-300',
    box: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20',
    title: '재계산 불일치',
    body: '저장된 내용으로 다시 만든 해시가 봉인 당시 값과 다릅니다. 계산 내용이 바뀌었거나 저장 과정에서 값이 달라진 것입니다 — 원본을 확인하십시오.',
  },
  UNVERIFIABLE: {
    icon: Shield,
    tone: 'text-[var(--text-secondary)]',
    box: 'border-[var(--border-default)] bg-[var(--bg-secondary)]',
    title: '확인 불가',
    body: '봉인에 들어간 항목 중 일부가 저장돼 있지 않아 해시를 다시 만들 수 없습니다. 변조 판정이 아닙니다.',
  },
} as const;

function IntegrityPanel({ receipt }: { receipt: ReceiptWithIntegrity }) {
  const [hashCopied, setHashCopied] = useState(false);
  const verdict = receipt.integrity ? VERDICT_VIEW[receipt.integrity] : null;
  const VerdictIcon = verdict?.icon;

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(receipt.receiptHash);
      setHashCopied(true);
      setTimeout(() => setHashCopied(false), 2000);
    } catch {
      prompt('해시값:', receipt.receiptHash);
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5 no-print">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <ShieldCheck size={18} className="text-emerald-600" />
        무결성 검증
      </h2>

      <div className="space-y-3">
        {verdict && VerdictIcon && (
          <div
            data-testid="integrity-verdict"
            data-verdict={receipt.integrity}
            className={`flex gap-2 rounded-lg border p-3 ${verdict.box}`}
          >
            <VerdictIcon size={16} className={`mt-0.5 shrink-0 ${verdict.tone}`} />
            <div className="min-w-0">
              <span className={`block text-xs font-semibold ${verdict.tone}`}>{verdict.title}</span>
              <span className="block text-[11px] leading-relaxed text-[var(--text-secondary)]">{verdict.body}</span>
            </div>
          </div>
        )}

        {/* Hash */}
        <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
          <Shield size={14} className="shrink-0 text-[var(--text-tertiary)]" />
          <div className="min-w-0 flex-1">
            <span className="block text-xs text-[var(--text-tertiary)]">SHA-256 해시</span>
            <span className="block truncate font-mono text-xs text-[var(--text-secondary)]">
              {receipt.receiptHash}
            </span>
          </div>
          <button
            type="button"
            onClick={copyHash}
            className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--color-primary)]"
          >
            {hashCopied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>

        {/* Verification status */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-[var(--bg-secondary)] p-2.5">
            <span className="block text-[var(--text-tertiary)]">엔진 버전</span>
            <span className="font-mono text-[var(--text-primary)]">v{receipt.engineVersion}</span>
          </div>
          <div className="rounded-lg bg-[var(--bg-secondary)] p-2.5">
            <span className="block text-[var(--text-tertiary)]">기준 상태</span>
            <span className={receipt.isStandardCurrent ? 'text-emerald-600' : 'text-amber-600'}>
              {receipt.isStandardCurrent ? '현행 확인됨' : '현행 미확인'}
            </span>
          </div>
          <div className="rounded-lg bg-[var(--bg-secondary)] p-2.5">
            <span className="block text-[var(--text-tertiary)]">적용 기준</span>
            <span className="text-[var(--text-primary)]">{receipt.appliedStandard}</span>
          </div>
          <div className="rounded-lg bg-[var(--bg-secondary)] p-2.5">
            <span className="block text-[var(--text-tertiary)]">기준 버전</span>
            <span className="text-[var(--text-primary)]">{receipt.standardVersion}</span>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-[var(--text-tertiary)]">
          SHA-256 해시는 <strong>계산기 ID · 입력값 · 결과값 · 계산 단계 · 사용 공식 ·
          적용 기준과 그 버전 · 단위계 · 엔진 버전</strong>을 정규화해 생성합니다.
          동일한 입력으로 재계산하면 동일한 해시가 나오므로 이 항목들의 무결성을 검증할 수 있습니다.
        </p>
        {/*
          같은 패널에 봉인된 것과 안 된 것이 섞여 있었다. 특히 위 「기준 상태」
          칸은 해시 밖인데 해시 바로 옆에 있어 함께 봉인된 것처럼 읽혔다.
          계산 시각을 해시에서 뺀 것은 옳다 — 넣으면 "같은 입력 → 같은 해시"
          가 깨진다. 그러니 범위를 숨기지 말고 적는다(2026-07-28).
        */}
        <p className="text-[10px] leading-relaxed text-[var(--text-tertiary)]">
          계산 시각 · 경고 문구 · 권고 사항 · 고지문 · 국가 코드 · 기준 현행 여부는
          <strong> 해시에 포함되지 않습니다</strong>. 계산 시각은 재계산할 때마다 달라져
          해시에 넣으면 재현 검증이 성립하지 않기 때문입니다.
        </p>
      </div>
    </div>
  );
}

/**
 * 등록된 타임스탬프를 레지스트리와 맞춰 본 결과.
 *
 * `/api/notarize` POST 가 `verifyUrl`(`/receipt/{id}?verify=true`)을
 * 돌려주고 화면이 "검증 페이지 열기" 링크를 그렸는데, **그 쿼리를 읽는
 * 코드가 없었다** — 눌러도 같은 화면이 다시 떴다(2026-07-28 실측,
 * §2.8 스텁 어포던스). 대조 로직(`verifyProof`)도 호출처가 0 이었다.
 *
 * 등록한 적이 없는 경우를 "위조" 로 읽히게 하지 않는다 — 그건 아무 일도
 * 없었다는 뜻이다.
 */
function TimestampVerification({ receiptId }: { receiptId: string }) {
  const [state, setState] = useState<
    { loading: true } | { loading: false; registered: boolean; valid: boolean | null; reason?: string; ipfsCid?: string } | null
  >({ loading: true });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await authenticatedFetch(`/api/notarize?receiptId=${encodeURIComponent(receiptId)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) { setState(null); return; }
        setState({ loading: false, ...json.data });
      } catch {
        if (!cancelled) setState(null);
      }
    })();
    return () => { cancelled = true; };
  }, [receiptId]);

  if (!state) return null;
  if (state.loading) {
    return (
      <div className="mt-6 flex items-center gap-2 rounded-xl border border-[var(--border-default)] p-4 text-sm text-[var(--text-secondary)] no-print">
        <Loader2 size={16} className="animate-spin" />
        타임스탬프 등록 기록을 대조하는 중입니다.
      </div>
    );
  }

  const tone = !state.registered
    ? { box: 'border-[var(--border-default)] bg-[var(--bg-secondary)]', text: 'text-[var(--text-secondary)]', Icon: Shield, title: '등록 안 됨' }
    : state.valid
      ? { box: 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', Icon: ShieldCheck, title: '등록 기록과 일치' }
      : { box: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', Icon: ShieldAlert, title: '등록 기록과 불일치' };

  return (
    <div data-testid="timestamp-verification" data-registered={String(state.registered)} data-valid={String(state.valid)}
      className={`mt-6 flex gap-2 rounded-xl border p-4 no-print ${tone.box}`}>
      <tone.Icon size={18} className={`mt-0.5 shrink-0 ${tone.text}`} />
      <div className="min-w-0">
        <span className={`block text-sm font-semibold ${tone.text}`}>{tone.title}</span>
        <span className="block text-xs leading-relaxed text-[var(--text-secondary)]">
          {!state.registered
            ? '이 영수증은 타임스탬프에 등록된 적이 없습니다. 등록하지 않았다는 뜻이며, 내용에 문제가 있다는 뜻이 아닙니다.'
            : state.valid
              ? '영수증에 적힌 등록 정보가 등록 기록과 같습니다.'
              : `영수증에 적힌 등록 정보가 등록 기록과 다릅니다${state.reason ? ` (${state.reason})` : ''}. 원본을 확인하십시오.`}
        </span>
        {state.ipfsCid && (
          <span className="mt-1 block truncate font-mono text-[10px] text-[var(--text-tertiary)]">IPFS CID: {state.ipfsCid}</span>
        )}
      </div>
    </div>
  );
}

/**
 * 등록 성공 화면의 "검증 페이지 열기" 가 가는 곳이 `?verify=true` 다.
 * 그 쿼리를 읽는 자리 — 링크가 약속한 것만 한다(§11).
 */
function TimestampVerificationGate({ receiptId }: { receiptId: string }) {
  const searchParams = useSearchParams();
  if (searchParams.get('verify') !== 'true') return null;
  return <TimestampVerification receiptId={receiptId} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3.5 — Optional IPFS timestamp registration (calls /api/notarize)
// ═══════════════════════════════════════════════════════════════════════════════

function TimestampRegistrationButton({ receiptId }: { receiptId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ipfsCid: string; verifyUrl: string; alreadyRegistered?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTimestampRegistration = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await authenticatedFetch('/api/notarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId }),
      });

      const json = await res.json();

      if (!json.success) {
        const errMsg = json.error?.message ?? '타임스탬프 등록 실패';
        const code = json.error?.code;
        if (code === 'ESVA-1001') {
          setError('로그인이 필요합니다.');
        } else if (code === 'ESVA-2001') {
          // OPEN_BETA 면 서버가 등급을 안 막으므로 이 분기는 도달하지 않는다.
          // 그래도 문구를 갈라 둔다 — 화면에 남은 문자열이 곧 제품의 주장이다.
          setError(OPEN_BETA
            ? 'IPFS 타임스탬프 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.'
            : 'IPFS 타임스탬프 등록은 Pro 플랜 이상에서 이용 가능합니다.');
        } else {
          setError(errMsg);
        }
        return;
      }

      setResult(json.data);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [receiptId]);

  if (result) {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 no-print dark:border-emerald-800 dark:bg-emerald-900/20">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          <ShieldCheck size={18} />
          {result.alreadyRegistered ? '이미 등록됨' : '타임스탬프 등록 완료'}
        </h2>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400">IPFS CID:</span>
            <span className="font-mono text-emerald-800 dark:text-emerald-200 truncate">{result.ipfsCid}</span>
          </div>
          <Link
            href={result.verifyUrl}
            className="inline-flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-300"
          >
            <ExternalLink size={12} />
            검증 페이지 열기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 no-print">
      <button
        type="button"
        onClick={handleTimestampRegistration}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] px-5 py-3 text-sm font-medium text-[var(--text-primary)] shadow-sm transition-all hover:border-emerald-400 hover:shadow-md disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin text-emerald-600" />
        ) : (
          <Stamp size={18} className="text-emerald-600" />
        )}
        IPFS 타임스탬프 등록
      </button>
      {error && (
        <p className="mt-2 text-xs text-[var(--color-error)]">{error}</p>
      )}
      {/*
        「Pro 플랜 이상 필요」는 요금제 게이트가 살아 있을 때만 참이다. OPEN_BETA
        에서는 등급 제한이 없는데 이 문구만 남아 있으면 화면이 거짓을 말한다 —
        고정 문자열이라 봉인이 닿지 않던 자리다(실측 2026-08-01).
      */}
      <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">
        계산 결과를 익명화해 IPFS에 고정하고 ESA 서버 레지스트리에 시각을 기록합니다.
        블록체인 거래·제3자 공증·법적 서명을 의미하지 않습니다.
        {OPEN_BETA ? '' : ' Pro 플랜 이상 필요.'}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [receipt, setReceipt] = useState<ReceiptWithIntegrity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReceipt() {
      try {
        const res = await optionalAuthenticatedFetch(`/api/receipt/${id}`);
        if (res.ok) {
          const data: Receipt = await res.json();
          if (!cancelled) setReceipt(data);
          return;
        }
        // 서버 미스 — 익명 계산은 서버에 저장되지 않으므로 클라이언트
        // 세션 캐시에서 폴백한다 (bug M5: 비로그인 영수증 링크 404 방지).
        const cached = getCachedReceipt(id);
        if (cached) {
          if (!cancelled) setReceipt(cached);
          return;
        }
        throw new Error(receiptLoadErrorMessage(res.status));
      } catch (err) {
        // 네트워크 오류 시에도 세션 캐시를 마지막으로 시도한다.
        const cached = getCachedReceipt(id);
        if (cached) {
          if (!cancelled) setReceipt(cached);
        } else if (!cancelled) {
          setFetchError(safeReceiptLoadError(err));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadReceipt();
    return () => { cancelled = true; };
  }, [id]);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      alert('본인 계정에서 다시 열 수 있는 링크가 복사되었습니다. 다른 사용자에게는 공개되지 않습니다.');
    } catch {
      prompt('본인용 영수증 링크:', url);
    }
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (isLoading) return <ReceiptSkeleton />;
  if (fetchError) return <ErrorState message={fetchError} />;
  if (!receipt) return <ErrorState message="영수증 데이터가 없습니다." />;

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <ReceiptHeader
          receipt={receipt}
          onShare={handleShare}
          onPrint={handlePrint}
        />

        <ReceiptCard receipt={receipt} variant="full" />

        <IntegrityPanel receipt={receipt} />

        {isFeatureEnabled('RECEIPT_NOTARIZE') && (
          <>
            <Suspense fallback={null}>
              <TimestampVerificationGate receiptId={id} />
            </Suspense>
            <TimestampRegistrationButton receiptId={id} />
          </>
        )}
      </div>
    </div>
  );
}
