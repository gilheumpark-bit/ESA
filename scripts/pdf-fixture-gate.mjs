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
  // 프록시 본문 캡 게이트용 패딩. 수십만 개의 주석 줄은 pdfjs가 각 줄을
  // 토큰화하느라 게이트 자체가 CPU 병목이 된다. 페이지에서 참조하지 않는
  // 단일 스트림은 동일한 multipart 크기를 만들면서 판독 대상은 오염하지 않는다.
  if (padToBytes > 0) {
    const paddingLength = Math.max(0, padToBytes - 2000);
    objects.push(`<< /Length ${paddingLength} >>\nstream\n${'x'.repeat(paddingLength)}\nendstream`);
  }
  let body = '%PDF-1.4\n';
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
let totalChecks = 0;
function check(caseName, cond, detail) {
  totalChecks += 1;
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
// R3c — 키워드 없는 순수 스펙/표제란 라벨은 phantom 컴포넌트가 되면 안 된다
// (독립 심사 IND-1 adversary 라이브 재현: "수전전압 22.9kV"·"380V"·"3P 3W
// 220V" 같은 도면 상시 라벨이 phantom load + 가짜 부하계산을 만들었다).
const bareSpecs = text(100, 700, '수전전압 22.9kV') + text(100, 680, '380/220V') +
  text(100, 660, '100A') + text(100, 640, '3P 3W 220V');

const singleG = text(100, 700, 'G') + text(100, 600, 'GEN 500KVA') + stroke(105, 698, 105, 605);
// R8b — 단독 M(모터 심볼이자 흔한 라벨)은 스펙 증거 없이는 phantom 모터가
// 되면 안 된다(독립 심사 adversary 라이브 재현). "M 5.5KW"는 스펙 증거가
// 있으니 모터로 승격돼야 한다 — 반례로 함께 검증.
const singleM = text(100, 700, 'M') + text(100, 680, 'PUMP ROOM') +
  text(100, 600, 'M 5.5kW') + stroke(105, 698, 105, 605);

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
  const r = await post('bare-specs.pdf', buildPdf(bareSpecs));
  const comps = r.json?.data?.components ?? [];
  const calc = r.json?.calcChain ?? [];
  check('R3c 키워드 없는 스펙/표제란 → phantom 0 + 가짜 계산 0',
    r.status === 200 && comps.length === 0 && calc.length === 0,
    `status ${r.status} comps ${JSON.stringify(comps.map(c => [c.label, c.type]))} calc ${calc.length}`);
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
  const r = await post('single-m.pdf', buildPdf(singleM));
  const motors = (r.json?.data?.components ?? []).filter(x => x.type === 'motor');
  check('R8b 단독 M≠모터(스펙 무) · "M 5.5KW"=모터 1건',
    r.status === 200 && motors.length === 1 && motors[0].rating === '5.5kW',
    `status ${r.status} motors ${JSON.stringify(motors.map(m => [m.label, m.rating]))}`);
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

// ── 2026-07-21 3차 실증(실도면 티어) 회귀 잠금 R9~R12 ─────────────────────────
// R9 — 실물 케이블 스케줄 표: 표제 반복(≥2) + 장치가 앵커에 붙는 격자에서
// conf 0.55 강등(EE-007이 conf 0.85 회로 165장치로 발명되던 결함).
// 표제 2회 + (circuit 픽스처와 동일하게) 끝점이 텍스트 앵커에 스냅되는 세로
// 괘선 — 실물 표(EE-007)처럼 anchored=true인데도 표제 증거로 강등돼야 한다.
// (수평 격자만 그리면 anchored=false가 되어 구방어(R7)가 먼저 발화 — 이 케이스가
// 잠그는 건 "anchored를 뚫는 표"다.)
const tableDoc =
  text(100, 760, 'CABLE SCHEDULE (B1F)') + text(300, 760, 'CABLE SCHEDULE (1F)') +
  text(100, 700, 'MCCB 3P 100/75') + text(100, 500, 'MCCB 3P 50/30') +
  text(300, 700, 'MCCB 3P 125/100') + text(300, 500, 'ELB 2P 30/20') +
  stroke(103, 698, 103, 505) + stroke(303, 698, 303, 505);
await sleep(800);
{
  const r = await post('table-doc.pdf', buildPdf(tableDoc));
  check('R9 표 문서(표제≥2): conf 0.55 강등 + 사유 명시',
    r.status === 200 && r.json?.parserInfo?.confidence === 0.55
      && String(r.json?.data?.rawDescription ?? '').includes('표 문서'),
    `status ${r.status} conf ${r.json?.parserInfo?.confidence} desc ${String(r.json?.data?.rawDescription ?? '').slice(-80)}`);
}

// R10 — 주석 문장 게이트: 키워드를 품은 영문 노트가 장치로 승격되지 않는다
// (RSC 실도면에서 "If you do not have VCB but you…"가 breaker로 환각).
const proseNote =
  text(100, 700, 'If you do not have VCB but you') + text(100, 680, 'have LBS in HT panel') +
  text(100, 500, 'VCB 630A') + stroke(103, 698, 103, 505);
await sleep(800);
{
  const r = await post('prose-note.pdf', buildPdf(proseNote));
  const breakers = (r.json?.data?.components ?? []).filter(x => x.type === 'breaker');
  const panels = (r.json?.data?.components ?? []).filter(x => x.type === 'panel');
  check('R10 주석 문장≠장치 · 실라벨 VCB 630A=차단기 1건',
    r.status === 200 && breakers.length === 1 && breakers[0].label === 'VCB 630A' && panels.length === 0,
    `status ${r.status} breakers ${JSON.stringify(breakers.map(b => b.label))} panels ${panels.length}`);
}

// R11 — 좌표 유래 가공 길이 금지: 종이 좌표(축척 없음)에서 length를 발명해
// calcChain cable-sizing이 0.09~0.37m로 오염되던 결함. 인쇄된 길이가 없으면
// 연결 length는 없고 길이 의존 계산도 없다.
await sleep(800);
{
  const r = await post('no-length.pdf', buildPdf(circuit));
  const conns = r.json?.data?.connections ?? [];
  const calcSteps = r.json?.calcChain ?? [];
  const fabricated = conns.filter(c => c.length != null);
  const lengthCalcs = calcSteps.filter(s => JSON.stringify(s.inputs ?? {}).includes('length'));
  check('R11 가공 길이 0 + 길이 의존 계산 0',
    r.status === 200 && conns.length >= 1 && fabricated.length === 0 && lengthCalcs.length === 0,
    `status ${r.status} conns ${conns.length} fabricated ${fabricated.length} lengthCalcs ${lengthCalcs.length}`);
}

// R12 — 90° 회전 플롯 정규화: CAD가 가로 도면을 세로 페이지에 회전 배치하면
// 결속 기하가 전부 어긋나던 결함(RSC 실측 결속 70%→20%). 회전 텍스트(Tm 행렬)
// 과반이면 좌표계를 되돌려 세로 결속(스펙이 라벨 아래)이 성립해야 한다.
// 좌표는 페이지 박스(595×842) 안에 두어야 한다 — 박스 밖 텍스트는 pdfjs가
// 컬링해 픽스처 자체가 사문이 된다(1차 작성 x=700이 그랬다·실측 "2 text items").
const rotText = (x, y, s) => `BT /F1 10 Tf 0 1 -1 0 ${x} ${y} Tm (${s}) Tj ET\n`;
const rotated =
  rotText(100, 700, 'TR 1000KVA') + rotText(100, 500, 'MCCB 100A') +
  rotText(130, 500, 'SPARE') +
  stroke(103, 698, 103, 505) + stroke(107, 698, 107, 505);
await sleep(800);
{
  const r = await post('rotated.pdf', buildPdf(rotated));
  const comps = r.json?.data?.components ?? [];
  const tr = comps.find(x => x.type === 'transformer');
  const brk = comps.find(x => x.type === 'breaker');
  check('R12 회전 도면: TR/MCCB 검출 + 결선≥1 유지',
    r.status === 200 && Boolean(tr) && Boolean(brk) && (r.json?.data?.connections?.length ?? 0) >= 1,
    `status ${r.status} types ${JSON.stringify(comps.map(c => c.type))} conn ${r.json?.data?.connections?.length}`);
}

// ── 2026-07-21 초급 하이브리드 검토(review) 회귀 잠금 R13 ────────────────────
// R13 — 추출값→KEC 대조→부적합: 200AT 차단기에 4sq 케이블이면 허용전류 초과
// FAIL이 review에 실려야 한다(사슬 전체: 추출→계산→기준→결론).
const reviewFail =
  text(100, 700, 'MCCB 3P-225/200') + text(100, 500, 'MCC-1') +
  text(130, 600, 'CV 4sq') +
  stroke(103, 698, 103, 505);
await sleep(800);
{
  const r = await post('review-fail.pdf', buildPdf(reviewFail));
  const fails = (r.json?.review?.findings ?? []).filter(f => f.rule === 'CABLE-AMPACITY' && f.severity === 'FAIL');
  check('R13 검토 사슬: 200AT vs 4sq → CABLE-AMPACITY FAIL + KEC 출처 결박',
    r.status === 200 && fails.length >= 1 && String(fails[0]?.limit?.source ?? '').includes('KEC'),
    `status ${r.status} review ${JSON.stringify(r.json?.review?.summary ?? r.json?.review)?.slice(0, 140)}`);
}

// R13b — AT>AF 표기 오류(3P-50/100 = 50AF/100AT)는 FAIL로 검출된다.
const reviewAtAf =
  text(100, 700, 'MCCB 3P-50/100') + text(100, 500, 'MCC-1') +
  stroke(103, 698, 103, 505);
await sleep(800);
{
  const r = await post('review-ataf.pdf', buildPdf(reviewAtAf));
  const fails = (r.json?.review?.findings ?? []).filter(f => f.rule === 'AT-LE-AF' && f.severity === 'FAIL');
  check('R13b AT>AF 표기 오류 FAIL 검출',
    r.status === 200 && fails.length === 1,
    `status ${r.status} findings ${JSON.stringify((r.json?.review?.findings ?? []).map(f => [f.rule, f.severity]))?.slice(0, 140)}`);
}

// ── 2026-07-23 표→판정 결박(H7) 회귀 잠금 R14 ────────────────────────────────
// R14 — 케이블 스케줄 표는 결선(topology)을 못 믿어 conf 0.55로 강등되지만, 표 행
// 데이터(텍스트 0.99)로는 판정할 수 있다. 헤더 행(REMARK/CABLE SCHEDULE 열) +
// 데이터 행(차단기·케이블 쌍)이 있으면 review가 '생략'이 아니라 표 경로로 판정을
// 낸다. 결선도에서 UNKNOWN이던 분기 케이블-차단기 쌍이 이 표로 해소된다.
// EE-007 실측 표기: REMARK에 "MCCB 3P 225/200", CABLE에 "FCV 4sq"(허용전류 초과).
const scheduleReview =
  text(100, 760, 'CABLE SCHEDULE (B1F)') + text(300, 760, 'CABLE SCHEDULE (1F)') +
  text(100, 720, 'NO') + text(180, 720, 'REMARK') + text(300, 720, 'CABLE SCHEDULE') +
  text(100, 690, '1') + text(180, 690, 'MCCB 3P 225/200') + text(300, 690, 'FCV 4sq') +
  text(100, 660, '2') + text(180, 660, 'MCCB 3P 100/150') + text(300, 660, 'CV 16sq') +
  stroke(103, 758, 103, 655) + stroke(303, 758, 303, 655);
await sleep(800);
{
  const r = await post('schedule-review.pdf', buildPdf(scheduleReview));
  const review = r.json?.review;
  const findings = review?.findings ?? [];
  const cableFail = findings.some(f => f.rule === 'CABLE-AMPACITY' && f.severity === 'FAIL'
    && String(f.limit?.source ?? '').includes('KEC'));
  const atafFail = findings.some(f => f.rule === 'AT-LE-AF' && f.severity === 'FAIL');
  check('R14 표 문서→판정: conf 0.55 강등에도 표 행으로 CABLE-AMPACITY FAIL + AT>AF FAIL 산출(생략 아님)',
    r.status === 200 && review && !review.skipped && cableFail && atafFail,
    `status ${r.status} skipped ${review?.skipped} findings ${JSON.stringify(findings.map(f => [f.rule, f.severity]))?.slice(0, 160)}`);
}

console.log(failures.length === 0 ? `\nGATE PASS (${totalChecks}/${totalChecks})` : `\nGATE FAIL — ${failures.length}/${totalChecks}건: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
