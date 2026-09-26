/**
 * Drawing job repository. A configured absolute DRAWING_JOB_STORE_DIR uses
 * atomic JSON records on a shared durable volume; process memory is allowed
 * only by the application's explicit development/sandbox storage policy.
 * Source bytes are never stored in job records (AC-14).
 */

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { allowEphemeralStorage } from '@/lib/storage-policy';
import type { DocumentBudget, DrawingDocumentV3, JobStatus } from './types-v3';

export interface DrawingJobRecord {
  jobId: string;
  ownerId: string;
  status: JobStatus;
  documentHash: string;
  createdAt: string;
  updatedAt: string;
  budget: DocumentBudget;
  estimated: {
    pages: number;
    maxVlmCalls: number;
    costRangeNote: string;
  };
  pageDigests: Record<number, {
    pageRenderHash: string;
    model?: string;
    provider?: string;
    effort?: import('@/lib/drawing-reasoning-effort').DrawingReasoningEffort;
    /** 역할별 추론 단계의 정규 문자열. 프로필이 없으면 undefined. */
    effortProfile?: string;
    promptVersion: string;
    preprocessVersion: string;
    graphVersion: string;
    complete: boolean;
  }>;
  document?: DrawingDocumentV3;
  sourceLease?: { leaseId: string; expiresAt: number };
  sourceMetadata?: {
    mimeType: string;
    fileName?: string;
    requestedPages: number[] | 'all';
    /** 고객사 심볼 라이브러리 — deferred/resume 실행에서 원 요청과 동일 적용 */
    symbolLibrary?: import('@/engine/topology/symbol-library').SymbolLibrary;
  };
  error?: string;
  vlmCallsUsed: number;
  cancelRequested: boolean;
  runLease?: { id: string; expiresAt: number };
}

const processState = globalThis as typeof globalThis & {
  __esaDrawingJobs?: Map<string, DrawingJobRecord>;
};
const jobs = processState.__esaDrawingJobs ??= new Map<string, DrawingJobRecord>();

function durableRoot(): string | null {
  const configured = process.env.DRAWING_JOB_STORE_DIR?.trim();
  if (!configured || !isAbsolute(configured)) return null;
  const root = resolve(configured);
  mkdirSync(join(root, 'jobs'), { recursive: true });
  return root;
}

export function isDrawingJobStoreAvailable(): boolean {
  return durableRoot() !== null || allowEphemeralStorage();
}

function safeJobPath(root: string, jobId: string): string {
  if (!/^job-[a-zA-Z0-9_-]+$/.test(jobId)) throw new Error('DRAWING_JOB_ID_INVALID');
  return join(root, 'jobs', `${jobId}.json`);
}

function readDurableJob(root: string, jobId: string): DrawingJobRecord | undefined {
  try {
    return JSON.parse(readFileSync(safeJobPath(root, jobId), 'utf8')) as DrawingJobRecord;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw cause;
  }
}

function writeDurableJob(root: string, record: DrawingJobRecord): void {
  const destination = safeJobPath(root, record.jobId);
  const temporary = `${destination}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(temporary, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, destination);
}

const JOB_LOCK_STALE_MS = 30_000;

function withJobLock<T>(root: string, jobId: string, operation: () => T): T {
  const lockPath = `${safeJobPath(root, jobId)}.lock`;
  let acquired = false;
  const waitCell = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      mkdirSync(lockPath);
      acquired = true;
      break;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > JOB_LOCK_STALE_MS) {
          rmdirSync(lockPath);
          continue;
        }
      } catch (recoveryCause) {
        if ((recoveryCause as NodeJS.ErrnoException).code === 'ENOENT') continue;
        if ((recoveryCause as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw recoveryCause;
      }
      Atomics.wait(waitCell, 0, 0, 4);
    }
  }
  if (!acquired) throw new Error('DRAWING_JOB_LOCK_TIMEOUT');
  try {
    return operation();
  } finally {
    rmdirSync(lockPath);
  }
}

function requireRepository(): string | null {
  const root = durableRoot();
  if (!root && !allowEphemeralStorage()) throw new Error('DRAWING_JOB_STORE_UNAVAILABLE');
  return root;
}

export function createJob(input: {
  documentHash: string;
  ownerId: string;
  budget: DocumentBudget;
  estimatedPages: number;
}): DrawingJobRecord {
  const root = requireRepository();
  if (!input.ownerId.trim()) throw new Error('DRAWING_JOB_OWNER_REQUIRED');
  const jobId = `job-${input.documentHash.slice(0, 12)}-${randomBytes(8).toString('base64url')}`;
  const now = new Date().toISOString();
  const record: DrawingJobRecord = {
    jobId,
    ownerId: input.ownerId,
    status: 'QUEUED',
    documentHash: input.documentHash,
    createdAt: now,
    updatedAt: now,
    budget: input.budget,
    estimated: {
      pages: input.estimatedPages,
      maxVlmCalls: input.budget.maxVlmCalls,
      costRangeNote: `최대 ${input.budget.maxVlmCalls} VLM 호출 · ${input.estimatedPages} 페이지 · 예산 초과 시 PARTIAL`,
    },
    pageDigests: {},
    vlmCallsUsed: 0,
    cancelRequested: false,
  };
  if (root) writeDurableJob(root, record);
  else jobs.set(jobId, record);
  return record;
}

export function getJob(jobId: string): DrawingJobRecord | undefined {
  const root = requireRepository();
  return root ? readDurableJob(root, jobId) : jobs.get(jobId);
}

export function getOwnedJob(jobId: string, ownerId: string): DrawingJobRecord | undefined {
  const job = getJob(jobId);
  return job?.ownerId === ownerId ? job : undefined;
}

export function updateJob(jobId: string, patch: Partial<DrawingJobRecord>, expectedRunId?: string): DrawingJobRecord | undefined {
  const root = requireRepository();
  const apply = (cur: DrawingJobRecord | undefined): DrawingJobRecord | undefined => {
    if (!cur) return undefined;
    if (expectedRunId !== undefined && (cur.runLease?.id !== expectedRunId || cur.runLease.expiresAt <= Date.now())) throw new Error('DRAWING_RUN_LEASE_LOST');
    const effectivePatch = cur.cancelRequested && patch.cancelRequested !== false && patch.status && patch.status !== 'CANCELLED'
      ? { ...patch, status: 'CANCELLED' as const }
      : patch;
    return { ...cur, ...effectivePatch, updatedAt: new Date().toISOString() };
  };
  if (root) {
    return withJobLock(root, jobId, () => {
      const next = apply(readDurableJob(root, jobId));
      if (next) writeDurableJob(root, next);
      return next;
    });
  }
  const next = apply(jobs.get(jobId));
  if (next) jobs.set(jobId, next);
  return next;
}

export function updateOwnedJob(
  jobId: string,
  ownerId: string,
  patch: Partial<Omit<DrawingJobRecord, 'jobId' | 'ownerId' | 'documentHash'>>,
): DrawingJobRecord | undefined {
  if (!getOwnedJob(jobId, ownerId)) return undefined;
  return updateJob(jobId, patch);
}

/** Compare-and-swap update used by user corrections to prevent lost updates. */
export function updateOwnedJobIfDocumentVersion(
  jobId: string,
  ownerId: string,
  expectedUpdatedAt: string,
  patch: Partial<Omit<DrawingJobRecord, 'jobId' | 'ownerId' | 'documentHash'>>,
): DrawingJobRecord | undefined {
  const root = requireRepository();
  if (root) {
    return withJobLock(root, jobId, () => {
      const current = readDurableJob(root, jobId);
      if (current?.ownerId !== ownerId
        || !current.document
        || !['COMPLETE', 'PARTIAL'].includes(current.status)
        || current.document.updatedAt !== expectedUpdatedAt) return undefined;
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      writeDurableJob(root, next);
      return next;
    });
  }
  const current = getOwnedJob(jobId, ownerId);
  if (!current?.document
    || !['COMPLETE', 'PARTIAL'].includes(current.status)
    || current.document.updatedAt !== expectedUpdatedAt) return undefined;
  return updateJob(jobId, patch);
}

export function cancelOwnedJob(jobId: string, ownerId: string): boolean {
  const job = getOwnedJob(jobId, ownerId);
  if (!job) return false;
  return Boolean(updateJob(jobId, { status: 'CANCELLED', cancelRequested: true }));
}

export const DRAWING_RUN_LEASE_MS = 90_000;
const ACTIVE_RUN_STATUSES: readonly JobStatus[] = ['ENUMERATING', 'SURVEYING', 'ANALYZING_PAGES', 'RESCANNING_GAPS', 'RECONCILING_PAGES', 'SYNTHESIZING'];

/** Reclaim only an expired execution. A fresh fencing token invalidates every previous writer. */
export function claimOwnedJobRun(jobId: string, ownerId: string, allowedStatuses: JobStatus[]): DrawingJobRecord | undefined {
  const root = requireRepository();
  const claim = (job: DrawingJobRecord | undefined): DrawingJobRecord | undefined => {
    if (!job || job.ownerId !== ownerId || job.cancelRequested) return undefined;
    const stale = ACTIVE_RUN_STATUSES.includes(job.status) && (job.runLease
      ? job.runLease.expiresAt <= Date.now()
      : Date.parse(job.updatedAt) + DRAWING_RUN_LEASE_MS <= Date.now());
    if (!allowedStatuses.includes(job.status) && !stale) return undefined;
    if (job.runLease && job.runLease.expiresAt > Date.now()) return undefined;
    return { ...job, status: 'ENUMERATING', cancelRequested: false, error: undefined,
      runLease: { id: randomBytes(18).toString('base64url'), expiresAt: Date.now() + DRAWING_RUN_LEASE_MS },
      updatedAt: new Date().toISOString() };
  };
  if (root) return withJobLock(root, jobId, () => {
    const next = claim(readDurableJob(root, jobId));
    if (next) writeDurableJob(root, next);
    return next;
  });
  const next = claim(jobs.get(jobId));
  if (next) jobs.set(jobId, next);
  return next;
}

export function heartbeatOwnedJobRun(jobId: string, ownerId: string, runId: string): boolean {
  const current = getOwnedJob(jobId, ownerId);
  if (!current || current.cancelRequested) return false;
  try { return Boolean(updateJob(jobId, { runLease: { id: runId, expiresAt: Date.now() + DRAWING_RUN_LEASE_MS } }, runId)); }
  catch { return false; }
}

export function finishOwnedJobRun(jobId: string, ownerId: string, runId: string, patch: Partial<DrawingJobRecord> = {}): boolean {
  if (!getOwnedJob(jobId, ownerId)) return false;
  try { return Boolean(updateJob(jobId, { ...patch, runLease: undefined }, runId)); }
  catch { return false; }
}

export function canReusePage(
  job: DrawingJobRecord,
  pageIndex: number,
  fingerprint: {
    documentHash: string;
    pageRenderHash: string;
    promptVersion: string;
    preprocessVersion: string;
    graphVersion: string;
    model?: string;
    provider?: string;
    effort?: import('@/lib/drawing-reasoning-effort').DrawingReasoningEffort;
    effortProfile?: string;
  },
): boolean {
  if (job.documentHash !== fingerprint.documentHash) return false;
  const prev = job.pageDigests[pageIndex];
  if (!prev?.complete) return false;
  return prev.pageRenderHash === fingerprint.pageRenderHash
    && prev.promptVersion === fingerprint.promptVersion
    && prev.preprocessVersion === fingerprint.preprocessVersion
    && prev.graphVersion === fingerprint.graphVersion
    && prev.model === fingerprint.model
    && prev.provider === fingerprint.provider
    && prev.effort === fingerprint.effort
    && prev.effortProfile === fingerprint.effortProfile;
}

export function nextPendingRequestedPage(job: DrawingJobRecord): number | undefined {
  const requested = job.sourceMetadata?.requestedPages;
  const ordered = requested === 'all'
    ? Array.from({ length: job.estimated.pages }, (_, index) => index)
    : Array.isArray(requested)
      ? [...new Set(requested)].sort((left, right) => left - right)
      : [];
  const finished = new Set((job.document?.pages ?? [])
    .filter((page) => page.status === 'complete' || page.status === 'skipped-empty')
    .map((page) => page.pageIndex));
  const states = new Map((job.document?.pages ?? []).map((page) => [page.pageIndex, page.status]));
  // A permanent HOLD on an early page must not starve later unvisited pages.
  return ordered.find((pageIndex) => !states.has(pageIndex) || states.get(pageIndex) === 'pending')
    ?? ordered.find((pageIndex) => !finished.has(pageIndex));
}

/** Test helper */
export function _resetJobsForTests(): void {
  jobs.clear();
}
