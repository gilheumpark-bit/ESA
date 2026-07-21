/**
 * 골든 스캔 입력 생성기 — 정답을 아는 벡터 페이지를 스캔 모달리티 3계층으로 변환.
 * 정답(adjudicated 라벨)은 내용 불변이라 그대로 재사용된다.
 *
 * 사용:
 *   node scripts/fixtures/rasterize-golden-scan.mjs <pdf경로> <페이지> <출력폴더> [scale=2]
 * 산출:
 *   {이름}-p{페이지}-raster.png       클린 래스터 (스캔 難이도 1)
 *   {이름}-p{페이지}-scan-light.png   경열화: 1.2° 회전+감광 (사무 복합기급 · 難이도 2)
 *   {이름}-p{페이지}-scan-heavy.png   중열화: 2.5° 회전+가우시안 노이즈+저대비+블러 (구형 스캐너급 · 難이도 3)
 * 주의: heavy의 노이즈는 시드 고정이 아니라 바이트 재현은 안 되나 통계 특성은 동일 — 골든 채점에 영향 없음.
 */
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [pdfPath, pageStr, outDir, scaleStr] = process.argv.slice(2);
if (!pdfPath || !pageStr || !outDir) {
  console.error('usage: node scripts/fixtures/rasterize-golden-scan.mjs <pdf> <page> <outDir> [scale=2]');
  process.exit(2);
}
const pageNo = Number(pageStr);
const scale = Number(scaleStr ?? 2);
const stem = `${basename(pdfPath).replace(/\.pdf$/i, '')}-p${pageNo}`;

const { createCanvas, Path2D, DOMMatrix, ImageData } = await import('@napi-rs/canvas');
globalThis.DOMMatrix ??= DOMMatrix;
globalThis.Path2D ??= Path2D;
globalThis.ImageData ??= ImageData;
const pdfjs = await import(pathToFileURL(resolve('node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
const sharp = (await import('sharp')).default;

const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: true }).promise;
const page = await doc.getPage(pageNo);
const vp = page.getViewport({ scale });
const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, canvas.width, canvas.height);
await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
const clean = canvas.toBuffer('image/png');
const cleanPath = join(outDir, `${stem}-raster.png`);
await sharp(clean).png().toFile(cleanPath);

await sharp(clean).rotate(1.2, { background: '#ffffff' }).modulate({ brightness: 0.97 }).png()
  .toFile(join(outDir, `${stem}-scan-light.png`));

const meta = await sharp(clean).metadata();
const noise = await sharp({
  create: { width: meta.width, height: meta.height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 22 } },
}).png().toBuffer();
await sharp(clean).rotate(2.5, { background: '#ffffff' })
  .composite([{ input: noise, blend: 'overlay' }])
  .modulate({ brightness: 0.93, saturation: 0.0 }).blur(0.6).png()
  .toFile(join(outDir, `${stem}-scan-heavy.png`));

console.log(`saved 3 tiers → ${outDir}/${stem}-{raster,scan-light,scan-heavy}.png (${canvas.width}x${canvas.height})`);
