/**
 * 실도면 정답 앵커 생성기 — 도면 자신의 벡터 텍스트 층에서 뽑는다.
 *
 * 왜: 도면 판독 판별식을 만들 때마다 "이 둘이 같은 기기인가"의 정답이 없어
 * 내 추론으로 보정했고, 그 때문에 기각당했다(원장 17차). 정답 라벨이 병목이다.
 *
 * 이 앵커는 **사람 2인 블라인드 판정이 아니다.** CAD 가 출력한 벡터 텍스트를
 * 그대로 읽은 것이라 "도면이 스스로 무엇을 어디에 적었는가"의 정답이며,
 * "그 자리에 어떤 물리 기기가 있는가"의 정답은 아니다. 그 구분은 산출물에
 * `provenance` 로 박아 둔다.
 *
 * 사용: npx tsx scripts/build-vector-anchor.mts <pdf> <page> <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { detectComponentType, parsePdfToSLD } from '../src/engine/topology/pdf-vector-parser';

const [pdf, pageStr, out] = process.argv.slice(2);
if (!pdf || !pageStr || !out) {
  console.error('usage: npx tsx scripts/build-vector-anchor.mts <pdf> <page> <out.json>');
  process.exit(2);
}
const bytes = readFileSync(pdf);
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const result: any = await parsePdfToSLD(ab, { pageNumber: Number(pageStr), deadlineMs: 180_000 });

const anchors = (result.sourceTexts ?? [])
  .map((t: any) => ({ text: String(t.text ?? '').replace(/\s+/g, ' ').trim(), position: t.position }))
  .filter((t: any) => t.text.length > 0 && Number.isFinite(t.position?.x) && Number.isFinite(t.position?.y))
  .map((t: any) => ({ ...t, type: detectComponentType(t.text) }))
  // `load` 는 분류 실패 시의 **기본값 폴백**이다. "110V", "3∅3W 6.6KV" 같은
  // 제원·치수 문자가 전부 여기로 떨어진다(실측 858건 중 661건). 정답 앵커에
  // 폴백을 넣으면 앵커가 아니라 잡음이 된다. 패턴이 실제로 맞은 것만 남긴다.
  //
  // 대가: 패턴에 없는 진짜 부하(설비 고유명)는 앵커에서 빠진다. 이 앵커는
  // **완전한 기기 목록이 아니라 확실한 기기 목록**이다 — 재현율이 아니라
  // 정밀도를 위해 만든 것이므로 그 방향이 맞다.
  .filter((t: any) => t.type && t.type !== 'other' && t.type !== 'load');

const byType: Record<string, number> = {};
for (const a of anchors) byType[a.type] = (byType[a.type] ?? 0) + 1;

writeFileSync(out, JSON.stringify({
  schemaVersion: 1,
  source: pdf,
  page: Number(pageStr),
  sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  provenance: 'pdf-vector-text-layer',
  provenanceNote:
    'CAD 가 출력한 벡터 텍스트를 그대로 읽었다. "도면이 무엇을 어디에 적었는가"의 정답이며, '
    + '"그 자리에 어떤 물리 기기가 있는가"의 정답이 아니다. 사람 2인 블라인드 판정이 아니다.',
  coordinateSpace: 'page-normalized-0-100',
  anchorCount: anchors.length,
  excludedFallbackNote: '분류 폴백(load)은 제외했다. 이 앵커는 완전한 기기 목록이 아니라 확실한 기기 목록이다.',
  countsByType: byType,
  anchors,
}, null, 1));
console.log(`앵커 ${anchors.length}건 → ${out}`);
console.log('종류별:', JSON.stringify(byType));
