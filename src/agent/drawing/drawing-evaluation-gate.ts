import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { DrawingDocumentV3 } from './types-v3';
import { shouldActivateVerified95, type EvalResult } from './sld-evaluator-v2';

const MAX_RECEIPT_BYTES = 16 * 1024 * 1024;
const MAX_KEY_BYTES = 64 * 1024;
const EVALUATION_ROOT = join(process.cwd(), 'data', 'sld-evaluation');

export function applyEvaluationSuiteBadge(
  document: DrawingDocumentV3,
  suite: EvalResult,
  publicKeyPem: string,
  requiredStrata: string[],
): DrawingDocumentV3 {
  const verified = shouldActivateVerified95(suite, document.verification.productionFingerprint!, {
    publicKeyPem,
    requiredStrata,
    realAdjudicated: suite.receipt.datasetKind === 'real-adjudicated',
  });
  if (!verified) {
    return {
      ...document,
      verification: { ...document.verification, verified95: false, verified95Receipt: undefined },
    };
  }
  return {
    ...document,
    verification: {
      ...document.verification,
      verified95: true,
      verified95Receipt: {
        datasetHash: suite.datasetHash,
        labelHash: suite.labelHash,
        predictionHash: suite.predictionHash,
        engineVersion: suite.receipt.engineVersion,
        promptVersion: suite.receipt.promptVersion,
        preprocessVersion: suite.receipt.preprocessVersion,
        evaluatorVersion: suite.receipt.evaluatorVersion,
        metrics: { ...suite.metrics },
        strata: Object.fromEntries(Object.entries(suite.strata).map(([key, metrics]) => [key, { ...metrics }])),
        provider: suite.receipt.provider,
        model: suite.receipt.model,
        runCount: suite.receipt.runCount,
        signatureAlgorithm: 'ed25519',
        keyFingerprint: suite.receipt.keyFingerprint,
        signedAt: suite.receipt.signedAt,
        signature: suite.receipt.signature,
      },
    },
  };
}

function safeWorkspacePath(candidate: string): string {
  if (!candidate || isAbsolute(candidate)) throw new Error('EVAL_GATE_PATH_INVALID');
  const target = resolve(EVALUATION_ROOT, candidate);
  const fromRoot = relative(EVALUATION_ROOT, target);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error('EVAL_GATE_PATH_INVALID');
  return target;
}

async function readBounded(path: string, maximum: number): Promise<string> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new Error('EVAL_GATE_FILE_INVALID');
  return readFile(path, 'utf8');
}

/** Missing or invalid external evidence always leaves the badge off. */
export async function applyConfiguredEvaluationSuiteBadge(
  document: DrawingDocumentV3,
): Promise<DrawingDocumentV3> {
  const receiptPath = process.env.SLD_V3_EVAL_RECEIPT_PATH?.trim();
  const publicKeyPath = process.env.SLD_V3_EVAL_PUBLIC_KEY_PATH?.trim();
  const requiredStrata = (process.env.SLD_V3_EVAL_REQUIRED_STRATA ?? '')
    .split(',').map((item) => item.trim()).filter(Boolean);
  if (!receiptPath || !publicKeyPath || requiredStrata.length === 0 || !document.verification.productionFingerprint) return document;
  try {
    const [receiptRaw, publicKeyPem] = await Promise.all([
      readBounded(safeWorkspacePath(receiptPath), MAX_RECEIPT_BYTES),
      readBounded(safeWorkspacePath(publicKeyPath), MAX_KEY_BYTES),
    ]);
    const suite = JSON.parse(receiptRaw) as EvalResult;
    return applyEvaluationSuiteBadge(document, suite, publicKeyPem, requiredStrata);
  } catch {
    return { ...document, verification: { ...document.verification, verified95: false, verified95Receipt: undefined } };
  }
}
