/**
 * 로컬 실무 도면 1 장을 파이프라인에 넣고 손 판독 라벨과 대조한다.
 *
 * 왜 필요한가: 지금까지 실증은 KIMM 설계도(분전반·수배전) 계열뿐이었다. 이
 * 도면은 **삼선결선도(THREE LINE DIAGRAM)** 라 한 회로가 3 선으로 그려지고,
 * 인터록이 점선이며, 계기 2 차 회로(PT/CT 단자번호)가 주회로와 섞여 있다.
 * 기존 라벨 계열에 없던 표현이라 새 실패 모드가 나올 자리다.
 *
 * 라벨은 **결과를 보기 전에** 고정했다. 돌려 보고 라벨을 맞추면 닫힌 순환이라
 * 아무것도 반증하지 못한다.
 *
 * 원본 이미지는 발주처·설계사·담당자 실명이 있는 상용 도면이라
 * fixtures/drawings/local/ (gitignore) 에만 둔다. 여기 라벨에는 전기 사양만
 * 남기고 식별 정보는 넣지 않는다.
 *
 * 사용:
 *   node --env-file=.env.local scripts/run-local-drawing.mjs
 *   node --env-file=.env.example scripts/run-local-drawing.mjs   (키가 거기 있을 때)
 * 키는 환경변수로만 받고 출력하지 않는다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3010';
const FILE = 'fixtures/drawings/local/threeline-22kv-lbs-panel.jpg';

const KEY_SOURCES = [
  ['gemini', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  ['openai', 'OPENAI_API_KEY'],
  ['claude', 'ANTHROPIC_API_KEY'],
];
let KEY = process.env.ESA_VISION_KEY?.trim() ?? '';
let PROVIDER = process.env.ESA_VISION_PROVIDER?.trim() || 'gemini';
let keyOrigin = KEY ? 'ESA_VISION_KEY' : '';
if (!KEY) {
  for (const [provider, envName] of KEY_SOURCES) {
    const found = process.env[envName]?.trim();
    if (found) { KEY = found; PROVIDER = provider; keyOrigin = envName; break; }
  }
}
if (!KEY) {
  console.error('Vision 키 없음. node --env-file=<파일> 로 넘겨라. 값은 출력하지 않는다.');
  console.error(`찾아본 이름: ESA_VISION_KEY, ${KEY_SOURCES.map(([, n]) => n).join(', ')}`);
  process.exit(2);
}
if (!existsSync(FILE)) { console.error(`이미지 없음: ${FILE}`); process.exit(2); }

/**
 * 손 판독 블라인드 라벨 — 결과 보기 전 고정 (2026-07-27).
 *
 * 도면에 실제로 있는 것만 센다. 없는 것을 0 으로 명시하는 이유는 환각을
 * 그 자리에서 수로 재기 위해서다.
 */
const LABEL = {
  sheetType: 'three-line',           // 단선도가 아니다 — 한 회로가 3 선
  systemVoltage: '22.9kV',           // 3Φ4W 22.9kV-Y 60Hz, 154S/S 수전
  transformers: 0,                   // 이 시트에 변압기 없음 (LBS 패널)
  generators: 0,                      // 발전기 없음 — 환각 측정용
  loadBreakSwitch: 1,                // L.B.S 24kV 3P 1250A
  lightningArresters: 3,             // L.A x3 18kV 5kA (W/DISCON)
  meters: 2,                         // VS/V 0-31.2kV, AS/A 0-500A
  interlocks: 2,                     // 24kV LBS, 24kV VCB (점선 표현)
  outgoingPanels: 2,                 // SV-TIE LBS PANEL, SV-GPT#1 PANEL
  cableSpec: '22.9kV FR-CNCO-W 325sq/1C',
  /** 삼선을 3 개 회로로 오독하면 이 수가 3 배로 튄다. */
  mainCircuits: 1,
};

const form = new FormData();
form.append('image', new Blob([readFileSync(FILE)], { type: 'image/jpeg' }), 'drawing.jpg');
form.append('provider', PROVIDER);
form.append('apiKey', KEY);
const MODEL = process.env.ESA_VISION_MODEL?.trim() || '';
if (MODEL) form.append('model', MODEL);

console.log(`실무 도면 실증 → ${BASE}/api/sld  (provider=${PROVIDER}, 키 출처=${keyOrigin})`);
console.log(`대상: ${FILE}  (삼선결선도 · 22.9kV LBS 패널)\n`);
console.log('라벨(손 판독, 결과 보기 전 고정):');
for (const [k, v] of Object.entries(LABEL)) console.log(`   ${k.padEnd(20)} ${v}`);
console.log('');

const started = Date.now();
const res = await fetch(`${BASE}/api/sld`, { method: 'POST', headers: { Origin: BASE }, body: form });
const text = await res.text();
let payload;
try { payload = JSON.parse(text); } catch { payload = { parseError: text.slice(0, 300) }; }
const ms = Date.now() - started;

if (res.status !== 200) {
  console.log(`HTTP ${res.status} (${(ms / 1000).toFixed(1)}s) — ${String(payload?.error ?? payload?.parseError ?? '').slice(0, 300)}`);
  process.exit(1);
}

const data = payload?.data ?? payload;
const comps = Array.isArray(data?.components) ? data.components : [];
const conns = Array.isArray(data?.connections) ? data.connections : [];
const byType = {};
for (const c of comps) byType[c.type ?? 'unknown'] = (byType[c.type ?? 'unknown'] ?? 0) + 1;

console.log(`결과 (${(ms / 1000).toFixed(1)}s) — 부품 ${comps.length} · 연결 ${conns.length}`
  + (data?.confidence != null ? ` · conf ${data.confidence}` : ''));
console.log(`타입 분포: ${JSON.stringify(byType)}`);
console.log('');
console.log('부품 목록:');
for (const c of comps) {
  console.log(`   ${String(c.type ?? '?').padEnd(14)} ${String(c.label ?? '').slice(0, 46).padEnd(46)}`
    + ` ${[c.rating, c.current, c.voltage, c.power].filter(Boolean).join(' ')}`);
}

console.log('\n대조 — 환각과 누락:');
const check = (name, got, want) => {
  const mark = got === want ? 'OK  ' : got > want ? '환각 ' : '누락 ';
  console.log(`   ${mark} ${name.padEnd(20)} 결과 ${got}  라벨 ${want}`);
};
check('변압기', byType.transformer ?? 0, LABEL.transformers);
check('발전기', byType.generator ?? 0, LABEL.generators);

mkdirSync('test-results', { recursive: true });
const out = join('test-results', 'local-drawing-threeline.json');
writeFileSync(out, JSON.stringify({ base: BASE, provider: PROVIDER, model: MODEL || '(기본)', ms, label: LABEL, byType, components: comps, connections: conns, confidence: data?.confidence ?? null }, null, 2));
console.log(`\n영수증 → ${out}`);
