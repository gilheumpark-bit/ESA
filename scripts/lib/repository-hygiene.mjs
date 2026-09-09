/** Inspect tracked paths, not local build products. Never delete files automatically. */
const generatedRoots = new Set([
  '.next', 'node_modules', 'coverage', 'test-results', 'playwright-report', 'blob-report',
  '.cache', '.worktrees', '.superpowers', '.bug-hunter', '.byok-keys', '.calc-cache',
  '.ipfs-pins', 'tmp', 'dist', 'build',
]);
const scratchRoots = new Set([
  '.audit', '.review-patches', '.performance-lab', '.remaining', '.remaining-support',
  '.cleanup', '.cleanup-lab',
]);

export function repositoryResidue(paths) {
  const violations = [];
  for (const original of [...new Set(paths)].sort()) {
    const file = original.replaceAll('\\', '/').replace(/^\.\//, '');
    const parts = file.split('/');
    const basename = parts.at(-1);
    let reason;
    if (generatedRoots.has(parts[0])) reason = 'generated output or local runtime state';
    else if (scratchRoots.has(parts[0]) || /^\.tmp(?:-|$)/.test(parts[0])) reason = 'temporary transfer/audit workspace';
    else if (/^\.env(?:\.|$)/.test(basename) && !/\.example$/.test(basename)) reason = 'local environment file';
    else if (['.DS_Store', 'Thumbs.db', 'Desktop.ini'].includes(basename)
      || /(?:\.tsbuildinfo|\.sw[op]|\.orig|\.rej|~)$/.test(basename)) reason = 'editor/build/patch residue';
    if (reason) violations.push({ path: original, reason });
  }
  return violations;
}
