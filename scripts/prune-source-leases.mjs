import { isAbsolute, join } from 'node:path';
import { readdir, readFile, unlink } from 'node:fs/promises';
// Operator-invoked metadata sweep. Never decrypts, logs, or removes a live source.
const root = process.env.DRAWING_JOB_STORE_DIR;
if (!root || !isAbsolute(root)) throw new Error('An absolute DRAWING_JOB_STORE_DIR is required');
const directory = join(root, 'leases');
let removed = 0, corrupt = 0;
for (const name of await readdir(directory)) {
  if (!/^lease-[A-Za-z0-9_-]+\.json$/.test(name)) continue;
  try {
    const record = JSON.parse(await readFile(join(directory, name), 'utf8'));
    if (!record || !Number.isSafeInteger(record.expiresAt) || record.expiresAt <= 0) { corrupt++; continue; }
    if (record.expiresAt <= Date.now()) { await unlink(join(directory, name)); removed++; }
  } catch (error) { if (error.code !== 'ENOENT') corrupt++; }
}
console.log(JSON.stringify({ event: 'source_lease_maintenance', expiredRemoved: removed, unreadableRecords: corrupt, at: new Date().toISOString() }));
if (corrupt) process.exitCode = 2;
