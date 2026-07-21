/**
 * 전수 스윕 — PDF 전 페이지를 /api/pdf-drawing에 관통시켜 페이지별 판정을 덤프한다.
 * 도면 유형(SLD·표·평면도·기타)을 휴리스틱 분류해 커버리지 지도를 만든다.
 * 사용: node scripts/sweep-all-pages.mjs <pdf> [baseUrl] [outJson]
 */
import fs from 'node:fs';

const [pdf, baseArg, outArg, delayArg] = process.argv.slice(2);
const BASE = baseArg ?? 'http://localhost:3010';
const OUT = outArg ?? null;
// rate limit(sld 10건/60s) 회피 스로틀 — 기본 7s(≈8.5/min, 안전 여유).
const DELAY_MS = Number(delayArg ?? 7000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!pdf) { console.error('usage: sweep-all-pages.mjs <pdf> [baseUrl] [outJson] [delayMs]'); process.exit(2); }

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const bytes = fs.readFileSync(pdf);
const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
const numPages = doc.numPages;

// 페이지 유형 힌트 = 제목/텍스트 키워드(파이프라인과 독립·분류 교차검증용)
const TITLE = {
  sld: /(단선|결선도|계통도|SINGLE\s*LINE)/i,
  schedule: /(CABLE SCHEDULE|일람표|부하집계|SCHEDULE|TABLE)/i,
  floorplan: /(평면도|배치도|FLOOR\s*PLAN|LAYOUT)/i,
  arch: /(창호|마감|건축일람|입면도|단면도|구조)/i,
};

function classifyTitle(txt) {
  const hits = [];
  for (const [k, re] of Object.entries(TITLE)) if (re.test(txt)) hits.push(k);
  return hits.length ? hits.join('+') : 'other';
}

async function post(page) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), pdf.split(/[\\/]/).pop());
  form.append('page', String(page));
  const res = await fetch(`${BASE}/api/pdf-drawing`, { method: 'POST', body: form });
  let json = null;
  try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json };
}

const rows = [];
for (let p = 1; p <= numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const txt = tc.items.map((i) => i.str).join(' ');
  const titleType = classifyTitle(txt);
  page.cleanup();

  const r = await post(p);
  const d = r.json?.data ?? {};
  const comps = d.components ?? [];
  const byType = {};
  for (const c of comps) byType[c.type] = (byType[c.type] ?? 0) + 1;
  const conf = r.json?.parserInfo?.confidence ?? null;
  const note = (d.rawDescription ?? '').split('segments')[1]?.trim() ?? '';
  rows.push({
    page: p, titleType, status: r.status, conf,
    comps: comps.length, byType, conns: (d.connections ?? []).length,
    calcSteps: (r.json?.calcChain ?? []).length,
    note: note.slice(0, 60),
  });
  process.stderr.write(`\r${p}/${numPages} (${r.status})`);
  if (p < numPages) await sleep(DELAY_MS);
}
process.stderr.write('\n');

// 커버리지 집계
const byTitle = {};
for (const r of rows) {
  const t = r.titleType;
  byTitle[t] ??= { n: 0, conf085: 0, conf055: 0, conf03: 0, conf0: 0, tableDoc: 0 };
  byTitle[t].n++;
  if (r.conf === 0.85) byTitle[t].conf085++;
  else if (r.conf === 0.55) byTitle[t].conf055++;
  else if (r.conf === 0.3) byTitle[t].conf03++;
  else if (r.conf === 0) byTitle[t].conf0++;
  if (r.note.includes('표 문서')) byTitle[t].tableDoc++;
}

console.log('# 전수 스윕:', pdf.split(/[\\/]/).pop(), '·', numPages, '페이지');
console.log('\n## 제목유형 × confidence 분포');
for (const [t, s] of Object.entries(byTitle)) {
  console.log(`  ${t.padEnd(20)} n=${s.n}  [0.85:${s.conf085} 0.55:${s.conf055} 0.3:${s.conf03} 0:${s.conf0}]  표문서판정:${s.tableDoc}`);
}
const errPages = rows.filter((r) => r.status !== 200);
console.log(`\n## 비200 응답: ${errPages.length}건`, errPages.map((r) => `p${r.page}(${r.status})`).join(' '));
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(rows, null, 1)); console.log('\nwrote', OUT); }
process.exit(0);
