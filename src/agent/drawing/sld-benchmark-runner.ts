/**
 * Runs production analysis path on golden fixtures and writes prediction JSON.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runDocumentAnalysis } from './document-orchestrator';
import { evaluatePredictionAgainstLabel, type GoldenLabel } from './sld-evaluator-v2';
import type { DrawingDocumentV3 } from './types-v3';

export interface BenchmarkCase {
  id: string;
  bytes: ArrayBuffer;
  mimeType: string;
  fileName?: string;
  label: GoldenLabel;
  seedDetections?: Parameters<typeof runDocumentAnalysis>[0]['seedDetections'];
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
    requestedPages: 'all',
  });
  const evalResult = evaluatePredictionAgainstLabel(document, c.label, {
    datasetId: c.id,
  });
  return { prediction: document, eval: evalResult };
}

export async function runBenchmarkSuite(
  cases: BenchmarkCase[],
  outDir?: string,
): Promise<Array<{ id: string; passes: boolean; failedMetrics: string[] }>> {
  const results: Array<{ id: string; passes: boolean; failedMetrics: string[] }> = [];
  if (outDir && !existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const c of cases) {
    const { prediction, eval: ev } = await runBenchmarkCase(c);
    if (outDir) {
      writeFileSync(
        join(outDir, `${c.id}.prediction.json`),
        JSON.stringify(prediction, null, 2),
        'utf8',
      );
      writeFileSync(
        join(outDir, `${c.id}.eval.json`),
        JSON.stringify(ev, null, 2),
        'utf8',
      );
    }
    results.push({
      id: c.id,
      passes: ev.passesAllThresholds,
      failedMetrics: ev.failedMetrics,
    });
  }
  return results;
}
