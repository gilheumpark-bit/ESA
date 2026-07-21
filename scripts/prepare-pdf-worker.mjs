import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url));
const target = fileURLToPath(new URL('../public/vendor/pdf.worker.min.mjs', import.meta.url));

const sourceInfo = await stat(source);
if (!sourceInfo.isFile() || sourceInfo.size === 0) {
  throw new Error('PDF_WORKER_SOURCE_INVALID');
}

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`Prepared PDF worker (${sourceInfo.size} bytes).`);
