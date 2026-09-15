/** Fail closed on shallow history, missing evidence or stale recorded bytes.
 * Old commit timestamps could report PASS for every path in a depth=1 checkout.
 * Historical execution receipts remain unchanged; this gate does not regenerate them. */
import { verifySnapshots } from './lib/snapshot-freshness.mjs';

const result = verifySnapshots();
console.log(`snapshot-freshness ${result.status} — ${result.message}`);
if (result.exitCode !== 0) {
  console.error('Restore full Git history and the original execution provenance.');
  console.error('If pipeline bytes changed, rerun the recorded PDF cases and record their new hashes; do not touch old results to manufacture freshness.');
}
process.exitCode = result.exitCode;
