/**
 * Production V3 drawing benchmark: one fixed beginner/intermediate/advanced
 * drawing per model, all with an explicit high reasoning effort.
 *
 *   node --env-file=.env.local scripts/run-drawing-model-matrix.mjs
 *   node --env-file=.env.local scripts/run-drawing-model-matrix.mjs --tiers=beginner --models=gemini,gpt-terra
 *   node --env-file=.env.local scripts/run-drawing-model-matrix.mjs --resume
 *   node scripts/run-drawing-model-matrix.mjs --aggregate-only
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Agent } from 'undici';

import { reasoningStageEvidenceFromDocument } from './lib/local-drawing-receipt.mjs';
import { comparisonStatusForReceipts } from './lib/drawing-model-comparison.mjs';
import { foldRunSpread, formatSpread } from './lib/drawing-run-spread.mjs';
import { scoreDrawingLabelEvidence } from './lib/drawing-model-score.mjs';

const EFFORT = 'high';
// --profile='{"symbols":"low","text":"low"}' 는 역할별 단계를 덮어써 A/B 를 만든다.
// 서버가 알 수 없는 역할·단계를 400 으로 닫으므로 오타는 조용히 통과하지 않는다.
const EFFORT_PROFILE = process.argv.find((v) => v.startsWith('--profile='))?.slice('--profile='.length) ?? '';
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
    expected: {
      symbolTypes: { transformer: 3, generator: 0 },
      minimumSymbolTypes: { breaker: 9 },
      minRelations: 12,
    },
  },
};

const MODELS = {
  gemini: {
    provider: 'google-agent-platform',
    model: 'gemini-3.6-flash',
    keyEnv: 'GOOGLE_VERTEX_API_KEY',
    label: 'Gemini 3.6 Flash',
  },
  'gpt-terra': {
    provider: 'chatgpt-local',
    model: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
  },
  'gpt-sol': {
    provider: 'chatgpt-local',
    model: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
  },
  claude: {
    provider: 'claude',
    model: 'claude-sonnet-5',
    keyEnv: 'ANTHROPIC_API_KEY',
    label: 'Claude Sonnet 5',
  },
  // 키 없이 사용자의 로그인된 claude CLI 를 쓴다. gpt-* 로컬 항목과 같은 자리.
  'claude-local': {
    provider: 'claude-local',
    model: 'claude-sonnet-5',
    label: 'Claude Sonnet 5 (local CLI)',
  },
};

function argValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function selected(record, name) {
  const raw = argValue(name);
  if (!raw) return Object.keys(record);
  const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
  const unknown = values.filter((value) => !(value in record));
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

// 프로필 A/B 두 실행의 영수증이 같은 파일에 겹치면 비교가 사라진다.
// 프로필 문자열의 해시를 파일명에 넣어 갈라 놓는다.
const PROFILE_SLUG = EFFORT_PROFILE
  ? `-p${createHash('sha256').update(EFFORT_PROFILE).digest('hex').slice(0, 8)}`
  : '';

function receiptPath(modelId, tier) {
  return `test-results/drawing-model-high-${modelId}-${tier}${PROFILE_SLUG}.json`;
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

async function runCell(baseUrl, modelId, tier, snapshot) {
  const modelSpec = MODELS[modelId];
  const drawing = CASES[tier];
  const bytes = readFileSync(drawing.file);
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: drawing.mime }), drawing.file.split('/').pop());
  form.set('provider', modelSpec.provider);
  form.set('model', modelSpec.model);
  form.set('effort', EFFORT);
  if (EFFORT_PROFILE) form.set('effortProfile', EFFORT_PROFILE);
  form.set('pages', 'all');
  form.set('maxVlmCalls', '120');
  if (modelSpec.keyEnv) {
    const key = process.env[modelSpec.keyEnv]?.trim();
    if (!key) throw new Error(`${modelSpec.keyEnv}가 없어 ${modelSpec.label}을 실행할 수 없습니다.`);
    form.set('apiKey', key);
  }

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
    return {
      schemaVersion: 1,
      modelId,
      tier,
      provider: modelSpec.provider,
      requestedModel: modelSpec.model,
      requestedEffort: EFFORT,
      source: drawing.file,
      sourceSha256,
      description: drawing.description,
      expected: drawing.expected,
      durationMs: Date.now() - started,
      status: 'ERROR',
      error: error instanceof Error
        ? `${error.message}${error.cause?.code ? ` (${error.cause.code})` : ''}`
        : 'unknown request error',
      workspaceSnapshot: snapshot,
      recordedAt: new Date().toISOString(),
    };
  }

  const durationMs = Date.now() - started;
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok || !payload?.data?.document) {
    return {
      schemaVersion: 1,
      modelId,
      tier,
      provider: modelSpec.provider,
      requestedModel: modelSpec.model,
      requestedEffort: EFFORT,
      source: drawing.file,
      sourceSha256,
      description: drawing.description,
      expected: drawing.expected,
      durationMs,
      status: 'ERROR',
      httpStatus: response.status,
      error: String(payload?.error?.message ?? `HTTP ${response.status}`).slice(0, 300),
      workspaceSnapshot: snapshot,
      recordedAt: new Date().toISOString(),
    };
  }

  const document = payload.data.document;
  const summary = summarizeDocument(document, drawing.expected);
  const configurationMatched = summary.actualModel?.split(',').includes(modelSpec.model)
    && summary.actualEffort === EFFORT;
  return {
    schemaVersion: 1,
    modelId,
    tier,
    provider: modelSpec.provider,
    requestedModel: modelSpec.model,
    requestedEffort: EFFORT,
    requestedEffortProfile: EFFORT_PROFILE || null,
    source: drawing.file,
    sourceSha256,
    description: drawing.description,
    expected: drawing.expected,
    durationMs,
    status: configurationMatched ? 'COMPLETE' : 'CONFIGURATION_MISMATCH',
    configurationMatched,
    ...summary,
    workspaceSnapshot: snapshot,
    recordedAt: new Date().toISOString(),
    document,
  };
}

const baseUrl = argValue('base') ?? DEFAULT_BASE_URL;
const modelIds = selected(MODELS, 'models');
const tiers = selected(CASES, 'tiers');
// --repeat=N 은 같은 셀을 N 회 실행해 최저점과 폭으로 접는다. 2026-08-04
// 중급 3회에서 같은 입력이 퓨즈 14→11→5 로 흔들렸으므로(원장 10차)
// 원장에 새로 넣는 수치는 N>=3 으로 뽑는다. 단발은 개선/악화 판정에 쓰지 않는다.
const repeatRaw = argValue('repeat');
const repeat = repeatRaw === undefined ? 1 : Number.parseInt(repeatRaw, 10);
if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 10) {
  throw new Error('--repeat 은 1~10 의 정수여야 합니다.');
}
const resume = process.argv.includes('--resume');
const aggregateOnly = process.argv.includes('--aggregate-only');
const snapshot = gitSnapshot();
mkdirSync('test-results', { recursive: true });

const results = [];
for (const modelId of modelIds) {
  for (const tier of tiers) {
    const out = receiptPath(modelId, tier);
    if (aggregateOnly) {
      if (!existsSync(out)) throw new Error(`집계할 영수증이 없습니다: ${out}`);
      let prior = JSON.parse(readFileSync(out, 'utf8'));
      if (prior.document) {
        prior = {
          ...prior,
          ...summarizeDocument(prior.document, CASES[tier].expected),
          evaluationSnapshot: snapshot,
          regradedAt: new Date().toISOString(),
        };
        writeFileSync(out, JSON.stringify(prior, null, 2));
      }
      prior.verdict ??= prior.reasoning?.summary?.overall ?? prior.finalStatus ?? 'UNKNOWN';
      results.push(prior);
      continue;
    }
    if (resume && existsSync(out)) {
      const prior = JSON.parse(readFileSync(out, 'utf8'));
      prior.verdict ??= prior.reasoning?.summary?.overall ?? prior.finalStatus ?? 'UNKNOWN';
      const currentSha = createHash('sha256').update(readFileSync(CASES[tier].file)).digest('hex');
      if (
        prior.status === 'COMPLETE'
        && prior.requestedModel === MODELS[modelId].model
        && prior.requestedEffort === EFFORT
        && (prior.requestedEffortProfile ?? null) === (EFFORT_PROFILE || null)
        && prior.sourceSha256 === currentSha
        && prior.workspaceSnapshot?.revision === snapshot.revision
        && prior.workspaceSnapshot?.changeHash === snapshot.changeHash
      ) {
        console.log(`재사용 ${modelId.padEnd(10)} ${tier.padEnd(12)} ${prior.status}`);
        results.push(prior);
        continue;
      }
    }

    console.log(`실행   ${modelId.padEnd(10)} ${tier.padEnd(12)} ${MODELS[modelId].label} · ${EFFORT}`);
    const cellRuns = [];
    for (let attempt = 1; attempt <= repeat; attempt += 1) {
      const attemptReceipt = await runCell(baseUrl, modelId, tier, snapshot);
      cellRuns.push(attemptReceipt);
      const score = attemptReceipt.scores?.labelAccuracyPct;
      console.log(
        `  ${repeat > 1 ? `${attempt}/${repeat} ` : ''}${attemptReceipt.status.padEnd(22)} ${Math.round(attemptReceipt.durationMs / 1000)}s`
        + `${score === undefined ? '' : ` · 라벨 ${score}%`}`
        + `${attemptReceipt.vlmCalls === undefined ? '' : ` · 호출 ${attemptReceipt.vlmCalls}`}`,
      );
    }

    const spread = foldRunSpread(cellRuns);
    // 대표 회차 = 최저 종합. 그 문서를 남겨야 무너진 판독을 사후에 볼 수 있다.
    const receipt = { ...cellRuns[spread.representativeIndex - 1], runSpread: spread };
    writeFileSync(out, JSON.stringify(receipt, null, 2));
    if (repeat > 1) {
      console.log(
        `결과   ${spread.status.padEnd(22)} 라벨 ${formatSpread(spread.accuracy, '%')}`
        + ` · 폭 ${spread.accuracy?.spread ?? '-'}p · 대표 ${spread.representativeIndex}회차`,
      );
    }
    results.push(receipt);
  }
}

const comparison = comparisonStatusForReceipts(results);
const aggregate = {
  schemaVersion: 1,
  requestedEffort: EFFORT,
  requestedEffortProfile: EFFORT_PROFILE || null,
  baseUrl,
  workspaceSnapshot: snapshot,
  recordedAt: new Date().toISOString(),
  aggregateOnly,
  repeat,
  resultSnapshotHashes: comparison.snapshotHashes,
  comparison,
  cases: Object.fromEntries(tiers.map((tier) => [tier, CASES[tier]])),
  models: Object.fromEntries(modelIds.map((id) => [id, {
    provider: MODELS[id].provider,
    model: MODELS[id].model,
    label: MODELS[id].label,
  }])),
  results: results.map(({ document: _document, ...result }) => result),
};
writeFileSync(`test-results/drawing-model-matrix-high${PROFILE_SLUG}.json`, JSON.stringify(aggregate, null, 2));

if (!comparison.valid) {
  console.warn(`\n비교 보류: ${comparison.reason} (${comparison.snapshotHashes.join(', ')})`);
}

// 2회 이상이면 최저~최고로 적는다. 단일 수치로 적으면 다음 사람이 그것을
// 그 셀의 성능으로 읽는다 — 원장 10차가 뒤집은 바로 그 오독이다.
console.log('\n모델            난이도         정확도     관계       시간        회차  실행      품질');
for (const result of results) {
  const spread = result.runSpread;
  const duration = spread?.duration
    ? `${Math.round(spread.duration.worst / 1000)}~${Math.round(spread.duration.best / 1000)}s`
    : '-';
  console.log(
    `${result.modelId.padEnd(16)}${result.tier.padEnd(15)}`
    + `${formatSpread(spread?.accuracy, '%').padStart(8)}  `
    + `${formatSpread(spread?.relation, '%').padStart(8)}  `
    + `${duration.padStart(10)}  `
    + `${String(spread?.runCount ?? 1).padStart(4)}  ${result.status.padEnd(9)} ${result.verdict ?? 'UNKNOWN'}`,
  );
  // 어느 기호축이 흔들리는지가 다음 수리 대상이다. 폭이 0이면 생략한다.
  for (const [type, entry] of Object.entries(spread?.symbolTypes ?? {})) {
    if ((entry.spread ?? 0) === 0) continue;
    console.log(`    ${type.padEnd(12)} 정답 ${String(entry.expected).padStart(2)} · 판독 ${entry.values.join('/')} · 폭 ${entry.spread}`);
  }
}
console.log(`\n영수증: test-results/drawing-model-matrix-high${PROFILE_SLUG}.json`);

await httpAgent.close();

if (results.some((result) => result.status === 'ERROR' || result.status === 'CONFIGURATION_MISMATCH')) {
  process.exitCode = 1;
}
