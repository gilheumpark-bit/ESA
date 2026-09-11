import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { auditArguments, auditScopeFromArgs, inspectAuditExecution } from './audit-policy.mjs';

const report = (patch = {}) => ({ auditReportVersion: 2, metadata: { vulnerabilities: {
  info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...patch,
} } });
const result = (body = report(), patch = {}) => ({ status: 0, signal: null, stdout: JSON.stringify(body), ...patch });

test('production stays the default while developer dependencies need an explicit scope', () => {
  assert.equal(auditScopeFromArgs([]), 'production');
  assert.deepEqual(auditArguments('production'), ['audit', '--omit=dev', '--json']);
  assert.equal(auditScopeFromArgs(['--include-dev']), 'all');
  assert.deepEqual(auditArguments('all'), ['audit', '--include=dev', '--json']);
});
for (const args of [['--skip'], ['--include-dev', '--skip'], ['--omit=dev'], ['--include-dev', '--include-dev']]) {
  test(`unknown arguments cannot silently narrow audit coverage: ${args}`, () => assert.throws(() => auditScopeFromArgs(args)));
}
test('valid zero report passes', () => assert.equal(inspectAuditExecution(result()).code, 0));
for (const level of ['high', 'critical']) {
  test(`${level} findings fail even when npm exits zero`, () => {
    assert.equal(inspectAuditExecution(result(report({ [level]: 1, total: 1 }))).code, 1);
    assert.equal(inspectAuditExecution(result(report({ [level]: 1, total: 1 }), { status: 1 })).code, 1);
  });
}
test('lower-severity findings stay visible without changing the established critical/high policy', () => {
  const decision = inspectAuditExecution(result(report({ moderate: 2, total: 2 }), { status: 1 }));
  assert.equal(decision.code, 0);
  assert.equal(decision.counts.total, 2);
});
for (const patch of [{ status: null }, { status: 2 }, { signal: 'SIGTERM' }, { error: new Error('timeout') }]) {
  test(`process failure with a zero-count JSON never passes: ${JSON.stringify(patch)}`, () => assert.equal(inspectAuditExecution(result(report(), patch)).code, 2));
}
for (const body of [null, {}, { error: { code: 'E503' }, ...report() }, { ...report(), auditReportVersion: 3 }, report({ high: -1 }), report({ total: 1 }), report({ high: '0' }), report({ total: Number.MAX_SAFE_INTEGER + 1 })]) {
  test(`malformed audit is indeterminate: ${JSON.stringify(body)}`, () => assert.equal(inspectAuditExecution(result(body)).code, 2));
}
test('empty or invalid JSON and inconsistent exit status are indeterminate', () => {
  for (const stdout of ['', '<html>503</html>', 'not-json']) assert.equal(inspectAuditExecution(result(report(), { stdout })).code, 2);
  assert.equal(inspectAuditExecution(result(report(), { status: 1 })).code, 2);
});
test('real CLI executes both scopes without a shell and rejects failed npm results', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'esa-audit-policy-'));
  try {
    const cli = path.join(dir, 'mock npm.cjs');
    writeFileSync(cli, `const expected=JSON.parse(process.env.TEST_ARGS); if(JSON.stringify(process.argv.slice(2))!==JSON.stringify(expected))process.exit(3); console.log(process.env.TEST_REPORT); process.exit(Number(process.env.TEST_EXIT));`);
    const script = fileURLToPath(new URL('../audit-baseline-gate.mjs', import.meta.url));
    for (const scope of ['production', 'all']) {
      for (const exit of [0, 2]) {
        const run = spawnSync(process.execPath, [script, ...(scope === 'all' ? ['--include-dev'] : [])], {
          encoding: 'utf8', env: { ...process.env, npm_execpath: cli, TEST_ARGS: JSON.stringify(auditArguments(scope)), TEST_REPORT: JSON.stringify(report()), TEST_EXIT: String(exit) },
        });
        assert.equal(run.status, exit === 0 ? 0 : 2, run.stdout + run.stderr);
        assert.match(run.stdout + run.stderr, new RegExp(`\\[${scope}\\]`));
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
