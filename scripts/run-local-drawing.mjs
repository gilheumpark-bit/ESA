/**
 * 로컬 실무 도면을 파이프라인에 넣고 손 판독 라벨과 대조한다.
 *
 * 라벨은 **결과를 보기 전에** 고정한다. 돌려 보고 라벨을 맞추면 닫힌 순환이라
 * 아무것도 반증하지 못한다(§2.3).
 *
 * 원본은 상용/공개 도면이라 fixtures/drawings/local/ (gitignore) 에만 둔다.
 * 여기 라벨에는 전기 사양만 남기고 발주처·설계사·담당자 식별 정보는 넣지 않는다.
 *
 * 사용:
 *   node --env-file=.env.example scripts/run-local-drawing.mjs [라벨키] [baseUrl]
 * 키는 환경변수로만 받고 출력하지 않는다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 손 판독 블라인드 라벨. 각 항목은 도면에 실제로 인쇄된 것만 센다.
 * 없는 것을 0 으로 명시하는 이유는 환각을 그 자리에서 수로 재기 위해서다.
 */
const LABELS = {
  /** 22.9kV 수전 LBS 패널 — 삼선결선도 (2026-07-27 판독) */
  threeline: {
    file: 'fixtures/drawings/local/threeline-22kv-lbs-panel.jpg',
    mime: 'image/jpeg',
    what: '삼선결선도 · 22.9kV LBS 패널',
    label: {
      sheetType: 'three-line',
      systemVoltage: '22.9kV',
      transformers: 0,
      generators: 0,
      breakers: 0,          // LBS 는 부하개폐기지 차단기가 아니다
      arresters: 3,         // L.A x3 18kV 5kA
      meters: 2,            // V 0-31.2kV, A 0-500A
      interlocks: 2,        // 점선 표현 — 안전 정보
      mainCircuits: 1,      // 삼선을 3 회로로 읽으면 튄다
    },
  },

  /** 저압 배전반 단선도 — 세종시 공개 도면 p1 (2026-07-27 판독) */
  sejong: {
    file: 'fixtures/drawings/local/sejong-swgr-db-p1-raster.png',
    mime: 'image/png',
    what: '저압 배전반 단선도 · 600V 3Ø4W 600A · 분기 10',
    label: {
      sheetType: 'single-line',
      systemVoltage: '600V 3Ø4W 60Hz',
      busRating: '600A',
      transformers: 0,      // P.T 는 계기용 변성기 — 사전상 meter 계열
      generators: 0,        // 환각 측정용
      /**
       * 분기 MCCB 10. 정격은 좌→우:
       *   250AF/150AT · 250AF/125AT · 250AF/125AT · 100AF/100AT · 100AF/60AT(2P)
       *   100AF/30AT(3P) · 50AF/20AT · 100AF/100AT · 100AF/100AT · 100AF/100AT
       * 마지막 하나는 `MCCB 4P` 표기 없이 정격만 적혀 있다 — 키워드 기반
       * 검출의 적대 케이스다.
       */
      breakers: 10,
      breakersWithoutTypeLabel: 1,
      zct: 10,              // 분기마다 영상변류기
      meters: 5,            // V A W PF F
      spd: 1,               // SPD + Disconnector
      pt: 3,                // P.T x3 (MOLD) 380V/√3 : 190V/√3
      loads: 10,
    },
  },

  /**
   * 치수 배치도 — **전기 회로가 없다.** 반·기초의 치수선과 배치만 있다.
   *
   * 환각의 가장 순수한 측정이다. 셀 것이 없으니 라벨 오류 여지도 없고, 부품이
   * 나오면 그 수가 곧 환각 수다. 실무 도면 묶음에는 이런 장이 늘 섞여 있는데
   * 파이프라인은 모든 장을 회로로 가정한다.
   */
  'sejong-p4': {
    file: 'fixtures/drawings/local/sejong-swgr-db-p4-raster.png',
    mime: 'image/png',
    what: '치수 배치도 (비회로) · 환각 측정용',
    label: {
      sheetType: 'dimension-layout',
      transformers: 0,
      generators: 0,
      breakers: 0,
      arresters: 0,
      meters: 0,
      /** 전기 부품 전체가 0 이다. 하나라도 나오면 환각이다. */
      totalElectricalComponents: 0,
    },
  },

  /**
   * 분전반 결선도 — **차단기 일람표가 미기입이다.**
   *
   * 표제는 `BREAKER | AF | AT | P | 비고` 인데 그 아래 칸이 전부 비어 있다.
   * 4 배 배율로 올려도 비어 있으니 해상도 문제가 아니라 도면이 그렇다.
   *
   * 그래서 여기서 재는 것은 검출 수가 아니라 **지어내는가**다. 정격이 하나라도
   * 나오면 전부 발명이다. 빈 표를 읽고 회로를 만들어내는 것은 이 파이프라인의
   * 알려진 실패 모드다(3차 실증: 스케줄 표 → conf 0.85 로 회로 발명).
   *
   * 분기 수는 손으로 확정하지 못했다(스캔 열화로 행 경계가 모호). 그래서
   * 차단기 수는 라벨에 넣지 않고 정격 발명만 본다 — 못 센 것을 센 척하지 않는다.
   */
  'sejong-p6': {
    file: 'fixtures/drawings/local/sejong-swgr-db-p6-raster.png',
    mime: 'image/png',
    what: '분전반 결선도 · 차단기 일람표 미기입 · 정격 발명 측정용',
    label: {
      sheetType: 'single-line',
      transformers: 0,
      generators: 0,
      arresters: 1,              // SPD 60kA
      /** 도면에 인쇄된 차단기 정격이 하나도 없다. 나오면 전부 발명이다. */
      printedBreakerRatings: 0,
    },
  },
};

const which = process.argv[2] ?? 'threeline';
const BASE = process.argv[3] ?? 'http://127.0.0.1:3010';
const spec = LABELS[which];
if (!spec) {
  console.error(`알 수 없는 라벨키: ${which}. 가능: ${Object.keys(LABELS).join(', ')}`);
  process.exit(2);
}

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
  process.exit(2);
}
if (!existsSync(spec.file)) { console.error(`이미지 없음: ${spec.file}`); process.exit(2); }

const form = new FormData();
form.append('image', new Blob([readFileSync(spec.file)], { type: spec.mime }), spec.file.split('/').pop());
form.append('provider', PROVIDER);
form.append('apiKey', KEY);
const MODEL = process.env.ESA_VISION_MODEL?.trim() || '';
if (MODEL) form.append('model', MODEL);

console.log(`실무 도면 실증 → ${BASE}/api/sld  (provider=${PROVIDER}, 키 출처=${keyOrigin})`);
console.log(`대상: ${spec.file}\n      ${spec.what}\n`);
console.log('라벨(손 판독, 결과 보기 전 고정):');
for (const [k, v] of Object.entries(spec.label)) console.log(`   ${k.padEnd(24)} ${v}`);
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
console.log(`계통: ${data?.systemVoltage ?? '-'} / ${data?.systemType ?? '-'}\n`);
console.log('부품 목록:');
for (const c of comps) {
  console.log(`   ${String(c.type ?? '?').padEnd(12)} ${String(c.label ?? '').slice(0, 40).padEnd(40)}`
    + ` ${[c.rating, c.current, c.voltage].filter(Boolean).join(' ')}`);
}

console.log('\n대조:');
const check = (name, got, want) => {
  if (want == null) return;
  const mark = got === want ? 'OK  ' : got > want ? '초과 ' : '누락 ';
  console.log(`   ${mark} ${name.padEnd(14)} 결과 ${String(got).padEnd(4)} 라벨 ${want}`);
};
check('변압기', byType.transformer ?? 0, spec.label.transformers);
check('발전기', byType.generator ?? 0, spec.label.generators);
check('차단기', byType.breaker ?? 0, spec.label.breakers);
check('피뢰기', byType.arrester ?? 0, spec.label.arresters);
check('계기', byType.meter ?? 0, spec.label.meters);

mkdirSync('test-results', { recursive: true });
const out = join('test-results', `local-drawing-${which}.json`);
writeFileSync(out, JSON.stringify({
  base: BASE, provider: PROVIDER, model: MODEL || '(기본)', ms,
  what: spec.what, label: spec.label, byType,
  systemVoltage: data?.systemVoltage ?? null, systemType: data?.systemType ?? null,
  components: comps, connections: conns, confidence: data?.confidence ?? null,
}, null, 2));
console.log(`\n영수증 → ${out}`);
