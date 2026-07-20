import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = resolve(process.cwd(), 'scripts/sld-golden-gate.mjs');
const EVALUATOR_VERSION = 'sld-golden-evaluator-v1';
const KEY_PAIR = generateKeyPairSync('ed25519');
const PUBLIC_KEY_PEM = KEY_PAIR.publicKey.export({ type: 'spki', format: 'pem' });
const PUBLIC_KEY_FINGERPRINT = createHash('sha256').update(PUBLIC_KEY_PEM).digest('hex');

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

function singleFileEvidenceHash(name: string, body: string): string {
  return createHash('sha256').update(name).update('\0').update(body).update('\0').digest('hex');
}

function metrics(value = 1) {
  return {
    symbolMacroF1: value,
    textFieldAccuracy: value,
    edgeF1: value,
    junctionAccuracy: value,
    criticalLogicRecall: value,
    unsupportedPassCount: 0,
    claimTraceability: value,
  };
}

function setup(options: {
  predictionMetrics?: Record<string, unknown>;
  kind?: string;
  claimEligible?: boolean;
  unsigned?: boolean;
  emptyLabels?: boolean;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sld-golden-'));
  const receipt = join(root, 'receipt.json');
  const labelsPath = options.emptyLabels ? 'labels' : 'labels.json';
  const labelBody = '{"label":"fixture"}\n';
  if (options.emptyLabels) mkdirSync(join(root, labelsPath));
  else writeFileSync(join(root, labelsPath), labelBody, 'utf8');
  const kind = options.kind ?? 'synthetic';
  if (options.predictionMetrics) {
    const claim = {
      schemaVersion: 2,
      datasetId: 'fixture',
      datasetKind: kind,
      manifestRevision: 'test-revision',
      evaluatorVersion: EVALUATOR_VERSION,
      labelsHash: options.emptyLabels
        ? createHash('sha256').digest('hex')
        : singleFileEvidenceHash(labelsPath, labelBody),
      metrics: options.predictionMetrics,
    };
    const signature = sign(null, Buffer.from(canonicalize(claim)), KEY_PAIR.privateKey).toString('base64');
    writeFileSync(join(root, 'predictions.json'), `${JSON.stringify({
      ...claim,
      ...(options.unsigned ? {} : { attestation: { algorithm: 'ed25519', signature } }),
    })}\n`, 'utf8');
  }
  writeFileSync(
    join(root, 'public.pem'),
    PUBLIC_KEY_PEM,
    'utf8',
  );
  writeFileSync(join(root, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    revision: 'test-revision',
    claimEligible: options.claimEligible ?? false,
    datasets: [{
      id: 'fixture',
      kind,
      labels: labelsPath,
      predictions: 'predictions.json',
    }],
    thresholds: {
      symbolMacroF1: 0.95,
      textFieldAccuracy: 0.95,
      edgeF1: 0.95,
      junctionAccuracy: 0.98,
      criticalLogicRecall: 0.95,
      unsupportedPassCount: 0,
      claimTraceability: 1,
    },
  })}\n`, 'utf8');
  return { root, receipt };
}

function run(root: string, receipt: string, mode: 'receipt' | 'enforce') {
  return spawnSync(process.execPath, [
    SCRIPT,
    `--mode=${mode}`,
    '--manifest=manifest.json',
    `--receipt=${receipt}`,
    '--public-key=public.pem',
    `--expected-key-sha256=${PUBLIC_KEY_FINGERPRINT}`,
  ], { cwd: root, encoding: 'utf8' });
}

describe('SLD golden receipt and enforcement boundary', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('writes a non-claiming receipt but fails enforcement when predictions are missing', () => {
    const fixture = setup();
    roots.push(fixture.root);

    const observed = run(fixture.root, fixture.receipt, 'receipt');
    expect(observed.status).toBe(0);
    const receipt = JSON.parse(readFileSync(fixture.receipt, 'utf8'));
    expect(receipt).toMatchObject({
      thresholdsPassed: false,
      verified95: false,
      expectedDatasetIds: ['fixture'],
      datasetsEvaluated: [],
    });
    expect(receipt.failures).toEqual(expect.arrayContaining([
      'PREDICTION_MISSING:fixture',
      'NO_PREDICTION_DATA',
    ]));

    const enforced = run(fixture.root, fixture.receipt, 'enforce');
    expect(enforced.status).toBe(1);
  });

  it('fails a present but degraded prediction in both receipt content and enforcement', () => {
    const fixture = setup({ predictionMetrics: metrics(0.5) });
    roots.push(fixture.root);

    const result = run(fixture.root, fixture.receipt, 'enforce');
    expect(result.status).toBe(1);
    const receipt = JSON.parse(readFileSync(fixture.receipt, 'utf8'));
    expect(receipt.thresholdsPassed).toBe(false);
    expect(receipt.failures).toEqual(expect.arrayContaining(['symbolMacroF1', 'claimTraceability']));
    expect(receipt.datasetsEvaluated[0]).toEqual(expect.objectContaining({
      id: 'fixture',
      labelsHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      predictionsHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it('never verifies a synthetic-only manifest even when all numeric thresholds pass', () => {
    const fixture = setup({ predictionMetrics: metrics() });
    roots.push(fixture.root);

    const result = run(fixture.root, fixture.receipt, 'enforce');
    expect(result.status).toBe(1);
    const receipt = JSON.parse(readFileSync(fixture.receipt, 'utf8'));
    expect(receipt).toMatchObject({ thresholdsPassed: true, hasAdjudicatedRealData: false, verified95: false });
    expect(receipt.failures).toEqual(expect.arrayContaining([
      'MANIFEST_NOT_CLAIM_ELIGIBLE',
      'NO_REAL_ADJUDICATED_DATASET',
    ]));
  });

  it('verifies only a complete claim-eligible real-adjudicated dataset', () => {
    const fixture = setup({
      predictionMetrics: metrics(),
      kind: 'real-adjudicated',
      claimEligible: true,
    });
    roots.push(fixture.root);

    const result = run(fixture.root, fixture.receipt, 'enforce');
    expect(result.status).toBe(0);
    const receipt = JSON.parse(readFileSync(fixture.receipt, 'utf8'));
    expect(receipt).toMatchObject({
      thresholdsPassed: true,
      hasAdjudicatedRealData: true,
      verified95: true,
      failures: [],
    });
  });

  it('rejects a stale signed prediction after labels change', () => {
    const fixture = setup({ predictionMetrics: metrics(), kind: 'real-adjudicated', claimEligible: true });
    roots.push(fixture.root);
    writeFileSync(join(fixture.root, 'labels.json'), '{"label":"changed"}\n', 'utf8');

    const result = run(fixture.root, fixture.receipt, 'enforce');
    expect(result.status).toBe(1);
    const receipt = JSON.parse(readFileSync(fixture.receipt, 'utf8'));
    expect(receipt.verified95).toBe(false);
    expect(receipt.failures).toContain('PREDICTION_INVALID:fixture');
  });

  it('rejects empty adjudication evidence and unsigned self-reported metrics', () => {
    const empty = setup({ predictionMetrics: metrics(), kind: 'real-adjudicated', claimEligible: true, emptyLabels: true });
    const unsigned = setup({ predictionMetrics: metrics(), kind: 'real-adjudicated', claimEligible: true, unsigned: true });
    roots.push(empty.root, unsigned.root);

    expect(run(empty.root, empty.receipt, 'enforce').status).toBe(1);
    expect(JSON.parse(readFileSync(empty.receipt, 'utf8')).failures).toContain('LABELS_EMPTY:fixture');
    expect(run(unsigned.root, unsigned.receipt, 'enforce').status).toBe(1);
    expect(JSON.parse(readFileSync(unsigned.receipt, 'utf8')).failures).toContain('PREDICTION_INVALID:fixture');
  });

  it('does not read dataset evidence outside the gate workspace', () => {
    const fixture = setup({ predictionMetrics: metrics(), kind: 'real-adjudicated', claimEligible: true });
    roots.push(fixture.root);
    const manifest = JSON.parse(readFileSync(join(fixture.root, 'manifest.json'), 'utf8'));
    manifest.datasets[0].labels = resolve(fixture.root, '..', 'outside-labels.json');
    writeFileSync(join(fixture.root, 'manifest.json'), `${JSON.stringify(manifest)}\n`, 'utf8');

    const result = run(fixture.root, fixture.receipt, 'enforce');
    expect(result.status).toBe(1);
    const receipt = JSON.parse(readFileSync(fixture.receipt, 'utf8'));
    expect(receipt.verified95).toBe(false);
    expect(receipt.failures).toContain('LABELS_INVALID:fixture');
  });
});
