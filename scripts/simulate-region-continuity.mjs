import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const manifestPath = fileURLToPath(new URL('../fixtures/drawings/continuity/manifest.json', import.meta.url));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.grid.columns !== 4 || manifest.grid.rows !== 4 || manifest.cases.length < 1) {
  throw new Error('CONTINUITY_MANIFEST_INVALID');
}
const jestBin = fileURLToPath(new URL('../node_modules/jest/bin/jest.js', import.meta.url));
const result = spawnSync(process.execPath, [
  jestBin, '--runInBand', 'src/agent/drawing/__tests__/region-continuity-integration.test.ts',
], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit', shell: false });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Region continuity simulation passed: ${manifest.cases.length} manifest case(s), 4x4 grid.`);
