/**
 * In-process job store for document analysis.
 * Source bytes are never persisted here (AC-14).
 */

import { randomBytes } from 'node:crypto';

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

export function createJob(input: {
  documentHash: string;
  ownerId: string;
  budget: DocumentBudget;
  estimatedPages: number;
}): DrawingJobRecord {
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
  jobs.set(jobId, record);
  return record;
}

export function getJob(jobId: string): DrawingJobRecord | undefined {
  return jobs.get(jobId);
}

export function getOwnedJob(jobId: string, ownerId: string): DrawingJobRecord | undefined {
  const job = jobs.get(jobId);
  return job?.ownerId === ownerId ? job : undefined;
}

export function updateJob(jobId: string, patch: Partial<DrawingJobRecord>): DrawingJobRecord | undefined {
  const cur = jobs.get(jobId);
  if (!cur) return undefined;
  const effectivePatch = cur.cancelRequested && patch.cancelRequested !== false && patch.status && patch.status !== 'CANCELLED'
    ? { ...patch, status: 'CANCELLED' as const }
    : patch;
  const next = {
    ...cur,
    ...effectivePatch,
    updatedAt: new Date().toISOString(),
  };
  jobs.set(jobId, next);
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

export function cancelOwnedJob(jobId: string, ownerId: string): boolean {
  const job = getOwnedJob(jobId, ownerId);
  if (!job) return false;
  updateJob(jobId, { status: 'CANCELLED', cancelRequested: true });
  return true;
}

/** Atomically prevents duplicate run/resume requests for the same in-process job. */
export function claimOwnedJobRun(
  jobId: string,
  ownerId: string,
  allowedStatuses: JobStatus[],
): DrawingJobRecord | undefined {
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
