import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const GATE_IMPLEMENTATION_VERSION = 'sld-golden-gate-v4';
const EVALUATOR_VERSION = 'sld-golden-evaluator-v1';
const LOWER_BOUND_KEYS = [
  'symbolMacroF1',
  'textFieldAccuracy',
  'edgeF1',
  'junctionAccuracy',
  'criticalLogicRecall',
  'claimTraceability',
];
const METRIC_KEYS = [...LOWER_BOUND_KEYS, 'unsupportedPassCount'];
const MAX_DATASETS = 100;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_PREDICTION_BYTES = 16 * 1024 * 1024;
const MAX_PUBLIC_KEY_BYTES = 64 * 1024;
const MAX_HASHED_FILES = 20_000;
const MAX_HASHED_BYTES = 512 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 50_000;
const MAX_DIRECTORY_DEPTH = 32;
const MAX_PATH_LENGTH = 1_024;

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function canonicalize(value) {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

async function readBounded(path, maximumBytes) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile() || info.size > maximumBytes) throw new Error('Bounded regular file required.');
  return readFile(path);
}

function safeDatasetPath(root, candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > MAX_PATH_LENGTH || isAbsolute(candidate)) {
    throw new Error('Dataset paths must be bounded workspace-relative paths.');
  }
  const target = resolve(root, candidate);
  const fromRoot = relative(root, target);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error('Dataset path escapes the workspace.');
  }
  return target;
}

function assertManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid golden manifest.');
  if (manifest.schemaVersion !== 1 || typeof manifest.revision !== 'string' || manifest.revision.length === 0) {
    throw new Error('Invalid golden manifest identity.');
  }
  if (
    typeof manifest.claimEligible !== 'boolean'
    || !Array.isArray(manifest.datasets)
    || manifest.datasets.length === 0
    || manifest.datasets.length > MAX_DATASETS
  ) throw new Error('Invalid golden manifest datasets.');
  const ids = new Set();
  for (const dataset of manifest.datasets) {
    if (!dataset || typeof dataset !== 'object' || typeof dataset.id !== 'string' || dataset.id.length === 0 || ids.has(dataset.id)) {
      throw new Error('Golden dataset IDs must be unique non-empty strings.');
    }
    ids.add(dataset.id);
    if (!['synthetic', 'real-adjudicated'].includes(dataset.kind)) throw new Error(`Invalid dataset kind: ${dataset.id}`);
    if (typeof dataset.labels !== 'string' || dataset.labels.length === 0 || typeof dataset.predictions !== 'string' || dataset.predictions.length === 0) {
      throw new Error(`Invalid dataset paths: ${dataset.id}`);
    }
  }
  if (!manifest.thresholds || typeof manifest.thresholds !== 'object') throw new Error('Invalid golden thresholds.');
  for (const key of LOWER_BOUND_KEYS) {
    const value = manifest.thresholds[key];
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`Invalid threshold: ${key}`);
  }
  if (!Number.isSafeInteger(manifest.thresholds.unsupportedPassCount) || manifest.thresholds.unsupportedPassCount < 0) {
    throw new Error('Invalid threshold: unsupportedPassCount');
  }
}

function validateMetrics(value, datasetId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid metrics payload: ${datasetId}`);
  const keys = Object.keys(value).sort();
  if (keys.join('|') !== [...METRIC_KEYS].sort().join('|')) throw new Error(`Invalid metric fields: ${datasetId}`);
  for (const key of LOWER_BOUND_KEYS) {
    if (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1) throw new Error(`Invalid metric ${key}: ${datasetId}`);
  }
  if (!Number.isSafeInteger(value.unsupportedPassCount) || value.unsupportedPassCount < 0) {
    throw new Error(`Invalid metric unsupportedPassCount: ${datasetId}`);
  }
  return Object.fromEntries(METRIC_KEYS.map((key) => [key, value[key]]));
}

async function hashEvidencePath(target) {
  const hash = createHash('sha256');
  let files = 0;
  let bytes = 0;
  let entries = 0;
  async function visit(path, root, depth) {
    if (depth > MAX_DIRECTORY_DEPTH) throw new Error('Golden evidence exceeds the directory depth budget.');
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error('Golden evidence paths may not contain symbolic links.');
    if (info.isDirectory()) {
      const children = (await readdir(path)).sort((left, right) => left.localeCompare(right, 'en'));
      entries += children.length;
      if (entries > MAX_DIRECTORY_ENTRIES) throw new Error('Golden evidence exceeds the directory entry budget.');
      for (const child of children) await visit(resolve(path, child), root, depth + 1);
      return;
    }
    if (!info.isFile()) throw new Error('Golden evidence paths must contain regular files.');
    files += 1;
    bytes += info.size;
    if (files > MAX_HASHED_FILES || bytes > MAX_HASHED_BYTES) throw new Error('Golden evidence exceeds the hashing budget.');
    const body = await readFile(path);
    hash.update(relative(root, path).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(body);
    hash.update('\0');
  }
  const info = await lstat(target);
  const root = info.isDirectory() ? target : dirname(target);
  await visit(target, root, 0);
  return { hash: hash.digest('hex'), fileCount: files, byteCount: bytes };
}

function validatePrediction(payload, dataset, manifestRevision, manifestHash, labelsHash, publicKey) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid prediction payload.');
  const allowedKeys = ['attestation', 'datasetId', 'datasetKind', 'evaluatorVersion', 'labelsHash', 'manifestHash', 'manifestRevision', 'metrics', 'schemaVersion'];
  if (Object.keys(payload).sort().join('|') !== allowedKeys.sort().join('|')) throw new Error('Invalid prediction fields.');
  if (
    payload.schemaVersion !== 2
    || payload.datasetId !== dataset.id
    || payload.datasetKind !== dataset.kind
    || payload.manifestRevision !== manifestRevision
    || payload.manifestHash !== manifestHash
    || payload.evaluatorVersion !== EVALUATOR_VERSION
    || payload.labelsHash !== labelsHash
  ) throw new Error('Prediction binding does not match current evidence.');
  const metrics = validateMetrics(payload.metrics, dataset.id);
  const attestation = payload.attestation;
  if (
    !attestation
    || typeof attestation !== 'object'
    || Array.isArray(attestation)
    || Object.keys(attestation).sort().join('|') !== 'algorithm|signature'
    || attestation.algorithm !== 'ed25519'
    || typeof attestation.signature !== 'string'
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(attestation.signature)
  ) throw new Error('Prediction attestation is missing or malformed.');
  const signature = Buffer.from(attestation.signature, 'base64');
  if (signature.length !== 64) throw new Error('Prediction attestation has an invalid length.');
  const claim = {
    schemaVersion: 2,
    datasetId: dataset.id,
    datasetKind: dataset.kind,
    manifestRevision,
    manifestHash,
    evaluatorVersion: EVALUATOR_VERSION,
    labelsHash,
    metrics,
  };
  if (!publicKey || !verify(null, Buffer.from(canonicalize(claim)), publicKey, signature)) {
    throw new Error('Prediction attestation could not be verified.');
  }
  return { metrics, evaluatorVersion: EVALUATOR_VERSION, attestationVerified: true };
}

function errorCode(error) {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}

const root = process.cwd();
const mode = arg('mode', 'receipt');
if (!['receipt', 'enforce'].includes(mode)) throw new Error('mode must be receipt or enforce.');
const manifestPath = resolve(root, arg('manifest', 'fixtures/drawings/golden/sld-golden-manifest.json'));
const receiptPath = resolve(root, arg('receipt', 'test-results/sld-golden-gate.json'));
const manifestBuffer = await readBounded(manifestPath, MAX_MANIFEST_BYTES);
const manifestRaw = manifestBuffer.toString('utf8');
const manifest = JSON.parse(manifestRaw);
assertManifest(manifest);
const manifestHash = createHash('sha256').update(manifestBuffer).digest('hex');

const failures = [];
let publicKey = null;
let attestationKeyFingerprint = null;
const publicKeyArgument = arg('public-key', process.env.SLD_GOLDEN_ATTESTATION_PUBLIC_KEY_PATH ?? '');
const expectedKeyFingerprint = arg('expected-key-sha256', process.env.SLD_GOLDEN_ATTESTATION_KEY_SHA256 ?? '');
if (publicKeyArgument && /^[a-f0-9]{64}$/.test(expectedKeyFingerprint)) {
  try {
    const publicKeyBody = await readBounded(resolve(root, publicKeyArgument), MAX_PUBLIC_KEY_BYTES);
    publicKey = createPublicKey(publicKeyBody);
    attestationKeyFingerprint = createHash('sha256')
      .update(publicKey.export({ type: 'spki', format: 'der' }))
      .digest('hex');
    if (attestationKeyFingerprint !== expectedKeyFingerprint) throw new Error('Attestation key fingerprint mismatch.');
  } catch {
    publicKey = null;
    failures.push('ATTESTATION_KEY_INVALID');
  }
} else {
  failures.push('ATTESTATION_KEY_MISSING');
}

let receiptSigningKey = null;
let receiptSigningKeyFailure = 'RECEIPT_SIGNING_KEY_MISSING';
const receiptSigningKeyArgument = arg(
  'receipt-signing-key',
  process.env.SLD_GOLDEN_RECEIPT_SIGNING_PRIVATE_KEY_PATH ?? '',
);
if (receiptSigningKeyArgument) {
  try {
    const privateKeyBody = await readBounded(resolve(root, receiptSigningKeyArgument), MAX_PUBLIC_KEY_BYTES);
    const candidateSigningKey = createPrivateKey(privateKeyBody);
    const signingPublicKey = createPublicKey(candidateSigningKey);
    const signingKeyFingerprint = createHash('sha256')
      .update(signingPublicKey.export({ type: 'spki', format: 'der' }))
      .digest('hex');
    if (!attestationKeyFingerprint || signingKeyFingerprint !== attestationKeyFingerprint) {
      throw new Error('Receipt signing key does not match the pinned attestation key.');
    }
    receiptSigningKey = candidateSigningKey;
    receiptSigningKeyFailure = null;
  } catch {
    receiptSigningKeyFailure = 'RECEIPT_SIGNING_KEY_INVALID';
  }
}

const rows = [];
const expectedDatasets = [];
for (const dataset of [...manifest.datasets].sort((left, right) => left.id.localeCompare(right.id, 'en'))) {
  let labelsPath;
  let predictionsPath;
  let labelsResult = null;
  let predictionsHash = null;
  try {
    labelsPath = safeDatasetPath(root, dataset.labels);
    predictionsPath = safeDatasetPath(root, dataset.predictions);
    labelsResult = await hashEvidencePath(labelsPath);
    if (labelsResult.fileCount === 0 || labelsResult.byteCount === 0) {
      failures.push(`LABELS_EMPTY:${dataset.id}`);
      labelsResult = null;
    }
  } catch (error) {
    failures.push(`${errorCode(error) === 'ENOENT' ? 'LABELS_MISSING' : 'LABELS_INVALID'}:${dataset.id}`);
  }
  let prediction = null;
  if (predictionsPath) {
    try {
      const predictionBuffer = await readBounded(predictionsPath, MAX_PREDICTION_BYTES);
      predictionsHash = createHash('sha256').update(predictionBuffer).digest('hex');
      if (!labelsResult) throw new Error('Current labels are unavailable.');
      const payload = JSON.parse(predictionBuffer.toString('utf8'));
      prediction = validatePrediction(
        payload,
        dataset,
        manifest.revision,
        manifestHash,
        labelsResult.hash,
        publicKey,
      );
    } catch (error) {
      failures.push(`${errorCode(error) === 'ENOENT' ? 'PREDICTION_MISSING' : 'PREDICTION_INVALID'}:${dataset.id}`);
    }
  } else {
    failures.push(`PREDICTION_INVALID:${dataset.id}`);
  }
  expectedDatasets.push({
    id: dataset.id,
    kind: dataset.kind,
    labels: dataset.labels,
    predictions: dataset.predictions,
    labelsHash: labelsResult?.hash ?? null,
    labelFileCount: labelsResult?.fileCount ?? 0,
    labelByteCount: labelsResult?.byteCount ?? 0,
    predictionsHash,
  });
  if (labelsResult && predictionsHash && prediction) {
    rows.push({
      id: dataset.id,
      kind: dataset.kind,
      labelsHash: labelsResult.hash,
      labelFileCount: labelsResult.fileCount,
      labelByteCount: labelsResult.byteCount,
      predictionsHash,
      evaluatorVersion: prediction.evaluatorVersion,
      attestationVerified: prediction.attestationVerified,
      metrics: prediction.metrics,
    });
  }
}

if (rows.length === 0) failures.push('NO_PREDICTION_DATA');
const aggregate = rows.length === 0 ? null : Object.fromEntries([
  ...LOWER_BOUND_KEYS.map((key) => [key, Math.min(...rows.map((row) => row.metrics[key]))]),
  ['unsupportedPassCount', rows.reduce((sum, row) => sum + row.metrics.unsupportedPassCount, 0)],
]);
const metricFailures = aggregate === null ? [] : [
  ...LOWER_BOUND_KEYS.filter((key) => aggregate[key] < manifest.thresholds[key]),
  ...(aggregate.unsupportedPassCount > manifest.thresholds.unsupportedPassCount ? ['unsupportedPassCount'] : []),
];
failures.push(...metricFailures);
const completeDatasetSet = rows.length === manifest.datasets.length;
const thresholdsPassed = aggregate !== null && completeDatasetSet && metricFailures.length === 0;
const hasAdjudicatedRealData = rows.some((row) => row.kind === 'real-adjudicated');
if (manifest.claimEligible !== true) failures.push('MANIFEST_NOT_CLAIM_ELIGIBLE');
if (!hasAdjudicatedRealData) failures.push('NO_REAL_ADJUDICATED_DATASET');
const candidateVerified95 = manifest.claimEligible === true
  && hasAdjudicatedRealData
  && thresholdsPassed
  && rows.every((row) => row.attestationVerified)
  && failures.length === 0;
if (candidateVerified95 && !receiptSigningKey) failures.push(receiptSigningKeyFailure);
const uniqueFailures = [...new Set(failures)];
const verified95 = candidateVerified95
  && receiptSigningKey !== null
  && uniqueFailures.length === 0;

const receiptClaim = {
  schemaVersion: 4,
  gateImplementationVersion: GATE_IMPLEMENTATION_VERSION,
  evaluatorVersion: EVALUATOR_VERSION,
  attestationKeyFingerprint,
  manifestRevision: manifest.revision,
  manifestHash,
  generatedAt: new Date().toISOString(),
  expectedDatasetIds: expectedDatasets.map((dataset) => dataset.id),
  expectedDatasets,
  datasetsEvaluated: rows,
  metrics: aggregate,
  failures: uniqueFailures,
  thresholdsPassed,
  hasAdjudicatedRealData,
  verified95,
};
const receipt = verified95
  ? {
      ...receiptClaim,
      receiptAttestation: {
        algorithm: 'ed25519',
        keyFingerprint: attestationKeyFingerprint,
        signature: sign(null, Buffer.from(canonicalize(receiptClaim)), receiptSigningKey).toString('base64'),
      },
    }
  : receiptClaim;
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

if (mode === 'enforce' && !verified95) process.exitCode = 1;
