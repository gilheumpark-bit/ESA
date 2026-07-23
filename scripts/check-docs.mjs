import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.bug-hunter', '.claude', '.git', '.next', '.superpowers', '.worktrees', 'worktrees',
  '.tmp-sld-live', 'coverage', 'node_modules',
  'output', 'test-results', 'tmp',
]);

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else files.push(absolute);
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function localLinkTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (/^(?:https?:|mailto:|data:|app:)/i.test(trimmed)) return null;

  const withoutTitle = trimmed.startsWith('<')
    ? trimmed.slice(1, trimmed.indexOf('>'))
    : trimmed.split(/\s+["']/u, 1)[0];
  const withoutFragment = withoutTitle.split('#', 1)[0];
  if (!withoutFragment) return null;
  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    return withoutFragment;
  }
}

const markdownFiles = walk(root).filter((file) => file.endsWith('.md'));
const errors = [];

for (const file of markdownFiles) {
  const source = readFileSync(file, 'utf8');
  const linkSource = source.replace(/```[\s\S]*?```/gu, (block) => '\n'.repeat(block.split('\n').length - 1));
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/gu;
  for (const match of linkSource.matchAll(linkPattern)) {
    const target = localLinkTarget(match[1]);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!resolved.startsWith(root) || !existsSync(resolved)) {
      const line = linkSource.slice(0, match.index).split('\n').length;
      errors.push(`${relative(file)}:${line} broken link -> ${match[1]}`);
    }
  }
}

function requireIndexed(indexFile, directory, options = {}) {
  const indexAbsolute = path.join(root, indexFile);
  const indexSource = readFileSync(indexAbsolute, 'utf8');
  const directoryAbsolute = path.join(root, directory);
  const files = walk(directoryAbsolute).filter((file) => file.endsWith('.md'));
  for (const file of files) {
    if (relative(file) === indexFile || options.ignore?.has(relative(file))) continue;
    const basename = path.basename(file);
    if (!indexSource.includes(basename)) {
      errors.push(`${relative(file)} is not listed in ${indexFile}`);
    }
  }
}

const docsTopLevel = new Set(
  readdirSync(path.join(root, 'docs'))
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .map((name) => `docs/${name}`),
);
requireIndexed('docs/README.md', 'docs', {
  ignore: new Set([
    ...walk(path.join(root, 'docs/project/handoffs')).filter((file) => file.endsWith('.md')).map(relative),
    ...walk(path.join(root, 'docs/superpowers')).filter((file) => file.endsWith('.md')).map(relative),
    ...walk(path.join(root, 'docs/project')).filter((file) => file.endsWith('.md') && !relative(file).startsWith('docs/project/design/')).map(relative),
  ].filter((file) => !docsTopLevel.has(file))),
});
requireIndexed('docs/project/HANDOFFS.md', 'docs/project/handoffs');
requireIndexed('docs/superpowers/README.md', 'docs/superpowers');
requireIndexed('files/README.md', 'files');

const envLines = readFileSync(path.join(root, '.env.example'), 'utf8').split(/\r?\n/u);
const envCounts = new Map();
for (const line of envLines) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=/u);
  if (!match) continue;
  envCounts.set(match[1], (envCounts.get(match[1]) ?? 0) + 1);
}
for (const [key, count] of envCounts) {
  if (count > 1) errors.push(`.env.example duplicates ${key} (${count})`);
}

for (const required of [
  'README.md', 'ARCHITECTURE.md', 'PROJECT_STATE.md', 'docs/README.md',
  'docs/API_REFERENCE.md', 'docs/USER_GUIDE.md',
  'docs/project/IMPLEMENTATION_MAP.md', 'docs/VALIDATION_EVIDENCE.md',
]) {
  const absolute = path.join(root, required);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    errors.push(`required document missing: ${required}`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`docs-check: ${markdownFiles.length} markdown files, links and indexes OK\n`);
