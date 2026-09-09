/** Critical/high zero-tolerance gate; production by default, all scopes explicitly. */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { auditArguments, auditScopeFromArgs, inspectAuditExecution } from './lib/audit-policy.mjs';

let scope;
try { scope = auditScopeFromArgs(process.argv.slice(2)); }
catch (error) { console.error(`audit-gate: ${error.message}`); process.exit(2); }
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('audit-gate: npm 실행 경로가 없습니다. npm run gate:audit 또는 gate:audit:all로 실행하세요.');
  process.exit(2);
}
// Execute the actual npm CLI with Node, including on Windows; never invoke a shell.
const result = spawnSync(process.execPath, [npmCli, ...auditArguments(scope)], {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120_000,
});
const decision = inspectAuditExecution(result);
const output = `audit-gate ${decision.code === 0 ? 'PASS' : decision.code === 1 ? 'FAIL' : 'INDETERMINATE'} [${scope}] — ${decision.message}`;
if (decision.code === 0) console.log(output);
else console.error(output);
process.exitCode = decision.code;
