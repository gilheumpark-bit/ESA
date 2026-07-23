'use client';

/**
 * Receipt Viewer Page — owner receipt at /receipt/[id]
 *
 * PART 1: Skeleton and error states
 * PART 2: Receipt header with share/print
 * PART 3: Integrity verification panel
 * PART 4: Main page component
 */

import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
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

function IntegrityPanel({ receipt }: { receipt: Receipt }) {
  const [hashCopied, setHashCopied] = useState(false);

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
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <ShieldCheck size={18} className="text-emerald-600" />
        무결성 검증
      </h3>

      <div className="space-y-3">
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
          SHA-256 해시는 입력값과 결과값의 정규화된 조합으로 생성됩니다.
          동일한 입력으로 재계산하면 동일한 해시가 생성되어 결과의 무결성을 검증할 수 있습니다.
        </p>
      </div>
    </div>
  );
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
          setError('IPFS 타임스탬프 등록은 Pro 플랜 이상에서 이용 가능합니다.');
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
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          <ShieldCheck size={18} />
          {result.alreadyRegistered ? '이미 등록됨' : '타임스탬프 등록 완료'}
        </h3>
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
      <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">
        계산 결과를 익명화해 IPFS에 고정하고 ESA 서버 레지스트리에 시각을 기록합니다.
        블록체인 거래·제3자 공증·법적 서명을 의미하지 않습니다. Pro 플랜 이상 필요.
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

  const [receipt, setReceipt] = useState<Receipt | null>(null);
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
      <main className="mx-auto max-w-3xl px-4 py-8">
        <ReceiptHeader
          receipt={receipt}
          onShare={handleShare}
          onPrint={handlePrint}
        />

        <ReceiptCard receipt={receipt} variant="full" />

        <IntegrityPanel receipt={receipt} />

        {isFeatureEnabled('RECEIPT_NOTARIZE') && <TimestampRegistrationButton receiptId={id} />}
      </main>
    </div>
  );
}
