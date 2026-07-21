/**
 * 실도면 페이지 색출 프로브 — 페이지별 텍스트 항목수·전기 키워드 매칭을 덤프한다.
 * 사용: node scripts/probe-pdf-pages.mjs <pdf> [maxPages]
 * 목적: 대형 설계세트(수십p)에서 단선도/분전반 일람 페이지를 찾고 벡터성(text>0)을 판정.
 */
import fs from 'node:fs';

const KEYWORDS = /(단선|결선도|분전반|수변전|수전|MCCB|ELB|ELCB|VCB|ACB|변압기|TR-|kVA|판넬|PANEL|SINGLE\s*LINE|일람표|간선|계통도)/i;

const file = process.argv[2];
const maxPages = Number(process.argv[3] ?? 999);
if (!file) { console.error('usage: probe-pdf-pages.mjs <pdf> [maxPages]'); process.exit(2); }

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true }).promise;
console.log(`# ${file} pages=${doc.numPages}`);
const limit = Math.min(doc.numPages, maxPages);
for (let p = 1; p <= limit; p++) {
  try {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.length;
    const joined = tc.items.map((i) => i.str).join(' ');
    const kw = joined.match(KEYWORDS)?.[0] ?? '';
    const title = joined.slice(0, 90).replace(/\s+/g, ' ');
    if (items === 0 || kw) console.log(`p${p}\ttext=${items}\tkw=${kw}\t${title}`);
    page.cleanup();
  } catch (e) {
    console.log(`p${p}\tERROR\t${e.message}`);
  }
}
process.exit(0);
