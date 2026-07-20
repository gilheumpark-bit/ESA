/**
 * Optional encrypted temporary source lease. Without a real secret, lease is denied
 * (never pretend resume works). Source is never written to report JSON.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

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

function getLeaseKey(): Buffer | null {
  if (process.env.NODE_ENV === 'production' && process.env.ESVA_ALLOW_EPHEMERAL_STORAGE !== 'true') return null;
  const secret = process.env.DRAWING_SOURCE_LEASE_SECRET?.trim();
  if (!secret || secret.length < 16) {
    // The lease map itself is process-local. Development may therefore use a
    // process-lifetime key; production must provide an explicit stable secret.
    return process.env.NODE_ENV === 'development' ? developmentProcessKey : null;
  }
  return createHash('sha256').update(secret).digest();
}

export function isSourceLeaseAvailable(): boolean {
  return getLeaseKey() != null;
}

export function createSourceLease(
  bytes: ArrayBuffer,
  documentHash: string,
  ownerId: string,
  ttlMs = 30 * 60_000,
): SourceLease | { error: 'LEASE_STORE_UNAVAILABLE' } {
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
  leases.set(leaseId, { leaseId, documentHash, ownerId, expiresAt, iv, ciphertext, tag });
  return { leaseId, documentHash, expiresAt };
}

export function readSourceLease(leaseId: string, ownerId: string): ArrayBuffer | null {
  const key = getLeaseKey();
  const rec = leases.get(leaseId);
  if (!key || !rec || rec.ownerId !== ownerId) return null;
  if (Date.now() > rec.expiresAt) {
    leases.delete(leaseId);
    return null;
  }
  const decipher = createDecipheriv('aes-256-gcm', key, rec.iv);
  decipher.setAuthTag(rec.tag);
  const plain = Buffer.concat([decipher.update(rec.ciphertext), decipher.final()]);
  return Uint8Array.from(plain).buffer;
}

export function releaseSourceLease(leaseId: string, ownerId: string): boolean {
  if (leases.get(leaseId)?.ownerId !== ownerId) return false;
  leases.delete(leaseId);
  return true;
}

/** Test helper. */
export function _resetSourceLeasesForTests(): void {
  leases.clear();
}

export function purgeExpiredLeases(): number {
  const now = Date.now();
  let n = 0;
  for (const [id, rec] of leases) {
    if (rec.expiresAt <= now) {
      leases.delete(id);
      n++;
    }
  }
  return n;
}
