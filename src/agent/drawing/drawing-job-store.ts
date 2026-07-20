/**
 * In-process job store for document analysis.
 * Source bytes are never persisted here (AC-14).
 */

import type { DocumentBudget, DrawingDocumentV3, JobStatus } from './types-v3';

export interface DrawingJobRecord {
  jobId: string;
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
  error?: string;
  vlmCallsUsed: number;
}

const jobs = new Map<string, DrawingJobRecord>();

export function createJob(input: {
  documentHash: string;
  budget: DocumentBudget;
  estimatedPages: number;
}): DrawingJobRecord {
  const jobId = `job-${input.documentHash.slice(0, 12)}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const record: DrawingJobRecord = {
    jobId,
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
  };
  jobs.set(jobId, record);
  return record;
}

export function getJob(jobId: string): DrawingJobRecord | undefined {
  return jobs.get(jobId);
}

export function updateJob(jobId: string, patch: Partial<DrawingJobRecord>): DrawingJobRecord | undefined {
  const cur = jobs.get(jobId);
  if (!cur) return undefined;
  const next = {
    ...cur,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  jobs.set(jobId, next);
  return next;
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
