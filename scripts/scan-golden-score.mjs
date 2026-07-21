/**
 * 스캔 골든 채점기 — V3 문서(JSON) vs adjudicated 텍스트-축 골든 라벨 대조.
 * 벡터 파일럿(2026-07-21: 검출 73→100%·정격 0→100%)과 동일한 3축 채점의 스캔판.
 *
 * 사용(키 설정 후 전체 루프):
 *   1) 입력 생성: node scripts/fixtures/rasterize-golden-scan.mjs fixtures/drawings/local/kimm-panelboard-sld.pdf 14 <tmp>
 *   2) 서버:     DRAWING_JOB_STORE_DIR=<tmp>/jobstore npx next start -p 3010
 *      (Vision 키 필요: GOOGLE_GENERATIVE_AI_API_KEY | OPENAI_API_KEY | ANTHROPIC_API_KEY 중 1+ — .env.local)
 *   3) 실행:     curl -s -X POST -F "file=@<tier>.png;type=image/png" http://localhost:3010/api/drawing-jobs -o <tier>.result.json
 *   4) 채점:     node scripts/scan-golden-score.mjs <tier>.result.json fixtures/drawings/golden/kimm-panelboard-sld.p14.adjudicated.json
 *
 * 채점 축: 기기 검출률(타입별) · 정격 결속률 · 환각(골든에 없는 확정) · HOLD 정직성.
 * L3 판정 참고선: clean ≥90% 검출·≥85% 정격, heavy에서 환각 0(HOLD 증가는 감점 아님 — 무발명 원칙).
 */
import { readFileSync } from 'node:fs';

const [resultPath, goldenPath] = process.argv.slice(2);
if (!resultPath || !goldenPath) {
  console.error('usage: node scripts/scan-golden-score.mjs <v3-result.json> <adjudicated.json>');
  process.exit(2);
}
const raw = JSON.parse(readFileSync(resultPath, 'utf8'));
const doc = (raw.data && raw.data.document) || raw.data || raw.document || raw;
const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));

const gTotal = golden.totals.totalBreakers;
const gMccb = golden.totals.MCCB;
const gElb = golden.totals.ELB;
const gRatings = new Map();
for (const row of golden.branchRows) {
  const key = `${row[3]} ${row[4]}-${row[5]}`.toUpperCase();
  gRatings.set(key, (gRatings.get(key) ?? 0) + 1);
}
for (const p of golden.panels) {
  const m = p.main.match(/(MCCB)\s+(\dP)\s+(\S+)/i);
  if (m) {
    const key = `${m[1]} ${m[2]}-${m[3]}`.toUpperCase();
    gRatings.set(key, (gRatings.get(key) ?? 0) + 1);
  }
}

const symbols = doc.evidenceGraph?.symbols ?? [];
const isBreakerish = (s) => {
  const t = `${s.typeCandidates?.join(' ') ?? s.type ?? ''} ${s.label ?? ''} ${s.text ?? ''}`.toUpperCase();
  return /BREAKER|MCCB|ELB|ELCB|MCB|차단기/.test(t);
};
const br = symbols.filter(isBreakerish);
const withRating = br.filter((s) => {
  const t = `${s.label ?? ''} ${s.text ?? ''} ${JSON.stringify(s.attributes ?? {})}`;
  return /\d{2,4}\s*(?:AF)?\s*\/\s*\d{2,4}\s*(?:AT)?/.test(t) || s.ratedValueIds?.length;
});
const mccb = br.filter((s) => /MCCB/i.test(`${s.label ?? ''}${s.text ?? ''}`)).length;
const elb = br.filter((s) => /EL[CB]?B/i.test(`${s.label ?? ''}${s.text ?? ''}`)).length;

const counts = doc.equipmentCounts ?? [];
const unresolved = doc.unresolvedItems ?? [];
const status = doc.jobStatus;

console.log('=== 스캔 골든 채점 ===');
console.log(`골든: 차단기 ${gTotal} (MCCB ${gMccb} · ELB ${gElb}) · 정격 스키마 ${gRatings.size}종`);
console.log(`검출: breaker-계열 심볼 ${br.length}/${gTotal} = ${Math.round((br.length / gTotal) * 100)}% (MCCB표기 ${mccb} · ELB표기 ${elb})`);
console.log(`정격 결속: ${withRating.length}/${br.length} → 골든 기준 ${Math.round((withRating.length / gTotal) * 100)}%`);
console.log(`환각 검사: 검출 ${br.length} vs 골든 ${gTotal} → 초과분 ${Math.max(0, br.length - gTotal)} (0이어야 함 — 초과=유령 후보)`);
console.log(`jobStatus: ${status} · unresolved ${unresolved.length}건 · equipmentCounts ${counts.length}행`);
console.log(`HOLD 정직성: ${status === 'PARTIAL' || unresolved.length > 0 ? '보류 신호 존재(무발명 경로 생존)' : 'COMPLETE — 전량 확정 주장(환각 검사와 교차 확인 필수)'}`);
