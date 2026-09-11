/** Fails on tracked development residue while leaving local files untouched. */
import { execFileSync } from 'node:child_process';
import { repositoryResidue } from './lib/repository-hygiene.mjs';

try {
  const files = execFileSync('git', ['ls-files', '--cached', '-z'], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  }).split('\0').filter(Boolean);
  const violations = repositoryResidue(files);
  if (violations.length) {
    console.error(violations.map((item) => `${JSON.stringify(item.path)}: ${item.reason}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`repository-hygiene: ${files.length} tracked paths checked; no development residue`);
  }
} catch {
  console.error('repository-hygiene: tracked-file inventory unavailable; no pass decision');
  process.exitCode = 2;
}
