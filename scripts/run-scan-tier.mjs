/**
 * 스캔 티어 실증 — 벡터로 검증된 페이지를 스캔 이미지로 넣어 같은 정답과 대조한다.
 *
 * 왜 이 형태인가: 3차 실증(2026-07-21)은 **벡터 경로만** 봤다. 같은 도면을 스캔
 * 모달리티로 바꿔 넣으면 정답(블라인드 라벨)은 그대로이므로, 벡터 대비 래스터의
 * 성능 저하만 분리해서 측정된다. 새 라벨을 만들 필요가 없다.
 *
 * 사용 — 둘 중 하나:
 *   1) .env.local 에 GOOGLE_VERTEX_API_KEY=<Agent Platform 키> 한 줄 추가 후
 *        node --env-file=.env.local scripts/run-scan-tier.mjs
 *      (키가 gitignore 된 파일에만 있고 셸 히스토리에 안 남는다 — 권장)
 *   2) 일회성이면
 *        ESA_VISION_KEY=<키> node scripts/run-scan-tier.mjs
 *
 * 래스터가 없으면 먼저:
 *   node scripts/fixtures/rasterize-golden-scan.mjs <pdf> <page> fixtures/drawings/realworld/raster 2
 *
 * 키는 환경변수로만 받고 어디에도 출력하지 않는다. 로그·영수증에 남는 것은
 * 공급자명과 모델명뿐이다.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3010';

/**
 * 키 출처 — 앱이 서버 폴백으로 쓰는 이름을 그대로 재사용한다
 * (api/drawing-jobs/route.ts:49 serverVisionKey). 새 이름을 발명하면 사용자가
 * .env.local 에 같은 키를 두 번 적게 된다.
 */
const KEY_SOURCES = [
  ['gemini', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  ['google-agent-platform', 'GOOGLE_VERTEX_API_KEY'],
  ['openai', 'OPENAI_API_KEY'],
  ['claude', 'ANTHROPIC_API_KEY'],
];

const explicitKey = process.env.ESA_VISION_KEY?.trim() ?? '';
const explicitProvider = process.env.ESA_VISION_PROVIDER?.trim() ?? '';
let KEY = explicitKey;
let PROVIDER = explicitProvider || 'gemini';
let keyOrigin = explicitKey ? 'ESA_VISION_KEY' : '';

if (!KEY) {
  const wanted = explicitProvider
    ? KEY_SOURCES.filter(([p]) => p === explicitProvider)
    : KEY_SOURCES;
  for (const [provider, envName] of wanted) {
    const found = process.env[envName]?.trim();
    if (found) { KEY = found; PROVIDER = provider; keyOrigin = envName; break; }
  }
}

const MODEL = process.env.ESA_VISION_MODEL?.trim() || '';

if (!KEY) {
  console.error('Vision 키를 찾지 못했다. 이 스크립트는 키 값을 저장하거나 출력하지 않는다.\n');
  console.error('  방법 1 (권장) — .env.local 에 한 줄 추가하고 그 파일을 읽혀서 실행:');
  console.error('      GOOGLE_VERTEX_API_KEY=<Agent Platform 키>');
  console.error('      node --env-file=.env.local scripts/run-scan-tier.mjs\n');
  console.error('  방법 2 — 일회성:');
  console.error('      ESA_VISION_KEY=<키> node scripts/run-scan-tier.mjs\n');
  console.error(`  찾아본 이름: ESA_VISION_KEY, ${KEY_SOURCES.map(([, n]) => n).join(', ')}`);
  process.exit(2);
}

const RASTER_DIR = 'fixtures/drawings/realworld/raster';
const TIERS = ['raster', 'scan-light', 'scan-heavy'];

/**
 * 3차 실증(docs/project/design/2026-07-21-realworld-tier-validation.md)에서
 * 래스터 판독으로 손 확정한 블라인드 라벨. 스캔 경로도 같은 도면이므로 그대로 쓴다.
 * vector 열은 같은 페이지의 벡터 경로 실측치 — 비교 기준선이다.
 */
const PAGES = [
  {
    page: 40, tier: '초급', sheet: 'EE-038 분전반결선도13',
    label: { breakers: 42, transformers: 0, generators: 0 },   // MAIN 4 + 분기 ~38
    vector: { breakers: 41, generators: 0, note: '검출 ~98%·DWHM 미검출' },
  },
  {
    page: 14, tier: '중급', sheet: 'EE-012 분전반결선도2',
    label: { breakers: 6, transformers: 0, generators: 0 },     // MAIN MCCB 6 + 분기 다수
    vector: { breakers: 35, generators: 0, note: 'GT→발전기 환각 0' },
  },
  {
    page: 5, tier: '고급', sheet: 'EE-003 수변전 단선결선도',
    label: { breakers: 9, transformers: 3, generators: 0 },      // VCB 6 + ACB 3, MOLD TR 3
    vector: { breakers: 10, transformers: 3, generators: 0, note: 'TR 용량 3/3 정확·load결속 70%' },
  },
];

const MIME = 'image/png';

function summarize(payload) {
  const data = payload?.data ?? payload?.json?.data ?? payload;
  const comps = Array.isArray(data?.components) ? data.components : [];
  const conns = Array.isArray(data?.connections) ? data.connections : [];
  const byType = {};
  for (const c of comps) byType[c.type ?? 'unknown'] = (byType[c.type ?? 'unknown'] ?? 0) + 1;
  const caps = comps
    .filter((c) => c.type === 'transformer')
    .map((c) => `${c.label ?? ''} ${c.rating ?? ''} ${c.power ?? ''}`.trim())
    .filter(Boolean);
  return {
    components: comps.length,
    connections: conns.length,
    breakers: byType.breaker ?? 0,
    transformers: byType.transformer ?? 0,
    generators: byType.generator ?? 0,
    confidence: data?.confidence ?? null,
    transformerLabels: caps,
    byType,
  };
}

async function runOne(file) {
  const form = new FormData();
  form.append('image', new Blob([readFileSync(file)], { type: MIME }), file.split(/[\\/]/).pop());
  form.append('provider', PROVIDER);
  form.append('apiKey', KEY);
  if (MODEL) form.append('model', MODEL);

  const started = Date.now();
  const res = await fetch(`${BASE}/api/sld`, {
    method: 'POST',
    headers: { Origin: BASE },
    body: form,
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { parseError: text.slice(0, 200) }; }
  return { status: res.status, ms: Date.now() - started, payload };
}

const results = [];
console.log(
  `스캔 티어 실증 → ${BASE}/api/sld  (provider=${PROVIDER}${MODEL ? `, model=${MODEL}` : ', model=기본'}`
  + `, 키 출처=${keyOrigin})\n`,
);

for (const spec of PAGES) {
  console.log(`■ p${spec.page} ${spec.tier} — ${spec.sheet}`);
  console.log(`   라벨(손 판독): 차단기 ${spec.label.breakers} · 변압기 ${spec.label.transformers} · 발전기 ${spec.label.generators}`);
  console.log(`   벡터 경로 실측: 차단기 ${spec.vector.breakers} · 발전기 ${spec.vector.generators} — ${spec.vector.note}`);

  for (const tier of TIERS) {
    const file = join(RASTER_DIR, `kimm-20210602-design-p${spec.page}-${tier}.png`);
    if (!existsSync(file)) { console.log(`   [${tier}] 이미지 없음 — rasterize 먼저`); continue; }

    const { status, ms, payload } = await runOne(file);
    if (status !== 200) {
      const msg = payload?.error ?? payload?.parseError ?? '';
      console.log(`   [${tier}] HTTP ${status} — ${String(msg).slice(0, 120)}`);
      results.push({ page: spec.page, tier, status, error: String(msg).slice(0, 200) });
      continue;
    }
    const s = summarize(payload);
    // 발전기 환각은 세 페이지 모두 정답이 0 이므로 그대로 오탐 수다.
    const halluc = s.generators - spec.label.generators;
    console.log(
      `   [${tier}] ${(ms / 1000).toFixed(1)}s · comps ${s.components} · conns ${s.connections}`
      + ` · 차단기 ${s.breakers} · 변압기 ${s.transformers} · 발전기환각 ${halluc}`
      + (s.confidence != null ? ` · conf ${s.confidence}` : ''),
    );
    if (s.transformerLabels.length) console.log(`        변압기 라벨: ${s.transformerLabels.join(' | ').slice(0, 160)}`);
    results.push({ page: spec.page, tier, status, ms, ...s, hallucinatedGenerators: halluc, label: spec.label, vector: spec.vector });
  }
  console.log('');
}

mkdirSync('test-results', { recursive: true });
const out = join('test-results', 'scan-tier-results.json');
writeFileSync(out, JSON.stringify({ base: BASE, provider: PROVIDER, model: MODEL || '(기본)', results }, null, 2));
console.log(`영수증 → ${out}`);

const failed = results.filter((r) => r.status !== 200).length;
const halluc = results.filter((r) => (r.hallucinatedGenerators ?? 0) > 0).length;
console.log(`\n요약: 요청 ${results.length} · 실패 ${failed} · 발전기 환각 발생 ${halluc}`);
process.exit(failed === results.length ? 1 : 0);
