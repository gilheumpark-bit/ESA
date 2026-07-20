/**
 * Runs production analysis path on golden fixtures and writes prediction JSON.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runDocumentAnalysis } from './document-orchestrator';
import {
  buildEvaluationSuiteResult,
  evaluatePredictionAgainstLabel,
  type EvalResult,
  type EvaluationReceipt,
  type GoldenLabel,
} from './sld-evaluator-v2';
import type { DrawingDocumentV3 } from './types-v3';

export interface BenchmarkCase {
  id: string;
  bytes: ArrayBuffer;
  mimeType: string;
  fileName?: string;
  label: GoldenLabel;
  seedDetections?: Parameters<typeof runDocumentAnalysis>[0]['seedDetections'];
  vision?: Parameters<typeof runDocumentAnalysis>[0]['vision'];
}

export async function runBenchmarkCase(c: BenchmarkCase): Promise<{
  prediction: DrawingDocumentV3;
  eval: ReturnType<typeof evaluatePredictionAgainstLabel>;
}> {
  const { document } = await runDocumentAnalysis({
    bytes: c.bytes,
    mimeType: c.mimeType,
    fileName: c.fileName,
    seedDetections: c.seedDetections,
    vision: c.vision,
    requestedPages: 'all',
  });
  const evalResult = evaluatePredictionAgainstLabel(document, c.label, {
    datasetId: c.id,
  });
  return { prediction: document, eval: evalResult };
}

export async function runBenchmarkSuite(
  cases: BenchmarkCase[],
  options: {
    provider: string;
    model: string;
    datasetKind: EvaluationReceipt['datasetKind'];
    runsPerCase?: number;
    signingPrivateKeyPem?: string;
    outDir?: string;
  },
): Promise<{
  cases: Array<{ id: string; run: number; passes: boolean; failedMetrics: string[] }>;
  suite: EvalResult;
}> {
  if (cases.length === 0) throw new Error('BENCHMARK_CASES_REQUIRED');
  const runsPerCase = options.runsPerCase ?? 3;
  if (!Number.isSafeInteger(runsPerCase) || runsPerCase < 1 || runsPerCase > 20) {
    throw new Error('BENCHMARK_RUN_COUNT_INVALID');
  }
  const results: Array<{ id: string; run: number; passes: boolean; failedMetrics: string[] }> = [];
  const evaluations: EvalResult[] = [];
  const outDir = options.outDir;
  if (outDir && !existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const c of cases) {
    for (let run = 1; run <= runsPerCase; run += 1) {
      const { prediction } = await runBenchmarkCase(c);
      const ev = evaluatePredictionAgainstLabel(prediction, c.label, {
        datasetId: c.id,
        stratum: c.label.stratum,
        datasetKind: options.datasetKind,
        provider: options.provider,
        model: options.model,
      });
      evaluations.push(ev);
      if (outDir) {
        writeFileSync(
          join(outDir, `${c.id}.run-${run}.prediction.json`),
          JSON.stringify(prediction, null, 2),
          'utf8',
        );
        writeFileSync(
          join(outDir, `${c.id}.run-${run}.eval.json`),
          JSON.stringify(ev, null, 2),
          'utf8',
        );
      }
      results.push({ id: c.id, run, passes: ev.passesAllThresholds, failedMetrics: ev.failedMetrics });
    }
  }
  const suite = buildEvaluationSuiteResult(evaluations, {
    provider: options.provider,
    model: options.model,
    datasetKind: options.datasetKind,
    runsPerCase,
    signingPrivateKeyPem: options.signingPrivateKeyPem,
  });
  if (outDir) writeFileSync(join(outDir, 'suite.receipt.json'), JSON.stringify(suite, null, 2), 'utf8');
  return { cases: results, suite };
}
