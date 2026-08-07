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
import { assemblyMetrics, foldAssemblyMetrics, formatRatio } from './lib/drawing-assembly-metrics.mjs';
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
  'advanced-pdf': {
    id: 'kimm-p5-pdf',
    file: 'fixtures/drawings/realworld/incoming/kimm-20210602-design.pdf',
    mime: 'application/pdf',
    pages: '5',
    description: '고급 · 같은 KIMM 도면을 **PDF 원본**으로 — 벡터+래스터 hybrid 경로',
    // `advanced` 는 같은 페이지를 래스터 PNG 로 올려 벡터 패스를 타지 않는다.
    // 실제 사용 흐름(CAD 가 출력한 PDF 업로드)은 이쪽이고, 벡터 앵커가 살아
    // 있는지 여부가 조립 결과를 크게 바꾼다(원장 23차). 측정할 수 없으면
    // 고칠 수도 없으므로 티어로 세운다.
    expected: {
      symbolTypes: { transformer: 4, generator: 0 },
      minimumSymbolTypes: { breaker: 9 },
      minRelations: 12,
    },
  },
  // ── 로컬 전용 티어 ────────────────────────────────────────────────────
  // 이 교보재는 재배포할 수 없어 `fixtures/drawings/local/`(gitignore)에 있다.
  // 파일이 없으면 이 티어는 실행할 수 없다 — `--tiers` 로 명시할 때만 쓴다.
  //
  // 왜 세우나: 여기까지의 도면 수리가 전부 KIMM 실도면 한 장으로 보정됐다.
  // 성격이 다른 도면(한글 라벨 교재형 22.9kV 수변전 단선결선도)에서 그 수리가
  // 통하는지 보는 **일반화 시험**이다.
  //
  // 정답은 원본 p6 을 확대해 육안으로 셌다: 수전용 변압기 3(Δ-Y 3쌍) ·
  // 부하 3 · CB 1 · MOF 1 · PT 1 · CT 1 · LA 1 · DS 2 · PF/COS 2 ·
  // OCR 3 · OCGR 1 · A 1 · V 1.
  'reference-textbook': {
    id: 'dsan-p6',
    file: 'fixtures/drawings/local/dsan-substation.pdf',
    mime: 'application/pdf',
    pages: '6',
    description: '참조 · 한글 교재형 22.9kV 수변전 단선결선도 (로컬 전용)',
    // 정답(2026-08-07 원본 확대 재검수): 변압기 3 · 부하 3 · CB 1 · T.C 1 ·
    // MOF 1 · 전력량계 1 · PT 1 · V 1 · CT 1 · OCR 3 · OCGR 1 · A 1 · LA 1 ·
    // E 1 · DS 2(직선 블레이드) · 곡선 블레이드 5(PF 10[kA] 1 + COS또는PF 1 +
    // 피더 3).
    //
    // 29차의 `PF/COS 2` 는 오답이었다 — 모선에서 갈라진 **피더 3개의 개폐기를
    // 통째로 빠뜨렸다.** 그것들을 "유령"으로 적었으나 실재한다.
    //
    // 정확 수량으로 걸 수 있는 축의 조건은 둘이다.
    //   ① `canonicalSymbolType` 이 별칭을 접는 축일 것
    //      → breaker·switch·arrester·transformer 넷뿐. MOF·PT·CT·OCR·OCGR·A·V
    //        는 모델이 부르는 대로 흘러나오므로 넣으면 판독이 아니라 이름
    //        불일치를 채점하게 된다(26차 구분자 결함과 같은 함정).
    //   ② **도면이 그 클래스를 결정할 것.**
    //      → `switch` 는 여기서 탈락한다. 이 교재는 PF·COS·피더 개폐기에 전부
    //        같은 곡선 블레이드 기호를 쓰고, 라벨이 `COS또는PF`(둘 중 하나)다.
    //        도면만으로 switch/fuse 를 가를 수 없으므로 어느 수를 걸어도 자가
    //        아니라 추측이다. 파이프라인이 ambiguous 로 남기는 것이 맞는 동작이다.
    //
    // 부하 3 도 뺐다 — `load` 는 분류 실패의 흡수통이라 정확 수량 축이 못 된다.
    expected: {
      symbolTypes: {
        transformer: 3,   // 수전용 변압기 (Δ-Y 3쌍)
        generator: 0,
        breaker: 1,       // CB 1. 27차까지 하한이었던 것을 정확 수량으로 조인다.
        arrester: 1,      // LA 1
      },
      minRelations: 10,
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
  form.set('pages', drawing.pages ?? 'all');
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
    // 정답 없이 재는 조립 품질. 라벨 점수는 모델이 무엇을 읽었는가에
    // 지배되어 조립기 변경을 못 본다(원장 19차).
    assembly: assemblyMetrics(document.evidenceGraph, document.unresolvedItems ?? []),
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
    // 조립 지표도 같이 접는다. 대표 회차 하나만 남기면 팔끼리 비교가 안 된다 —
    // 라벨 점수가 잡음에 묻히는 고급 티어에서 이쪽이 유일한 신호다.
    const assemblyRuns = cellRuns.map((run) => run.assembly).filter(Boolean);
    if (assemblyRuns.length > 0) spread.assembly = foldAssemblyMetrics(assemblyRuns);
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
  // 조립 지표는 정답을 안 쓰므로 라벨 점수가 잡음에 묻힐 때도 갈린다(원장 19차).
  // 셋 다 낮을수록 좋다. 모호비는 단독으로 읽지 말 것 — 근거 없이 확정하면
  // 이 값이 내려가면서 오탐이 오른다.
  const assembly = spread?.assembly;
  if (assembly) {
    console.log(
      `    조립         미병합비 ${formatRatio(assembly.unmergedPairRatio?.worst)}`
      + ` · 조각비 ${formatRatio(assembly.sliverRatio?.worst)}`
      + ` · 모호비 ${formatRatio(assembly.ambiguousRatio?.worst)}`
      + `  (최악 기준, 폭 ${formatRatio(assembly.sliverRatio?.spread)})`,
    );
  }
}
console.log(`\n영수증: test-results/drawing-model-matrix-high${PROFILE_SLUG}.json`);

await httpAgent.close();

if (results.some((result) => result.status === 'ERROR' || result.status === 'CONFIGURATION_MISMATCH')) {
  process.exitCode = 1;
}
