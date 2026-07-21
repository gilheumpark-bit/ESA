/**
 * 실도면 티어 실증 러너 — 로컬 PDF의 지정 페이지를 /api/pdf-drawing에 관통시키고
 * 요약(장치 유형별 카운트·정격 결속·전압·confidence)을 덤프한다.
 * 사용: node scripts/run-realworld-tier.mjs <pdf> <page> <outJson> [baseUrl]
 */
import fs from 'node:fs';

const [pdf, pageStr, outJson, baseArg] = process.argv.slice(2);
const BASE = baseArg ?? 'http://localhost:3010';
if (!pdf || !pageStr || !outJson) { console.error('usage: run-realworld-tier.mjs <pdf> <page> <outJson>'); process.exit(2); }

const bytes = fs.readFileSync(pdf);
const form = new FormData();
form.append('file', new Blob([bytes], { type: 'application/pdf' }), pdf.split(/[\\/]/).pop());
form.append('page', pageStr);
const res = await fetch(`${BASE}/api/pdf-drawing`, { method: 'POST', body: form });
let json = null;
try { json = await res.json(); } catch { /* non-JSON */ }
fs.writeFileSync(outJson, JSON.stringify({ status: res.status, json }, null, 2));

const d = json?.data ?? {};
const comps = d.components ?? [];
const byType = {};
for (const c of comps) byType[c.type] = (byType[c.type] ?? 0) + 1;
const rated = comps.filter((c) => c.rating || c.specs?.current || c.specs?.power).length;
const labeled = comps.filter((c) => c.label).length;
console.log(JSON.stringify({
  file: pdf.split(/[\\/]/).pop(), page: Number(pageStr), status: res.status,
  confidence: json?.parserInfo?.confidence ?? d.parserInfo?.confidence ?? null,
  parser: json?.parserInfo?.parser ?? null,
  components: comps.length, byType, rated, labeled,
  connections: (d.connections ?? []).length,
  voltages: [...new Set(comps.map((c) => c.specs?.voltage).filter(Boolean))].slice(0, 8),
  holds: json?.holds ?? d.holds ?? null,
}, null, 1));
