/**
 * Optional encrypted temporary source lease. Without a real secret, lease is denied
 * (never pretend resume works). Source is never written to report JSON.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { allowEphemeralStorage } from '@/lib/storage-policy';

export interface SourceLease {
  leaseId: string;
  documentHash: string;
  expiresAt: number;
}

interface LeaseRecord extends SourceLease {
  ownerId: string;
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

const leases = new Map<string, LeaseRecord>();
const developmentProcessKey = randomBytes(32);
const DEFAULT_SOURCE_LEASE_TTL_MS = 24 * 60 * 60_000;

type SerializedLeaseRecord = Omit<LeaseRecord, 'iv' | 'ciphertext' | 'tag'> & {
  iv: string;
  ciphertext: string;
  tag: string;
};

function durableLeaseRoot(): string | null {
  const configured = process.env.DRAWING_JOB_STORE_DIR?.trim();
  if (!configured || !isAbsolute(configured)) return null;
  const root = join(resolve(configured), 'leases');
  mkdirSync(root, { recursive: true });
  return root;
}

function leasePath(root: string, leaseId: string): string {
  if (!/^lease-[a-zA-Z0-9_-]+$/.test(leaseId)) throw new Error('DRAWING_LEASE_ID_INVALID');
  return join(root, `${leaseId}.json`);
}

function serialize(record: LeaseRecord): SerializedLeaseRecord {
  return { ...record, iv: record.iv.toString('base64'), ciphertext: record.ciphertext.toString('base64'), tag: record.tag.toString('base64') };
}

function deserialize(record: SerializedLeaseRecord): LeaseRecord {
  if (!record || typeof record.ownerId !== 'string' || typeof record.documentHash !== 'string'
    || !Number.isFinite(record.expiresAt) || typeof record.iv !== 'string' || typeof record.ciphertext !== 'string' || typeof record.tag !== 'string') throw new Error('DRAWING_LEASE_CORRUPT');
  const parsed = { ...record, iv: Buffer.from(record.iv, 'base64'), ciphertext: Buffer.from(record.ciphertext, 'base64'), tag: Buffer.from(record.tag, 'base64') };
  if (parsed.iv.length !== 12 || parsed.tag.length !== 16) throw new Error('DRAWING_LEASE_CORRUPT');
  return parsed;
}

function readLeaseRecord(leaseId: string): LeaseRecord | undefined {
  const root = durableLeaseRoot();
  if (!root) return leases.get(leaseId);
  leasePath(root, leaseId);
  try {
    return deserialize(JSON.parse(readFileSync(leasePath(root, leaseId), 'utf8')) as SerializedLeaseRecord);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    quarantineLease(root, leaseId);
    return undefined;
  }
}

/** Never log source bytes, user identities, or cryptographic material. */
function quarantineLease(root: string, leaseId: string): void {
  const quarantine = join(root, 'quarantine');
  try {
    mkdirSync(quarantine, { recursive: true, mode: 0o700 });
    renameSync(leasePath(root, leaseId), join(quarantine, `${leaseId}.${Date.now()}.${randomBytes(4).toString('hex')}.corrupt`));
    console.warn('[drawing-source-lease] quarantined corrupt record');
  } catch {
    console.warn('[drawing-source-lease] corrupt record could not be quarantined');
  }
}

let lastAutomaticPurge = 0;
function maybePurgeExpiredLeases(): void {
  if (Date.now() - lastAutomaticPurge < 60_000) return;
  lastAutomaticPurge = Date.now();
  purgeExpiredLeases();
}

function writeLeaseRecord(record: LeaseRecord): void {
  const root = durableLeaseRoot();
  if (!root) {
    leases.set(record.leaseId, record);
    return;
  }
  const destination = leasePath(root, record.leaseId);
  const temporary = `${destination}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(temporary, JSON.stringify(serialize(record)), { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, destination);
}

function deleteLeaseRecord(leaseId: string): boolean {
  const root = durableLeaseRoot();
  if (!root) return leases.delete(leaseId);
  try {
    unlinkSync(leasePath(root, leaseId));
    return true;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw cause;
  }
}

function getLeaseKey(): Buffer | null {
  const secret = process.env.DRAWING_SOURCE_LEASE_SECRET?.trim();
  if (!secret || secret.length < 16) {
    // A durable/shared repository always needs a stable cross-process key.
    if (durableLeaseRoot()) return null;
    return allowEphemeralStorage() ? developmentProcessKey : null;
  }
  if (!durableLeaseRoot() && !allowEphemeralStorage()) return null;
  return createHash('sha256').update(secret).digest();
}

export function isSourceLeaseAvailable(): boolean {
  return getLeaseKey() != null;
}

export function createSourceLease(
  bytes: ArrayBuffer,
  documentHash: string,
  ownerId: string,
  ttlMs = DEFAULT_SOURCE_LEASE_TTL_MS,
): SourceLease | { error: 'LEASE_STORE_UNAVAILABLE' } {
  maybePurgeExpiredLeases();
  const key = getLeaseKey();
  if (!key) return { error: 'LEASE_STORE_UNAVAILABLE' };
  if (!ownerId.trim()) throw new Error('DRAWING_LEASE_OWNER_REQUIRED');

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(bytes);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const leaseId = `lease-${documentHash.slice(0, 10)}-${randomBytes(4).toString('hex')}`;
  const expiresAt = Date.now() + ttlMs;
  writeLeaseRecord({ leaseId, documentHash, ownerId, expiresAt, iv, ciphertext, tag });
  return { leaseId, documentHash, expiresAt };
}

export function readSourceLease(leaseId: string, ownerId: string): ArrayBuffer | null {
  maybePurgeExpiredLeases();
  const key = getLeaseKey();
  const rec = readLeaseRecord(leaseId);
  if (!key || !rec || rec.ownerId !== ownerId) return null;
  if (Date.now() >= rec.expiresAt) {
    deleteLeaseRecord(leaseId);
    return null;
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, rec.iv);
    decipher.setAuthTag(rec.tag);
    const plain = Buffer.concat([decipher.update(rec.ciphertext), decipher.final()]);
    return Uint8Array.from(plain).buffer;
  } catch {
    const root = durableLeaseRoot();
    if (root) quarantineLease(root, leaseId);
    else leases.delete(leaseId);
    return null;
  }
}

export function releaseSourceLease(leaseId: string, ownerId: string): boolean {
  if (readLeaseRecord(leaseId)?.ownerId !== ownerId) return false;
  return deleteLeaseRecord(leaseId);
}

/** Test helper. */
export function _resetSourceLeasesForTests(): void {
  leases.clear();
  lastAutomaticPurge = 0;
}

export function purgeExpiredLeases(): number {
  const now = Date.now();
  let n = 0;
  const root = durableLeaseRoot();
  if (root) {
    for (const fileName of readdirSync(root)) {
      if (!/^lease-[a-zA-Z0-9_-]+\.json$/.test(fileName)) continue;
      const leaseId = fileName.slice(0, -5);
      try {
        const record = readLeaseRecord(leaseId);
        if (record && record.expiresAt <= now && deleteLeaseRecord(leaseId)) n += 1;
      } catch { console.warn('[drawing-source-lease] cleanup skipped unreadable record'); }
    }
    return n;
  }
  for (const [id, rec] of leases) {
    if (rec.expiresAt <= now) {
      leases.delete(id);
      n++;
    }
  }
  return n;
}
