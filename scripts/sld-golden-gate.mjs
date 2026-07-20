#!/usr/bin/env node
/**
 * Exit non-zero if any required SLD golden metric is below threshold
 * or if eval JSON contains injectedMetrics.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'fixtures/drawings/golden/evals';
if (!existsSync(dir)) {
  console.error(`[sld-golden-gate] missing dir: ${dir}`);
  console.error('No golden evals yet — gate holds verified95 (exit 2).');
  process.exit(2);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.eval.json'));
if (files.length === 0) {
  console.error('[sld-golden-gate] no *.eval.json');
  process.exit(2);
}

let failed = 0;
for (const f of files) {
  const raw = readFileSync(join(dir, f), 'utf8');
  const json = JSON.parse(raw);
  if (json.injectedMetrics) {
    console.error(`[sld-golden-gate] REJECT injectedMetrics in ${f}`);
    failed++;
    continue;
  }
  if (!json.passesAllThresholds) {
    console.error(`[sld-golden-gate] FAIL ${f}: ${JSON.stringify(json.failedMetrics)}`);
    failed++;
  } else {
    console.log(`[sld-golden-gate] PASS ${f}`);
  }
}

process.exit(failed === 0 ? 0 : 1);
