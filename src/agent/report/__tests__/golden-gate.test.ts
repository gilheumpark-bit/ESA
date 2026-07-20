import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = resolve(process.cwd(), 'scripts/sld-golden-gate.mjs');

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

function setup(options: { prediction?: Record<string, unknown>; kind?: string; claimEligible?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sld-golden-'));
  const receipt = join(root, 'receipt.json');
  writeFileSync(join(root, 'labels.json'), '{"label":"fixture"}\n', 'utf8');
  if (options.prediction) {
    writeFileSync(join(root, 'predictions.json'), `${JSON.stringify(options.prediction)}\n`, 'utf8');
  }
  writeFileSync(join(root, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    revision: 'test-revision',
    claimEligible: options.claimEligible ?? false,
    datasets: [{
      id: 'fixture',
      kind: options.kind ?? 'synthetic',
      labels: 'labels.json',
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
    const fixture = setup({ prediction: { schemaVersion: 1, metrics: metrics(0.5) } });
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
    const fixture = setup({ prediction: { schemaVersion: 1, metrics: metrics() } });
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
      prediction: { schemaVersion: 1, metrics: metrics() },
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
});
