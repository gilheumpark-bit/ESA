/**
 * Quality-first drawing calibration across GPT-5.5 and GPT-5.6 variants.
 *
 * Default: the 17 supported model/effort cells on the intermediate public
 * wiring drawing. Results are written after every cell so a stopped run can
 * be continued with --resume without silently changing configuration.
 *
 *   node scripts/run-drawing-effort-calibration.mjs
 *   node scripts/run-drawing-effort-calibration.mjs --resume
 *   node scripts/run-drawing-effort-calibration.mjs --models=terra --efforts=max
 *   node scripts/run-drawing-effort-calibration.mjs --tiers=beginner,advanced
 *   node scripts/run-drawing-effort-calibration.mjs --aggregate-only
 *
 * 역할별 추론 프로필 A/B (기본값은 프로필 없음 = 모든 역할이 같은 effort):
 *   node scripts/run-drawing-effort-calibration.mjs --models=terra --efforts=high
 *   node scripts/run-drawing-effort-calibration.mjs --models=terra --efforts=high  *     --profile='{"symbols":"low","text":"low"}'
 * 두 실행의 영수증은 프로필 라벨로 파일이 갈리므로 서로 덮어쓰지 않는다.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Agent } from 'undici';

import {
  CALIBRATION_DURATION_LIMIT_MS,
  CALIBRATION_EFFORTS,
  CALIBRATION_MODELS,
  buildDrawingCalibrationPlan,
  calibrationProfileLabel,
  calibrationQualityGate,
  parseCalibrationEffortProfile,
  isCalibrationDurationWithinLimit,
  selectCalibrationValues,
} from './lib/drawing-calibration-plan.mjs';
import { reasoningStageEvidenceFromDocument } from './lib/local-drawing-receipt.mjs';
import { comparisonStatusForReceipts } from './lib/drawing-model-comparison.mjs';
import { scoreDrawingLabelEvidence } from './lib/drawing-model-score.mjs';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3010';
const HTTP_TIMEOUT_MS = 660_000;
const httpAgent = new Agent({
  headersTimeout: HTTP_TIMEOUT_MS,
  bodyTimeout: HTTP_TIMEOUT_MS,
});

const CASES = {
  beginner: {
    id: 'public-wiki',
    file: 'fixtures/drawings/external/wiki-oneline.png',
    mime: 'image/png',
    description: '초급 · 공개 단선도 · 발전기-변압기-차단기-리액터 관계',
    expected: {
      symbolTypes: { transformer: 1, generator: 1, breaker: 6, reactor: 1 },
      minRelations: 13,
    },
  },
  intermediate: {
    id: 'public-wiring',
    file: 'fixtures/drawings/external/wiring-real-sm.jpg',
    mime: 'image/jpeg',
    description: '중급 · 공개 3상 결선도 · QS1과 FU1~FU6(퓨즈 15개)',
    expected: {
      symbolTypes: { transformer: 0, generator: 0, breaker: 0, switch: 1, fuse: 15 },
      minRelations: 15,
    },
  },
  advanced: {
    id: 'kimm-p5',
    file: 'fixtures/drawings/realworld/raster/kimm-20210602-design-p5-raster.png',
    mime: 'image/png',
    description: '고급 · KIMM 공개 건축전기 수변전 단선결선도(EE-003)',
    // 변압기 정답 정정(2026-08-05): 3 → 4. 원본 래스터를 잘라 육안 확인했다.
    // MOLD TR-1·2·3 외에 DC반의 `DOWN TR 380/110V 3∅ 10KVA` 가 Δ-Y 심볼로
    // 실재한다. 종전 3 은 MOLD 계열만 세어 이 한 대를 빠뜨렸고, 정답을 맞게
    // 읽은 실행이 오히려 오답으로 채점됐다.
    // 육각형 `TR` 마커(도면 참조 콜아웃)와 표의 `TR FL&FAN`(피더 이름)은
    // 기기가 아니므로 세지 않는다.
    expected: {
      symbolTypes: { transformer: 4, generator: 0 },
      minimumSymbolTypes: { breaker: 9 },
      minRelations: 12,
    },
  },
};

function argValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function selected(record, name, defaults = Object.keys(record)) {
  const raw = argValue(name);
  if (!raw) return defaults;
  const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
  const allowed = Array.isArray(record) ? record : Object.keys(record);
  const unknown = values.filter((value) => !allowed.includes(value));
  if (unknown.length > 0) throw new Error(`지원하지 않는 ${name}: ${unknown.join(', ')}`);
  return values;
}

function gitSnapshot() {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const status = execFileSync('git', ['status', '--porcelain=v1', '-z']);
  const diff = execFileSync('git', ['diff', '--binary', 'HEAD']);
  const changeHash = createHash('sha256').update(status).update(diff);
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'])
    .toString('utf8').split('\0').filter(Boolean);
  for (const path of untracked) {
    if (!existsSync(path)) continue;
    changeHash.update(path).update(readFileSync(path));
  }
  return { revision, dirty: status.length > 0, changeHash: changeHash.digest('hex') };
}

function receiptPath(modelId, effort, tier, profileLabel) {
  return `test-results/drawing-calibration-${modelId}-${effort}-${tier}-${profileLabel}.json`;
}

function summarizeDocument(document, expected) {
  const reasoning = reasoningStageEvidenceFromDocument(document, { expected });
  const recognition = reasoning.stages.find((stage) => stage.id === 'symbol-text-adjudication');
  const spatial = reasoning.stages.find((stage) => stage.id === 'spatial-reconciliation');
  const scores = scoreDrawingLabelEvidence({
    actualSymbolTypes: recognition?.evidence?.actualSymbolTypes ?? {},
    relations: spatial?.evidence?.relations ?? 0,
  }, expected);
  const pages = Array.isArray(document.pages) ? document.pages : [];
  return {
    reasoning,
    verdict: reasoning.summary?.overall ?? 'UNKNOWN',
    scores,
    vlmCalls: pages.reduce((sum, page) => sum + Number(page.vlmCalls ?? 0), 0),
    finalStatus: document.verification?.documentStatus ?? document.jobStatus ?? 'UNKNOWN',
    actualProvider: document.verification?.productionFingerprint?.provider ?? null,
    actualModel: document.verification?.productionFingerprint?.model ?? null,
    actualEffort: document.verification?.productionFingerprint?.effort ?? null,
    symbols: recognition?.evidence?.symbols ?? 0,
    texts: recognition?.evidence?.texts ?? 0,
    relations: spatial?.evidence?.relations ?? 0,
  };
}

function baseReceipt(cell, drawing, sourceSha256, durationMs, snapshot) {
  return {
    schemaVersion: 1,
    modelId: cell.modelId,
    tier: cell.tier,
    provider: cell.provider,
    requestedModel: cell.model,
    requestedEffort: cell.effort,
    requestedEffortProfile: effortProfile ?? null,
    effortProfileLabel: profileLabel,
    source: drawing.file,
    sourceSha256,
    description: drawing.description,
    expected: drawing.expected,
    durationMs,
    durationWithinLimit: isCalibrationDurationWithinLimit(durationMs),
    workspaceSnapshot: snapshot,
    recordedAt: new Date().toISOString(),
  };
}

async function runCell(baseUrl, cell, snapshot) {
  const drawing = CASES[cell.tier];
  const bytes = readFileSync(drawing.file);
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: drawing.mime }), drawing.file.split('/').pop());
  form.set('provider', cell.provider);
  form.set('model', cell.model);
  form.set('effort', cell.effort);
  if (effortProfile) form.set('effortProfile', JSON.stringify(effortProfile));
  form.set('pages', 'all');
  form.set('maxVlmCalls', '120');

  const started = Date.now();
  let response;
  try {
    response = await fetch(`${baseUrl}/api/drawing-jobs`, {
      method: 'POST',
      headers: { Origin: baseUrl },
      body: form,
      dispatcher: httpAgent,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch (error) {
    const receipt = baseReceipt(cell, drawing, sourceSha256, Date.now() - started, snapshot);
    return {
      ...receipt,
      status: 'ERROR',
      error: error instanceof Error
        ? `${error.message}${error.cause?.code ? ` (${error.cause.code})` : ''}`
        : 'unknown request error',
    };
  }

  const durationMs = Date.now() - started;
  const receipt = baseReceipt(cell, drawing, sourceSha256, durationMs, snapshot);
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok || !payload?.data?.document) {
    return {
      ...receipt,
      status: 'ERROR',
      httpStatus: response.status,
      error: String(payload?.error?.message ?? `HTTP ${response.status}`).slice(0, 300),
    };
  }

  const document = payload.data.document;
  const summary = summarizeDocument(document, drawing.expected);
  const configurationMatched = summary.actualModel?.split(',').includes(cell.model)
    && summary.actualEffort === cell.effort;
  const result = {
    ...receipt,
    status: configurationMatched ? 'COMPLETE' : 'CONFIGURATION_MISMATCH',
    configurationMatched,
    ...summary,
    document,
  };
  return { ...result, calibrationGate: calibrationQualityGate(result) };
}

const baseUrl = argValue('base') ?? DEFAULT_BASE_URL;
const modelIds = selected(CALIBRATION_MODELS, 'models');
const efforts = selectCalibrationValues(argValue('efforts'), CALIBRATION_EFFORTS);
const effortProfile = parseCalibrationEffortProfile(argValue('profile'));
const profileLabel = calibrationProfileLabel(effortProfile);
const tiers = selected(CASES, 'tiers', ['intermediate']);
const resume = process.argv.includes('--resume');
const aggregateOnly = process.argv.includes('--aggregate-only');
const snapshot = gitSnapshot();
const plan = buildDrawingCalibrationPlan({ models: modelIds, efforts, tiers });
mkdirSync('test-results', { recursive: true });

const results = [];
for (const cell of plan.cells) {
  const out = receiptPath(cell.modelId, cell.effort, cell.tier, profileLabel);
  if (aggregateOnly) {
    if (!existsSync(out)) throw new Error(`집계할 영수증이 없습니다: ${out}`);
    let prior = JSON.parse(readFileSync(out, 'utf8'));
    if (prior.document) {
      prior = {
        ...prior,
        ...summarizeDocument(prior.document, CASES[cell.tier].expected),
        durationWithinLimit: isCalibrationDurationWithinLimit(prior.durationMs),
        evaluationSnapshot: snapshot,
        regradedAt: new Date().toISOString(),
      };
      prior.calibrationGate = calibrationQualityGate(prior);
      writeFileSync(out, JSON.stringify(prior, null, 2));
    }
    prior.verdict ??= prior.reasoning?.summary?.overall ?? prior.finalStatus ?? 'UNKNOWN';
    results.push(prior);
    continue;
  }

  if (resume && existsSync(out)) {
    const prior = JSON.parse(readFileSync(out, 'utf8'));
    const currentSha = createHash('sha256').update(readFileSync(CASES[cell.tier].file)).digest('hex');
    if (
      prior.status === 'COMPLETE'
      && prior.requestedModel === cell.model
      && prior.requestedEffort === cell.effort
      && (prior.effortProfileLabel ?? 'uniform') === profileLabel
      && prior.sourceSha256 === currentSha
      && prior.workspaceSnapshot?.revision === snapshot.revision
      && prior.workspaceSnapshot?.changeHash === snapshot.changeHash
    ) {
      console.log(`재사용 ${cell.modelId.padEnd(6)} ${cell.effort.padEnd(6)} ${cell.tier.padEnd(12)} ${prior.status}`);
      results.push(prior);
      continue;
    }
  }

  console.log(`실행   ${cell.modelId.padEnd(6)} ${cell.effort.padEnd(6)} ${cell.tier.padEnd(12)} ${cell.label}`);
  const receipt = await runCell(baseUrl, cell, snapshot);
  writeFileSync(out, JSON.stringify(receipt, null, 2));
  const score = receipt.scores?.labelAccuracyPct;
  console.log(
    `결과   ${receipt.status.padEnd(22)} ${Math.round(receipt.durationMs / 1000)}s`
    + `${score === undefined ? '' : ` · 라벨 ${score}%`}`
    + `${receipt.scores?.relationCoveragePct === undefined ? '' : ` · 관계 ${receipt.scores.relationCoveragePct}%`}`
    + `${receipt.vlmCalls === undefined ? '' : ` · 호출 ${receipt.vlmCalls}`}`,
  );
  results.push(receipt);
}

const comparison = comparisonStatusForReceipts(results);
const aggregate = {
  schemaVersion: 1,
  calibrationPolicy: {
    efforts: CALIBRATION_EFFORTS,
    lunaMinimumEffort: 'high',
    durationLimitMs: CALIBRATION_DURATION_LIMIT_MS,
    durationRanking: 'PASS_FAIL_ONLY',
    defaultTiers: ['intermediate'],
  },
  baseUrl,
  workspaceSnapshot: snapshot,
  recordedAt: new Date().toISOString(),
  aggregateOnly,
  requested: { modelIds, efforts, tiers, effortProfile: effortProfile ?? null, effortProfileLabel: profileLabel },
  skipped: plan.skipped,
  resultSnapshotHashes: comparison.snapshotHashes,
  comparison,
  cases: Object.fromEntries(tiers.map((tier) => [tier, CASES[tier]])),
  models: Object.fromEntries(modelIds.map((id) => [id, CALIBRATION_MODELS[id]])),
  results: results.map(({ document: _document, ...result }) => result),
};
writeFileSync('test-results/drawing-effort-calibration.json', JSON.stringify(aggregate, null, 2));

if (!comparison.valid) {
  console.warn(`\n비교 보류: ${comparison.reason} (${comparison.snapshotHashes.join(', ')})`);
}

// `판독누락` 은 기호·연결·문자·논리 역할 손실만 센다. 감사기는 파생 판정이라
// 별도 칸(`감사`)에 둔다 — 없음/미해결/무응답.
console.log('\n모델    추론    난이도         라벨  관계  시간     한도  판독누락  감사    실패  후보  품질');
for (const result of results) {
  const gate = result.calibrationGate ?? calibrationQualityGate(result);
  const audit = gate.auditReceiptMissing ? '무응답' : gate.auditUnresolved ? '미해결' : '해소';
  console.log(
    `${result.modelId.padEnd(8)}${result.requestedEffort.padEnd(8)}${result.tier.padEnd(15)}`
    + `${String(result.scores?.labelAccuracyPct ?? '-').padStart(3)}%  `
    + `${String(result.scores?.relationCoveragePct ?? '-').padStart(3)}%  `
    + `${String(Math.round(result.durationMs / 1000)).padStart(4)}s  `
    + `${String(result.durationWithinLimit ? 'PASS' : 'FAIL').padStart(4)}  `
    + `${String(gate.missingCoreRoles.length).padStart(8)}  `
    + `${audit.padEnd(6)}  `
    + `${String(gate.failedRoleCalls).padStart(4)}  `
    + `${String(gate.eligible ? 'YES' : 'NO').padStart(4)}  ${result.verdict ?? 'UNKNOWN'}`,
  );
}
console.log('\n영수증: test-results/drawing-effort-calibration.json');

await httpAgent.close();

if (results.some((result) => result.status === 'ERROR' || result.status === 'CONFIGURATION_MISMATCH')) {
  process.exitCode = 1;
}
