import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const GATE_IMPLEMENTATION_VERSION = 'sld-golden-gate-v2';
const LOWER_BOUND_KEYS = [
  'symbolMacroF1',
  'textFieldAccuracy',
  'edgeF1',
  'junctionAccuracy',
  'criticalLogicRecall',
  'claimTraceability',
];
const METRIC_KEYS = [...LOWER_BOUND_KEYS, 'unsupportedPassCount'];
const MAX_HASHED_FILES = 20_000;
const MAX_HASHED_BYTES = 512 * 1024 * 1024;

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function assertManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid golden manifest.');
  if (manifest.schemaVersion !== 1 || typeof manifest.revision !== 'string' || manifest.revision.length === 0) {
    throw new Error('Invalid golden manifest identity.');
  }
  if (typeof manifest.claimEligible !== 'boolean' || !Array.isArray(manifest.datasets) || manifest.datasets.length === 0) {
    throw new Error('Invalid golden manifest datasets.');
  }
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
  async function visit(path, root) {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error('Golden evidence paths may not contain symbolic links.');
    if (info.isDirectory()) {
      const entries = (await readdir(path)).sort((left, right) => left.localeCompare(right, 'en'));
      for (const entry of entries) await visit(resolve(path, entry), root);
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
  await visit(target, root);
  return hash.digest('hex');
}

function errorCode(error) {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}

const root = process.cwd();
const mode = arg('mode', 'receipt');
if (!['receipt', 'enforce'].includes(mode)) throw new Error('mode must be receipt or enforce.');
const manifestPath = resolve(root, arg('manifest', 'fixtures/drawings/golden/sld-golden-manifest.json'));
const receiptPath = resolve(root, arg('receipt', 'test-results/sld-golden-gate.json'));
const manifestRaw = await readFile(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);
assertManifest(manifest);

const failures = [];
const rows = [];
const expectedDatasets = [];
for (const dataset of [...manifest.datasets].sort((left, right) => left.id.localeCompare(right.id, 'en'))) {
  const labelsPath = resolve(root, dataset.labels);
  const predictionsPath = resolve(root, dataset.predictions);
  let labelsHash = null;
  let predictionsHash = null;
  try {
    labelsHash = await hashEvidencePath(labelsPath);
  } catch (error) {
    failures.push(`${errorCode(error) === 'ENOENT' ? 'LABELS_MISSING' : 'LABELS_INVALID'}:${dataset.id}`);
  }
  let prediction = null;
  try {
    const predictionRaw = await readFile(predictionsPath, 'utf8');
    predictionsHash = createHash('sha256').update(predictionRaw).digest('hex');
    const payload = JSON.parse(predictionRaw);
    if (payload.schemaVersion !== 1) throw new Error('Unsupported prediction schema.');
    prediction = validateMetrics(payload.metrics, dataset.id);
  } catch (error) {
    failures.push(`${errorCode(error) === 'ENOENT' ? 'PREDICTION_MISSING' : 'PREDICTION_INVALID'}:${dataset.id}`);
  }
  expectedDatasets.push({
    id: dataset.id,
    kind: dataset.kind,
    labels: dataset.labels,
    predictions: dataset.predictions,
    labelsHash,
    predictionsHash,
  });
  if (labelsHash && predictionsHash && prediction) {
    rows.push({ id: dataset.id, kind: dataset.kind, labelsHash, predictionsHash, metrics: prediction });
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
const uniqueFailures = [...new Set(failures)];
const verified95 = manifest.claimEligible === true
  && hasAdjudicatedRealData
  && thresholdsPassed
  && uniqueFailures.length === 0;

const receipt = {
  schemaVersion: 2,
  gateImplementationVersion: GATE_IMPLEMENTATION_VERSION,
  manifestRevision: manifest.revision,
  manifestHash: createHash('sha256').update(manifestRaw).digest('hex'),
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
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

if (mode === 'enforce' && !verified95) process.exitCode = 1;
