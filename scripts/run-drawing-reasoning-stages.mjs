/**
 * Run one fixed-label drawing through the production V3 endpoint and record
 * PASS/HOLD/FAIL for every reasoning stage. API keys are read from env only
 * and are never written to the receipt.
 *
 * Usage:
 *   node --env-file=.env.local scripts/run-drawing-reasoning-stages.mjs public-wiki
 *   node scripts/run-drawing-reasoning-stages.mjs public-wiki http://127.0.0.1:3010 --replay
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { reasoningStageEvidenceFromDocument } from './lib/local-drawing-receipt.mjs';

const CASES = {
  'public-wiki': {
    file: 'fixtures/drawings/external/wiki-oneline.png',
    mime: 'image/png',
    description: 'Wikimedia 대표 단선도 — 발전기·3권선 변압기·분로 리액터·차단기',
    expected: {
      symbolTypes: { transformer: 1, generator: 1, breaker: 6, reactor: 1 },
      minRelations: 13,
    },
  },
};

const caseId = process.argv[2] ?? 'public-wiki';
const baseUrl = process.argv[3]?.startsWith('http') ? process.argv[3] : 'http://127.0.0.1:3010';
const replay = process.argv.includes('--replay');
const target = CASES[caseId];
if (!target) {
  console.error(`알 수 없는 케이스: ${caseId}. 가능: ${Object.keys(CASES).join(', ')}`);
  process.exit(2);
}

const receiptPath = `test-results/drawing-reasoning-stages-${caseId}.json`;
let document;
let provider;
let model;
let durationMs;

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
  return {
    revision,
    dirty: status.length > 0,
    changeHash: changeHash.digest('hex'),
  };
}

if (replay) {
  if (!existsSync(receiptPath)) {
    console.error(`재생할 영수증이 없습니다: ${receiptPath}`);
    process.exit(2);
  }
  const saved = JSON.parse(readFileSync(receiptPath, 'utf8'));
  document = saved.document;
  provider = saved.provider;
  model = saved.model;
  durationMs = saved.durationMs;
} else {
  if (!existsSync(target.file)) {
    console.error(`도면 파일이 없습니다: ${target.file}`);
    process.exit(2);
  }

  const keySources = [
    ['google-agent-platform', 'GOOGLE_VERTEX_API_KEY'],
    ['gemini', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    ['openai', 'OPENAI_API_KEY'],
    ['claude', 'ANTHROPIC_API_KEY'],
  ];
  let apiKey = process.env.ESA_VISION_KEY?.trim() ?? '';
  provider = process.env.ESA_VISION_PROVIDER?.trim() ?? '';
  if (!apiKey) {
    for (const [candidateProvider, envName] of keySources) {
      const candidate = process.env[envName]?.trim();
      if (candidate) {
        apiKey = candidate;
        provider ||= candidateProvider;
        break;
      }
    }
  }
  provider ||= 'gemini';
  model = process.env.ESA_VISION_MODEL?.trim()
    || (provider === 'google-agent-platform' ? 'gemini-3.6-flash' : '');
  if (!apiKey) {
    console.error('Vision 키가 없습니다. .env.local 또는 ESA_VISION_KEY를 확인하십시오.');
    process.exit(2);
  }

  const bytes = readFileSync(target.file);
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: target.mime }), target.file.split('/').pop());
  form.set('provider', provider);
  form.set('apiKey', apiKey);
  form.set('pages', 'all');
  form.set('maxVlmCalls', '120');
  if (model) form.set('model', model);

  console.log(`V3 단계별 도면 검증: ${target.description}`);
  console.log(`provider=${provider} model=${model || '(기본)'} sourceSha256=${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}…`);
  const started = Date.now();
  let response;
  try {
    response = await fetch(`${baseUrl}/api/drawing-jobs`, {
      method: 'POST',
      headers: { Origin: baseUrl },
      body: form,
      signal: AbortSignal.timeout(360_000),
    });
  } catch (error) {
    console.error(`V3 요청 실패: ${error instanceof Error ? error.message : 'unknown'}`);
    process.exit(1);
  }
  durationMs = Date.now() - started;
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    console.error(`V3 응답 JSON 파싱 실패: HTTP ${response.status}`);
    process.exit(1);
  }
  if (!response.ok || !payload?.data?.document) {
    console.error(`V3 분석 실패: HTTP ${response.status} ${String(payload?.error?.message ?? payload?.error ?? '').slice(0, 200)}`);
    process.exit(1);
  }
  document = payload.data.document;
}

const reasoning = reasoningStageEvidenceFromDocument(document, { expected: target.expected });
console.log(`\n결과: ${reasoning.summary.overall} · PASS ${reasoning.summary.pass} · HOLD ${reasoning.summary.hold} · FAIL ${reasoning.summary.fail}`);
for (const item of reasoning.stages) {
  console.log(`${item.status.padEnd(4)} ${item.id.padEnd(34)} ${item.label}`);
}

mkdirSync('test-results', { recursive: true });
const snapshot = gitSnapshot();
writeFileSync(receiptPath, JSON.stringify({
  schemaVersion: 1,
  caseId,
  source: target.file,
  description: target.description,
  expected: target.expected,
  provider,
  model: model || '(기본)',
  durationMs,
  revision: snapshot.revision,
  workspaceSnapshot: snapshot,
  recordedAt: new Date().toISOString(),
  reasoning,
  document,
}, null, 2));
console.log(`영수증: ${receiptPath}`);

if (reasoning.summary.overall === 'FAIL') process.exitCode = 1;
