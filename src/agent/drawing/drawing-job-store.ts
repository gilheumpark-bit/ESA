/**
 * Drawing job repository. A configured absolute DRAWING_JOB_STORE_DIR uses
 * atomic JSON records on a shared durable volume; process memory is allowed
 * only by the application's explicit development/sandbox storage policy.
 * Source bytes are never stored in job records (AC-14).
 */

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
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
  };
  error?: string;
  vlmCallsUsed: number;
  cancelRequested: boolean;
}

const jobs = new Map<string, DrawingJobRecord>();

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

function withJobLock<T>(root: string, jobId: string, operation: () => T): T | undefined {
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
      Atomics.wait(waitCell, 0, 0, 4);
    }
  }
  if (!acquired) return undefined;
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

export function updateJob(jobId: string, patch: Partial<DrawingJobRecord>): DrawingJobRecord | undefined {
  const root = requireRepository();
  const apply = (cur: DrawingJobRecord | undefined): DrawingJobRecord | undefined => {
    if (!cur) return undefined;
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
      if (current?.ownerId !== ownerId || !current.document || current.document.updatedAt !== expectedUpdatedAt) return undefined;
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      writeDurableJob(root, next);
      return next;
    });
  }
  const current = getOwnedJob(jobId, ownerId);
  if (!current?.document || current.document.updatedAt !== expectedUpdatedAt) return undefined;
  return updateJob(jobId, patch);
}

export function cancelOwnedJob(jobId: string, ownerId: string): boolean {
  const job = getOwnedJob(jobId, ownerId);
  if (!job) return false;
  return Boolean(updateJob(jobId, { status: 'CANCELLED', cancelRequested: true }));
}

/** Atomically prevents duplicate run/resume requests for the same in-process job. */
export function claimOwnedJobRun(
  jobId: string,
  ownerId: string,
  allowedStatuses: JobStatus[],
): DrawingJobRecord | undefined {
  const root = requireRepository();
  if (root) {
    return withJobLock(root, jobId, () => {
      const job = readDurableJob(root, jobId);
      if (job?.ownerId !== ownerId || !allowedStatuses.includes(job.status)) return undefined;
      const next = { ...job, status: 'ENUMERATING' as const, cancelRequested: false, error: undefined, updatedAt: new Date().toISOString() };
      writeDurableJob(root, next);
      return next;
    });
  }
  const job = getOwnedJob(jobId, ownerId);
  if (!job || !allowedStatuses.includes(job.status)) return undefined;
  return updateJob(jobId, { status: 'ENUMERATING', cancelRequested: false, error: undefined });
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
    && prev.provider === fingerprint.provider;
}

/** Test helper */
export function _resetJobsForTests(): void {
  jobs.clear();
}
