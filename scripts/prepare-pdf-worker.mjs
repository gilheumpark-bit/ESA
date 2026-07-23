import { copyFile, cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../node_modules/pdfjs-dist/', import.meta.url));
const targetRoot = fileURLToPath(new URL('../public/vendor/pdfjs/', import.meta.url));
const source = join(packageRoot, 'legacy', 'build', 'pdf.worker.min.mjs');
const target = join(targetRoot, 'pdf.worker.min.mjs');

const sourceInfo = await stat(source);
if (!sourceInfo.isFile() || sourceInfo.size === 0) {
  throw new Error('PDF_WORKER_SOURCE_INVALID');
}

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
for (const directory of ['wasm', 'cmaps', 'standard_fonts', 'image_decoders']) {
  await cp(join(packageRoot, directory), join(targetRoot, directory), { recursive: true, force: true });
}

const required = [
  target,
  join(targetRoot, 'wasm', 'jbig2.wasm'),
  join(targetRoot, 'wasm', 'openjpeg.wasm'),
  join(targetRoot, 'wasm', 'qcms_bg.wasm'),
  join(targetRoot, 'standard_fonts', 'FoxitFixed.pfb'),
  join(targetRoot, 'cmaps', '78-H.bcmap'),
  join(targetRoot, 'image_decoders', 'pdf.image_decoders.min.mjs'),
];
for (const asset of required) {
  const info = await stat(asset);
  if (!info.isFile() || info.size === 0) throw new Error(`PDF_ASSET_INVALID:${asset}`);
}

console.log(`Prepared pdf.js worker and binary assets (${sourceInfo.size} byte worker).`);
