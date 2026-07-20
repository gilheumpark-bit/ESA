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
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

const leases = new Map<string, LeaseRecord>();

function getLeaseKey(): Buffer | null {
  const secret = process.env.DRAWING_SOURCE_LEASE_SECRET?.trim();
  if (!secret || secret.length < 16) return null;
  return createHash('sha256').update(secret).digest();
}

export function isSourceLeaseAvailable(): boolean {
  return getLeaseKey() != null;
}

export function createSourceLease(
  bytes: ArrayBuffer,
  documentHash: string,
  ttlMs = 30 * 60_000,
): SourceLease | { error: 'LEASE_STORE_UNAVAILABLE' } {
  const key = getLeaseKey();
  if (!key) return { error: 'LEASE_STORE_UNAVAILABLE' };

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(bytes);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const leaseId = `lease-${documentHash.slice(0, 10)}-${randomBytes(4).toString('hex')}`;
  const expiresAt = Date.now() + ttlMs;
  leases.set(leaseId, { leaseId, documentHash, expiresAt, iv, ciphertext, tag });
  return { leaseId, documentHash, expiresAt };
}

export function readSourceLease(leaseId: string): ArrayBuffer | null {
  const key = getLeaseKey();
  const rec = leases.get(leaseId);
  if (!key || !rec) return null;
  if (Date.now() > rec.expiresAt) {
    leases.delete(leaseId);
    return null;
  }
  const decipher = createDecipheriv('aes-256-gcm', key, rec.iv);
  decipher.setAuthTag(rec.tag);
  const plain = Buffer.concat([decipher.update(rec.ciphertext), decipher.final()]);
  return Uint8Array.from(plain).buffer;
}

export function releaseSourceLease(leaseId: string): void {
  leases.delete(leaseId);
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
