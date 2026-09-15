import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';

export const SNAPSHOT_DIR = 'fixtures/drawings/realworld/results';
export const PIPELINE_SOURCES = Object.freeze([
  'src/engine/topology/pdf-vector-parser.ts',
  'src/engine/topology/schedule-table-parser.ts',
  'src/engine/topology/spec-text.ts',
  'src/engine/topology/endpoint-snap.ts',
  'src/engine/topology/topology-graph.ts',
  'src/engine/review/circuit-review.ts',
  'src/engine/review/cross-constraint.ts',
  'src/app/api/pdf-drawing/route.ts',
]);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
class SnapshotError extends Error {
  constructor(message, exitCode = 2) { super(message); this.exitCode = exitCode; }
}

/** Verify recorded bytes, not commit dates. This proves only the declared
 * eight-source vector-PDF scope, not AI accuracy or every transitive dependency. */
export function verifySnapshots({ cwd = process.cwd(), runGit = spawnSync } = {}) {
  function git(args) {
    const result = runGit('git', args, { cwd, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
    if (result.error || result.signal || result.status !== 0 || typeof result.stdout !== 'string') {
      throw new SnapshotError('Git history cannot be verified.');
    }
    return result.stdout.trim();
  }
  function read(file) {
    const target = path.join(cwd, file);
    if (!lstatSync(target).isFile()) throw new SnapshotError('Evidence must be a regular file.');
    git(['ls-files', '--error-unmatch', '--', file]);
    return readFileSync(target);
  }
  function safePath(file, prefix) {
    return typeof file === 'string' && file.startsWith(`${prefix}/`)
      && !file.includes('\\') && !file.split('/').some((part) => part === '..' || part === '.' || !part);
  }
  try {
    // A shallow checkout cannot establish the recorded execution ancestry.
    if (git(['rev-parse', '--is-shallow-repository']) !== 'false') {
      throw new SnapshotError('Shallow or unknown history: use actions/checkout fetch-depth: 0.');
    }
    const provenancePath = `${SNAPSHOT_DIR}/execution-provenance.json`;
    const evidence = JSON.parse(read(provenancePath).toString('utf8'));
    if (!record(evidence) || evidence.schemaVersion !== 1 || !record(evidence.sourceHashes)
      || !digest(evidence.sourceManifestSha256) || !/^[a-f0-9]{40}$/.test(evidence.baseCommit ?? '')
      || !Array.isArray(evidence.cases) || evidence.cases.length === 0) {
      throw new SnapshotError('Missing or malformed execution provenance.');
    }
    if (hash(JSON.stringify(evidence.sourceHashes)) !== evidence.sourceManifestSha256) {
      throw new SnapshotError('Source manifest integrity mismatch.');
    }
    git(['merge-base', '--is-ancestor', evidence.baseCommit, 'HEAD']);
    const mismatches = [];
    for (const file of PIPELINE_SOURCES) {
      if (!digest(evidence.sourceHashes[file])) throw new SnapshotError(`Missing source digest: ${file}`);
      if (hash(read(file)) !== evidence.sourceHashes[file]) mismatches.push(file);
    }
    const outputs = new Set();
    const inputs = new Set();
    for (const item of evidence.cases) {
      if (!record(item) || !safePath(item.input, 'fixtures/drawings/realworld/incoming')
        || !safePath(item.output, SNAPSHOT_DIR) || item.output === provenancePath
        || !item.output.endsWith('.json') || !Number.isSafeInteger(item.page) || item.page < 1
        || !digest(item.inputSha256) || !digest(item.outputSha256) || outputs.has(item.output)) {
        throw new SnapshotError('Invalid or duplicate execution case.');
      }
      inputs.add(item.input);
      outputs.add(item.output);
      if (hash(read(item.input)) !== item.inputSha256) mismatches.push(item.input);
      if (hash(read(item.output)) !== item.outputSha256) mismatches.push(item.output);
    }
    const present = readdirSync(path.join(cwd, SNAPSHOT_DIR))
      .filter((name) => name.endsWith('.json') && name !== 'execution-provenance.json')
      .map((name) => `${SNAPSHOT_DIR}/${name}`);
    if (present.length !== outputs.size || present.some((file) => !outputs.has(file))) {
      throw new SnapshotError('Snapshot coverage differs from the execution provenance.');
    }
    const dirty = git(['status', '--porcelain', '--untracked-files=all', '--',
      ...PIPELINE_SOURCES, SNAPSHOT_DIR, ...inputs]);
    if (dirty) throw new SnapshotError('Uncommitted source or evidence: freshness is unverified.');
    if (mismatches.length) throw new SnapshotError(`Recorded bytes no longer match: ${[...new Set(mismatches)].join(', ')}`, 1);
    return { exitCode: 0, status: 'PASS', sources: PIPELINE_SOURCES.length, snapshots: outputs.size,
      message: 'Recorded vector-PDF source/input/output hashes match. Not an AI accuracy claim.' };
  } catch (error) {
    return { exitCode: error instanceof SnapshotError ? error.exitCode : 2, status: error instanceof SnapshotError && error.exitCode === 1 ? 'STALE' : 'UNVERIFIED',
      message: error instanceof SnapshotError ? error.message : 'Missing, unreadable or malformed snapshot evidence.' };
  }
}
