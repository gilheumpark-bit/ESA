'use server';

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { verifyGoldenGateReceiptSignature } from './metrics';

const EVALUATOR_VERSION = 'sld-golden-evaluator-v1';
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const METRIC_KEYS = ['symbolMacroF1', 'textFieldAccuracy', 'edgeF1', 'junctionAccuracy', 'criticalLogicRecall', 'unsupportedPassCount', 'claimTraceability'] as const;
type GateReason = 'VERIFIED' | 'MISSING_INPUT' | 'RECEIPT_INVALID' | 'SIGNATURE_INVALID' | 'MANIFEST_MISMATCH' | 'DATASET_MISMATCH' | 'METRICS_INVALID' | 'STALE_RECEIPT' | 'NO_REAL_ADJUDICATED_DATASET';

export interface GoldenGateVerification {
  verified95: boolean;
  reason: GateReason;
}

function safePath(root: string, candidate: string, fallback: string): string {
  const selected = candidate || fallback;
  if (isAbsolute(selected)) throw new Error('unsafe path');
  const target = resolve(root, selected);
  const fromRoot = relative(root, target);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error('unsafe path');
  return target;
}

function fail(reason: Exclude<GateReason, 'VERIFIED'>): GoldenGateVerification {
  return { verified95: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validMetrics(value: unknown, thresholds: Record<string, unknown>): boolean {
  if (!isRecord(value)) return false;
  return METRIC_KEYS.every((key) => {
    const metric = value[key];
    const threshold = thresholds[key];
    if (key === 'unsupportedPassCount') return typeof metric === 'number' && Number.isSafeInteger(metric) && typeof threshold === 'number' && metric <= threshold;
    return typeof metric === 'number' && Number.isFinite(metric) && typeof threshold === 'number' && metric >= threshold;
  });
}

export async function verifyCurrentGoldenGate(options: {
  root?: string;
  manifestPath?: string;
  receiptPath?: string;
  publicKeyPem?: string;
  now?: number;
  maxAgeMs?: number;
} = {}): Promise<GoldenGateVerification> {
  try {
    if (!options.publicKeyPem) return fail('MISSING_INPUT');
    const root = options.root ?? process.cwd();
    const manifestRaw = await readFile(safePath(root, options.manifestPath ?? '', 'fixtures/drawings/golden/sld-golden-manifest.json'), 'utf8');
    const receiptRaw = await readFile(safePath(root, options.receiptPath ?? '', 'test-results/sld-golden-gate.json'), 'utf8');
    const manifest = JSON.parse(manifestRaw) as unknown;
    const receipt = JSON.parse(receiptRaw) as unknown;
    if (!isRecord(manifest) || !isRecord(receipt)) return fail('RECEIPT_INVALID');
    if (!verifyGoldenGateReceiptSignature(receipt, options.publicKeyPem)) return fail('SIGNATURE_INVALID');
    const currentHash = createHash('sha256').update(manifestRaw).digest('hex');
    if (manifest.schemaVersion !== 1 || manifest.claimEligible !== true || receipt.schemaVersion !== 4 || receipt.manifestHash !== currentHash || receipt.manifestRevision !== manifest.revision || receipt.verified95 !== true || receipt.thresholdsPassed !== true) return fail('MANIFEST_MISMATCH');
    if (receipt.evaluatorVersion !== EVALUATOR_VERSION) return fail('METRICS_INVALID');
    const generatedAt = typeof receipt.generatedAt === 'string' ? Date.parse(receipt.generatedAt) : Number.NaN;
    const age = (options.now ?? Date.now()) - generatedAt;
    if (!Number.isFinite(generatedAt) || age < 0 || age > (options.maxAgeMs ?? DEFAULT_MAX_AGE_MS)) return fail('STALE_RECEIPT');
    if (!Array.isArray(manifest.datasets) || !Array.isArray(receipt.expectedDatasets) || !Array.isArray(receipt.datasetsEvaluated)) return fail('DATASET_MISMATCH');
    const expected = new Map<string, Record<string, unknown>>();
    for (const dataset of manifest.datasets) {
      if (!isRecord(dataset) || typeof dataset.id !== 'string' || typeof dataset.kind !== 'string' || typeof dataset.labels !== 'string' || typeof dataset.predictions !== 'string') return fail('DATASET_MISMATCH');
      expected.set(dataset.id, dataset);
    }
    const receiptDatasets = receipt.expectedDatasets;
    const expectedIds = [...expected.keys()].sort();
    if (!Array.isArray(receipt.expectedDatasetIds) || expected.size === 0 || expected.size !== receiptDatasets.length || expected.size !== receipt.datasetsEvaluated.length || expected.size !== manifest.datasets.length || JSON.stringify([...receipt.expectedDatasetIds].sort()) !== JSON.stringify(expectedIds)) return fail('DATASET_MISMATCH');
    const signedExpected = new Map<string, Record<string, unknown>>();
    for (const dataset of receiptDatasets) {
      if (!isRecord(dataset) || typeof dataset.id !== 'string') return fail('DATASET_MISMATCH');
      const manifestDataset = expected.get(dataset.id);
      if (!manifestDataset || dataset.kind !== manifestDataset.kind || dataset.labels !== manifestDataset.labels || dataset.predictions !== manifestDataset.predictions || typeof dataset.labelsHash !== 'string' || !/^[a-f0-9]{64}$/.test(dataset.labelsHash) || typeof dataset.predictionsHash !== 'string' || !/^[a-f0-9]{64}$/.test(dataset.predictionsHash)) return fail('DATASET_MISMATCH');
      signedExpected.set(dataset.id, dataset);
    }
    for (const dataset of receipt.datasetsEvaluated) {
      if (!isRecord(dataset) || typeof dataset.id !== 'string') return fail('DATASET_MISMATCH');
      const manifestDataset = expected.get(dataset.id);
      const signedDataset = signedExpected.get(dataset.id);
      if (!manifestDataset || !signedDataset || dataset.kind !== manifestDataset.kind || dataset.kind !== signedDataset.kind || dataset.labelsHash !== signedDataset.labelsHash || dataset.predictionsHash !== signedDataset.predictionsHash || dataset.evaluatorVersion !== EVALUATOR_VERSION || dataset.attestationVerified !== true) return fail('DATASET_MISMATCH');
      if (!validMetrics(dataset.metrics, manifest.thresholds as Record<string, unknown>)) return fail('METRICS_INVALID');
    }
    if (!receipt.datasetsEvaluated.some((dataset) => isRecord(dataset) && dataset.kind === 'real-adjudicated') || receipt.hasAdjudicatedRealData !== true) return fail('NO_REAL_ADJUDICATED_DATASET');
    if (!validMetrics(receipt.metrics, manifest.thresholds as Record<string, unknown>)) return fail('METRICS_INVALID');
    return { verified95: true, reason: 'VERIFIED' };
  } catch {
    return fail('RECEIPT_INVALID');
  }
}

export async function isCurrentGoldenGatePassing(options: Parameters<typeof verifyCurrentGoldenGate>[0] = {}): Promise<boolean> {
  return (await verifyCurrentGoldenGate(options)).verified95;
}
