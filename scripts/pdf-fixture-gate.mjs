/**
 * PDF 파이프라인 라이브 게이트 — 합성 벡터 PDF를 실서버 /api/pdf-drawing에
 * 관통시켜 실도면 실측(2026-07-20)에서 발각된 결함 계열의 회귀를 exit code로
 * 판정한다. jest가 아니라 라이브 라우트를 쓰는 이유:
 *  1) pdfjs-dist는 ESM 전용이라 jest(CJS 변환)에서 import.meta로 깨진다 — 모킹은
 *     constructPath 인코딩 가정만 재확인하는 닫힌 순환이라 금지.
 *  2) 이 계열의 결함 4/8이 파서 밖(worker 경로·번들 제외·프록시 본문 캡·라우트
 *     번역)이었다 — 라우트 관통만이 전 층을 덮는다.
 *
 * 사용: 서버 기동 후  `node scripts/pdf-fixture-gate.mjs [baseUrl]`
 *       (기본 http://localhost:3010 · CI에선 next start 후 실행)
 * 잠그는 결함 계열:
 *  R1 pdfjs 브라우저 빌드 임포트(DOMMatrix 500)  R2 fake worker 경로 단절
 *  R3 confidence 상수 0.85(스캔본 과신)          R3b 표제란 텍스트 부하 환각
 *  R5 constructPath 미해독(선분 0 사문)          R6 프록시 10MB 절단(대용량 400 오진)
 *  R7 표 격자를 결선으로 오인(결속<합성접점)      R8 단독 G=발전기 오탐(접지 관례)
 */

const BASE = process.argv[2] ?? 'http://localhost:3010';
const ROUTE = `${BASE}/api/pdf-drawing`;

// ── 최소 유효 PDF 빌더 (xref 오프셋 정확 계산) ──────────────────────────────
function buildPdf(contentStream, { padToBytes = 0 } = {}) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  // 프록시 본문 캡 게이트용 패딩 — 주석 줄은 PDF 문법상 무해
  if (padToBytes > 0) {
    const line = '% ' + 'x'.repeat(78) + '\n';
    const need = Math.max(0, Math.ceil((padToBytes - 2000) / line.length));
    body += line.repeat(need);
  }
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  const full = body + xref + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  const bytes = new Uint8Array(full.length);
  for (let i = 0; i < full.length; i++) bytes[i] = full.charCodeAt(i) & 0xff;
  return bytes;
}
const text = (x, y, s) => `BT /F1 10 Tf ${x} ${y} Td (${s}) Tj ET\n`;
const stroke = (x1, y1, x2, y2) => `${x1} ${y1} m ${x2} ${y2} l S\n`;

async function post(name, bytes, page = 1) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
  form.append('page', String(page));
  const res = await fetch(ROUTE, { method: 'POST', body: form });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

const failures = [];
function check(caseName, cond, detail) {
  if (cond) { console.log(`  PASS ${caseName}`); }
  else { console.log(`  FAIL ${caseName} — ${detail}`); failures.push(caseName); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 케이스 정의 ──────────────────────────────────────────────────────────────
// 결선 끝점은 라벨 앵커의 스냅 허용 반경 안에 있어야 한다 — 첫 작성 때
// x=140에 그린 두 번째 결선이 앵커에서 40pt 떨어져 합성 접점이 되며
// snapped==junctioned 동률 강등(0.55)을 유발했다(게이트 첫 실행이 발각).
const circuit =
  text(100, 700, 'TR 1000KVA') + text(100, 500, 'MCCB 100A') +
  stroke(103, 698, 103, 505) + stroke(107, 698, 107, 505);

const titleOnly =
  text(100, 700, 'PROJECT TITLE SHEET') + text(100, 680, 'SCALE NS') + text(100, 660, 'SHEET 1 OF 3');

const grid =
  stroke(100, 100, 200, 100) + stroke(200, 100, 200, 150) + stroke(200, 150, 100, 150) +
  stroke(100, 150, 100, 100) + stroke(200, 100, 300, 100) + stroke(300, 100, 300, 150) + stroke(300, 150, 200, 150);

const fillOnly = text(100, 700, 'NOTE AREA') + '100 100 m 200 100 l 200 150 l 100 150 l h f\n';

const singleG = text(100, 700, 'G') + text(100, 600, 'GEN 500KVA') + stroke(105, 698, 105, 605);

console.log(`PDF fixture gate → ${ROUTE}`);

// 서버 생존 확인 (게이트 자체의 오탐 방지)
try { await fetch(BASE, { method: 'HEAD' }); }
catch { console.error(`서버가 응답하지 않습니다: ${BASE} — 기동 후 재실행하세요.`); process.exit(2); }

{
  const r = await post('circuit.pdf', buildPdf(circuit));
  const c = r.json?.data?.components ?? [];
  check('R1/R2/R5 회로형: 200 + TR/MCCB + 결선≥1 + conf 0.85',
    r.status === 200 && c.some(x => x.type === 'transformer') && c.some(x => x.type === 'breaker')
      && (r.json?.data?.connections?.length ?? 0) >= 1 && r.json?.parserInfo?.confidence === 0.85,
    `status ${r.status} conf ${r.json?.parserInfo?.confidence} types ${JSON.stringify(c.map(x => x.type))}`);
}
await sleep(800);
{
  const r = await post('title-only.pdf', buildPdf(titleOnly));
  check('R3/R3b 표제란만: conf 0.3 + 설비 환각 0',
    r.status === 200 && r.json?.parserInfo?.confidence === 0.3 && (r.json?.data?.components?.length ?? -1) === 0,
    `status ${r.status} conf ${r.json?.parserInfo?.confidence} comp ${r.json?.data?.components?.length}`);
}
await sleep(800);
{
  const r = await post('grid.pdf', buildPdf(grid));
  check('R7 표 격자: 결선>0인데 conf 0.55 강등 + 사유 명시',
    r.status === 200 && r.json?.parserInfo?.confidence === 0.55
      && (r.json?.data?.connections?.length ?? 0) > 0
      && String(r.json?.data?.rawDescription ?? '').includes('표 격자'),
    `status ${r.status} conf ${r.json?.parserInfo?.confidence} conn ${r.json?.data?.connections?.length}`);
}
await sleep(800);
{
  const r = await post('fill-only.pdf', buildPdf(fillOnly));
  check('페인트 필터: fill 전용 경로는 선분 0 → conf 0.3',
    r.status === 200 && r.json?.parserInfo?.confidence === 0.3
      && String(r.json?.data?.rawDescription ?? '').includes('0 line segments'),
    `status ${r.status} conf ${r.json?.parserInfo?.confidence} desc ${r.json?.data?.rawDescription}`);
}
await sleep(800);
{
  const r = await post('single-g.pdf', buildPdf(singleG));
  const gens = (r.json?.data?.components ?? []).filter(x => x.type === 'generator');
  check('R8 단독 G≠발전기 · GEN=발전기 1건',
    r.status === 200 && gens.length === 1 && gens[0].label === 'GEN 500KVA',
    `status ${r.status} generators ${JSON.stringify(gens.map(g => g.label))}`);
}
await sleep(800);
{
  const r = await post('big-circuit.pdf', buildPdf(circuit, { padToBytes: 12 * 1024 * 1024 }));
  check('R6 12MB 대용량: 프록시 절단 없이 200 파싱',
    r.status === 200 && (r.json?.data?.components?.length ?? 0) >= 2,
    `status ${r.status} err ${r.json?.error ?? ''} comp ${r.json?.data?.components?.length}`);
}
await sleep(800);
{
  const junk = new TextEncoder().encode('this is not a pdf at all');
  const r = await post('junk.pdf', junk);
  check('비PDF: 500이 아니라 400 정직 거부',
    r.status === 400, `status ${r.status} body ${JSON.stringify(r.json)?.slice(0, 120)}`);
}

console.log(failures.length === 0 ? '\nGATE PASS (7/7)' : `\nGATE FAIL — ${failures.length}건: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
