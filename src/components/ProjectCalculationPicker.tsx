'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { FeatureDialog } from '@/components/FeatureDialog';
import { featureAuthenticatedFetch } from '@/lib/feature-auth';
import { requestFeatureJson, requireRecord } from '@/lib/feature-request';
import { decodeHistoryRows, type HistoryRecord } from '@/lib/history-read-model';
import { CALCULATOR_NAMES } from '@/lib/calculator-params';

/** 아직 프로젝트에 없는 계산만 고를 수 있다 — 같은 영수증을 두 번 붙이지 않는다. */
export function selectableCalculations(records: HistoryRecord[], attachedIds: readonly string[]): HistoryRecord[] {
  const attached = new Set(attachedIds);
  return records.filter((record) => !attached.has(record.id));
}

/**
 * 프로젝트에 계산을 붙인다. 서버는 본인 계정에 저장된 영수증만 받으므로
 * 목록도 계정 이력에서 가져온다(탭에만 있는 계산은 붙일 수 없다).
 */
export function ProjectCalculationPicker({ projectId, attachedIds, onAdded, onClose }: {
  projectId: string;
  attachedIds: readonly string[];
  onAdded: () => void;
  onClose: () => void;
}) {
  const [records, setRecords] = useState<HistoryRecord[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestFeatureJson('/api/calculate?page=1&pageSize=100', { signal: controller.signal }, decodeHistoryRows, featureAuthenticatedFetch)
      .then((rows) => { if (!controller.signal.aborted) setRecords(rows); })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : '계산 이력을 불러오지 못했습니다.');
      });
    return () => { controller.abort(); request.current?.abort(); };
  }, []);

  const attach = async (receiptId: string) => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setPendingId(receiptId);
    setError(null);
    try {
      await requestFeatureJson(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'PATCH', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addCalculation', receiptId }),
      }, requireRecord, featureAuthenticatedFetch);
      if (!controller.signal.aborted) onAdded();
    } catch (attachError) {
      if (!controller.signal.aborted) setError(attachError instanceof Error ? attachError.message : '계산을 추가하지 못했습니다.');
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPendingId(null);
    }
  };

  const choices = records ? selectableCalculations(records, attachedIds) : null;

  return (
    <FeatureDialog label="프로젝트에 계산 추가" busy={pendingId !== null} onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">프로젝트에 계산 추가</h3>
        <button type="button" aria-label="계산 추가 닫기" disabled={pendingId !== null} onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-tertiary)]">
          <X className="h-5 w-5 text-[var(--text-secondary)]" />
        </button>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
      {!choices && !error && <p role="status" className="text-sm text-[var(--text-secondary)]">저장된 계산을 불러오고 있습니다.</p>}
      {choices && choices.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          추가할 수 있는 저장된 계산이 없습니다.{' '}
          <Link href="/calc" className="font-medium text-blue-700 underline">계산기에서 새로 계산하기</Link>
        </p>
      )}
      {choices && choices.length > 0 && (
        <ul className="space-y-2">
          {choices.map((record) => (
            <li key={record.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-default)] p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{CALCULATOR_NAMES[record.calcId]?.name ?? record.calcId}</p>
                <p className="text-xs text-[var(--text-secondary)]">{new Date(record.calculatedAt).toLocaleString('ko-KR')}</p>
              </div>
              <button type="button" disabled={pendingId !== null} onClick={() => { void attach(record.id); }}
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {pendingId === record.id ? '추가 중...' : '추가'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </FeatureDialog>
  );
}
