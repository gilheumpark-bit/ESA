'use client';

/**
 * Receipt Viewer Page — Shareable receipt at /receipt/[id]
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

function ErrorState({ message, id }: { message: string; id: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
      <div className="mx-4 max-w-md text-center">
        <ShieldAlert size={48} className="mx-auto mb-4 text-[var(--color-error)]" />
        <h1 className="mb-2 text-xl font-bold text-[var(--text-primary)]">
          영수증을 불러올 수 없습니다
        </h1>
        <p className="mb-1 text-sm text-[var(--text-secondary)]">{message}</p>
        <p className="mb-6 font-mono text-xs text-[var(--text-tertiary)]">ID: {id}</p>
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
          공유
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
          href={`/calc/${receipt.calcId}`}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm text-white hover:bg-[var(--color-primary-hover)]"
        >
          <ExternalLink size={14} />
          계산기 열기
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
              {receipt.isStandardCurrent ? '현행 기준' : '구판 기준'}
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
// PART 3.5 — Notarize Button (calls /api/notarize)
// ═══════════════════════════════════════════════════════════════════════════════

function NotarizeButton({ receiptId }: { receiptId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ipfsCid: string; verifyUrl: string; alreadyNotarized?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleNotarize = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/notarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId }),
      });

      const json = await res.json();

      if (!json.success) {
        const errMsg = json.error?.message ?? '공증 실패';
        const code = json.error?.code;
        if (code === 'ESVA-1001') {
          setError('로그인이 필요합니다.');
        } else if (code === 'ESVA-2001') {
          setError('공증 기능은 Pro 플랜 이상에서 이용 가능합니다.');
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
          {result.alreadyNotarized ? '이미 공증됨' : '공증 완료'}
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
        onClick={handleNotarize}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] px-5 py-3 text-sm font-medium text-[var(--text-primary)] shadow-sm transition-all hover:border-emerald-400 hover:shadow-md disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin text-emerald-600" />
        ) : (
          <Stamp size={18} className="text-emerald-600" />
        )}
        공증 (IPFS + 타임스탬프)
      </button>
      {error && (
        <p className="mt-2 text-xs text-[var(--color-error)]">{error}</p>
      )}
      <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">
        계산 결과를 익명화하여 IPFS에 고정하고 타임스탬프 증명을 생성합니다. Pro 플랜 이상 필요.
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
        const res = await fetch(`/api/receipt/${id}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error('영수증을 찾을 수 없습니다');
          throw new Error(`불러오기 실패 (${res.status})`);
        }
        const data: Receipt = await res.json();
        if (!cancelled) setReceipt(data);
      } catch (err) {
        if (!cancelled) {
          setFetchError(
            err instanceof Error ? err.message : '알 수 없는 오류',
          );
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
      if (navigator.share) {
        await navigator.share({ title: 'ESVA 계산 영수증', url });
      } else {
        await navigator.clipboard.writeText(url);
        alert('링크가 복사되었습니다');
      }
    } catch {
      prompt('공유 링크:', url);
    }
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (isLoading) return <ReceiptSkeleton />;
  if (fetchError) return <ErrorState message={fetchError} id={id} />;
  if (!receipt) return <ErrorState message="영수증 데이터가 없습니다" id={id} />;

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

        <NotarizeButton receiptId={id} />
      </main>
    </div>
  );
}
