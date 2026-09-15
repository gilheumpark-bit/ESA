import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PIPELINE_SOURCES, SNAPSHOT_DIR, verifySnapshots } from './snapshot-freshness.mjs';

const sha = (text) => createHash('sha256').update(text).digest('hex');
function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'esa-snapshot-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env,
      GIT_AUTHOR_DATE: '2026-09-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-09-01T00:00:00Z' } });
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  const write = (file, text) => { mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); writeFileSync(path.join(cwd, file), text); };
  const commit = () => { git('add', '-A'); git('commit', '-qm', 'fixture'); };
  git('init', '-q'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@localhost');
  for (const file of PIPELINE_SOURCES) write(file, 'original source');
  const input = 'fixtures/drawings/realworld/incoming/test.pdf';
  const output = `${SNAPSHOT_DIR}/test.json`;
  write(input, '%PDF test only'); write(output, '{"synthetic":true}'); commit();
  const sourceHashes = Object.fromEntries(PIPELINE_SOURCES.map((file) => [file, sha('original source')]));
  const provenance = { schemaVersion: 1, baseCommit: git('rev-parse', 'HEAD'), sourceHashes,
    sourceManifestSha256: sha(JSON.stringify(sourceHashes)),
    cases: [{ input, page: 1, inputSha256: sha('%PDF test only'), output, outputSha256: sha('{"synthetic":true}') }] };
  const save = () => { write(`${SNAPSHOT_DIR}/execution-provenance.json`, JSON.stringify(provenance)); commit(); };
  save();
  return { cwd, git, write, commit, provenance, save, input, output, check: () => verifySnapshots({ cwd }) };
}

test('full recorded evidence passes without timestamp assumptions', (t) => assert.equal(fixture(t).check().exitCode, 0));
test('source change with identical commit timestamp is stale', (t) => {
  const f = fixture(t); f.write(PIPELINE_SOURCES[0], 'changed'); f.commit(); assert.equal(f.check().exitCode, 1);
});
test('depth=1 cannot turn that stale evidence into PASS', (t) => {
  const f = fixture(t); f.write(PIPELINE_SOURCES[0], 'changed'); f.commit();
  const dest = `${f.cwd}-shallow`; t.after(() => rmSync(dest, { recursive: true, force: true }));
  const result = spawnSync('git', ['clone', '-q', '--depth=1', `file://${f.cwd}`, dest]);
  assert.equal(result.status, 0); assert.equal(verifySnapshots({ cwd: dest }).exitCode, 2);
});
for (const field of ['input', 'output']) test(`modified ${field} is not current evidence`, (t) => {
  const f = fixture(t); f.write(f[field], 'changed'); f.commit(); assert.equal(f.check().exitCode, 1);
});
test('dirty source is unverified even before a commit', (t) => {
  const f = fixture(t); f.write(PIPELINE_SOURCES[0], 'changed'); assert.equal(f.check().exitCode, 2);
});
test('missing watched source cannot be silently ignored', (t) => {
  const f = fixture(t); rmSync(path.join(f.cwd, PIPELINE_SOURCES[0])); f.commit(); assert.equal(f.check().exitCode, 2);
});
test('a missing provenance source digest is not a match', (t) => {
  const f = fixture(t); delete f.provenance.sourceHashes[PIPELINE_SOURCES[0]];
  f.provenance.sourceManifestSha256 = sha(JSON.stringify(f.provenance.sourceHashes)); f.save(); assert.equal(f.check().exitCode, 2);
});
test('unrecorded snapshot cannot silently expand the claimed dataset', (t) => {
  const f = fixture(t); f.write(`${SNAPSHOT_DIR}/extra.json`, '{}'); f.commit(); assert.equal(f.check().exitCode, 2);
});
test('deleting a recorded snapshot fails closed', (t) => {
  const f = fixture(t); rmSync(path.join(f.cwd, f.output)); f.commit(); assert.equal(f.check().exitCode, 2);
});
test('duplicate cases fail closed', (t) => {
  const f = fixture(t); f.provenance.cases.push(f.provenance.cases[0]); f.save(); assert.equal(f.check().exitCode, 2);
});
test('path traversal in provenance is rejected before reading', (t) => {
  const f = fixture(t); f.provenance.cases[0].input = 'fixtures/drawings/realworld/incoming/../../../../package.json';
  f.save(); assert.equal(f.check().exitCode, 2);
});
test('source manifest tampering is detected', (t) => {
  const f = fixture(t); f.provenance.sourceManifestSha256 = '0'.repeat(64); f.save(); assert.equal(f.check().exitCode, 2);
});
test('malformed provenance is a controlled failure', (t) => {
  const f = fixture(t); f.write(`${SNAPSHOT_DIR}/execution-provenance.json`, 'null'); f.commit(); assert.equal(f.check().exitCode, 2);
});
test('nonexistent execution ancestry is not accepted', (t) => {
  const f = fixture(t); f.provenance.baseCommit = '0'.repeat(40); f.save(); assert.equal(f.check().exitCode, 2);
});
for (const failure of [
  { status: 2, stdout: 'false' }, { status: null, signal: 'SIGTERM', stdout: 'false' },
  { status: 0, stdout: 'not-a-boolean' }, { status: 0, stdout: 'false', error: new Error('git failed') },
]) test(`Git failure/output never passes (${JSON.stringify(failure)})`, () => {
  assert.equal(verifySnapshots({ runGit: () => failure }).exitCode, 2);
});
test('CLI returns the gate status (not unconditional exit zero)', (t) => {
  const f = fixture(t); const script = new URL('../realworld-snapshot-freshness.mjs', import.meta.url);
  assert.match(readFileSync(script, 'utf8'), /process.exitCode = result.exitCode/);
  const result = spawnSync(process.execPath, [script.pathname], { cwd: f.cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  f.write(PIPELINE_SOURCES[0], 'changed'); f.commit();
  assert.equal(spawnSync(process.execPath, [script.pathname], { cwd: f.cwd }).status, 1);
});
