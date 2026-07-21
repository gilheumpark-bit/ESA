'use server';

import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { verifyGoldenGateReceiptSignature } from './metrics';

const EVALUATOR_VERSION = 'sld-golden-evaluator-v1';
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const METRIC_KEYS = ['symbolMacroF1', 'textFieldAccuracy', 'edgeF1', 'junctionAccuracy', 'criticalLogicRecall', 'unsupportedPassCount', 'claimTraceability'] as const;
const RATIO_METRIC_KEYS = METRIC_KEYS.filter((key) => key !== 'unsupportedPassCount');
const MAX_PREDICTION_BYTES = 16 * 1024 * 1024;
const MAX_HASHED_FILES = 20_000;
const MAX_HASHED_BYTES = 512 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 50_000;
const MAX_DIRECTORY_DEPTH = 32;
const MAX_DATASET_PATH_LENGTH = 1_024;
type GateReason = 'VERIFIED' | 'MISSING_INPUT' | 'RECEIPT_INVALID' | 'SIGNATURE_INVALID' | 'MANIFEST_MISMATCH' | 'DATASET_MISMATCH' | 'METRICS_INVALID' | 'STALE_RECEIPT' | 'NO_REAL_ADJUDICATED_DATASET';

export interface GoldenGateVerification {
  verified95: boolean;
  reason: GateReason;
}

function safePath(root: string, candidate: string, fallback: string): string {
  const selected = candidate || fallback;
  if (isAbsolute(selected)) throw new Error('unsafe path');
  const target = resolve(/* turbopackIgnore: true */ root, selected);
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
  if (Object.keys(value).sort().join('|') !== [...METRIC_KEYS].sort().join('|')) return false;
  if (!RATIO_METRIC_KEYS.every((key) => (
    typeof thresholds[key] === 'number'
    && Number.isFinite(thresholds[key])
    && (thresholds[key] as number) >= 0
    && (thresholds[key] as number) <= 1
  ))) return false;
  if (
    !Number.isSafeInteger(thresholds.unsupportedPassCount)
    || (thresholds.unsupportedPassCount as number) < 0
  ) return false;
  return METRIC_KEYS.every((key) => {
    const metric = value[key];
    const threshold = thresholds[key];
    if (key === 'unsupportedPassCount') {
      return typeof metric === 'number'
        && Number.isSafeInteger(metric)
        && metric >= 0
        && typeof threshold === 'number'
        && metric <= threshold;
    }
    return typeof metric === 'number'
      && Number.isFinite(metric)
      && metric >= 0
      && metric <= 1
      && typeof threshold === 'number'
      && metric >= threshold;
  });
}

async function safeExistingDatasetPath(root: string, candidate: string): Promise<string> {
  if (candidate.length === 0 || candidate.length > MAX_DATASET_PATH_LENGTH) throw new Error('unsafe path');
  const target = safePath(root, candidate, '');
  const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
  const fromRoot = relative(realRoot, realTarget);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error('unsafe path');
  return target;
}

async function readBoundedRegularFile(path: string, maximumBytes: number): Promise<Buffer> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile() || info.size > maximumBytes) throw new Error('invalid file');
  return readFile(/* turbopackIgnore: true */ path);
}

async function hashEvidencePath(target: string): Promise<string> {
  const hash = createHash('sha256');
  let files = 0;
  let bytes = 0;
  let entries = 0;
  const targetInfo = await lstat(target);
  if (targetInfo.isSymbolicLink()) throw new Error('invalid evidence');
  const evidenceRoot = targetInfo.isDirectory() ? target : dirname(target);

  async function visit(path: string, depth: number): Promise<void> {
    if (depth > MAX_DIRECTORY_DEPTH) throw new Error('invalid evidence');
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error('invalid evidence');
    if (info.isDirectory()) {
      const children = (await readdir(/* turbopackIgnore: true */ path))
        .sort((left, right) => left.localeCompare(right, 'en'));
      entries += children.length;
      if (entries > MAX_DIRECTORY_ENTRIES) throw new Error('invalid evidence');
      for (const child of children) {
        await visit(resolve(/* turbopackIgnore: true */ path, child), depth + 1);
      }
      return;
    }
    if (!info.isFile()) throw new Error('invalid evidence');
    files += 1;
    bytes += info.size;
    if (files > MAX_HASHED_FILES || bytes > MAX_HASHED_BYTES) throw new Error('invalid evidence');
    const body = await readFile(/* turbopackIgnore: true */ path);
    hash.update(relative(evidenceRoot, path).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(body);
    hash.update('\0');
  }

  await visit(target, 0);
  if (files === 0) throw new Error('invalid evidence');
  return hash.digest('hex');
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
    const manifestRaw = await readFile(
      /* turbopackIgnore: true */ safePath(root, options.manifestPath ?? '', 'fixtures/drawings/golden/sld-golden-manifest.json'),
      'utf8',
    );
    const receiptRaw = await readFile(
      /* turbopackIgnore: true */ safePath(root, options.receiptPath ?? '', 'test-results/sld-golden-gate.json'),
      'utf8',
    );
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
    if (signedExpected.size !== expected.size) return fail('DATASET_MISMATCH');
    for (const [datasetId, dataset] of expected) {
      const signedDataset = signedExpected.get(datasetId);
      if (!signedDataset) return fail('DATASET_MISMATCH');
      const labelsPath = await safeExistingDatasetPath(root, dataset.labels as string);
      const predictionsPath = await safeExistingDatasetPath(root, dataset.predictions as string);
      const [labelsHash, predictionsBuffer] = await Promise.all([
        hashEvidencePath(labelsPath),
        readBoundedRegularFile(predictionsPath, MAX_PREDICTION_BYTES),
      ]);
      const predictionsHash = createHash('sha256').update(predictionsBuffer).digest('hex');
      if (signedDataset.labelsHash !== labelsHash || signedDataset.predictionsHash !== predictionsHash) {
        return fail('DATASET_MISMATCH');
      }
    }
    const evaluatedIds = new Set<string>();
    for (const dataset of receipt.datasetsEvaluated) {
      if (!isRecord(dataset) || typeof dataset.id !== 'string') return fail('DATASET_MISMATCH');
      if (evaluatedIds.has(dataset.id)) return fail('DATASET_MISMATCH');
      evaluatedIds.add(dataset.id);
      const manifestDataset = expected.get(dataset.id);
      const signedDataset = signedExpected.get(dataset.id);
      if (!manifestDataset || !signedDataset || dataset.kind !== manifestDataset.kind || dataset.kind !== signedDataset.kind || dataset.labelsHash !== signedDataset.labelsHash || dataset.predictionsHash !== signedDataset.predictionsHash || dataset.evaluatorVersion !== EVALUATOR_VERSION || dataset.attestationVerified !== true) return fail('DATASET_MISMATCH');
      if (!validMetrics(dataset.metrics, manifest.thresholds as Record<string, unknown>)) return fail('METRICS_INVALID');
    }
    if (evaluatedIds.size !== expected.size || expectedIds.some((id) => !evaluatedIds.has(id))) {
      return fail('DATASET_MISMATCH');
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
